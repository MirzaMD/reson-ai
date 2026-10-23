# 01 — PERSON 1: Solver, Validation, Optimizer, API, LLM Backend

Read `00_MASTER_CONTEXT.md` first. The JSON contract in section 6 there is law. Math is in section 7 there; this file adds implementation detail.

You own **correctness**. If your numbers are wrong, nothing else matters. Judges score physics, validation and speed.

---

## 1. Your deliverables

1. `POST /analyze`, `/response_at`, `/optimize`, `/validate`, `/agent/chat`, `GET /presets`, `GET /health`
2. Frame solver (mesh, assemble, modes, harmonic full + ROM, findings, stress)
3. Validation suite V1–V7 + benchmark B1, runnable as `pytest` and as `/validate`
4. Optimizer with ranked, verified candidates
5. LLM agent backend (ops, validator, prompts, fallback)
6. Final validation table + benchmark numbers for the slides

## 2. Setup

```
backend/
  app/
    main.py                # FastAPI, CORS enabled for http://localhost:5173
    schemas.py             # pydantic models for design, analysis, ops
    presets.py             # materials, mounts, components, structure presets
    solver/
      mesh.py              # design -> nodes/elements (split at component positions)
      elements.py          # frame_element(), transform()
      assemble.py          # K, M, C, DOF maps, supports, components
      modal.py             # eigh, mass-normalize, mode shapes
      harmonic.py          # full solve, ROM solve, sweeps
      post.py              # accel, force transmission, stress, findings, campbell
    optimizer/
      optimize.py
    agent/
      provider.py          # LLM adapter (gemini/groq/openrouter)
      ops.py               # op schema, apply_ops(), validate()
      prompts.py
      fallback.py
    validation/
      analytical.py        # reference formulas
      suite.py
  tests/
  requirements.txt         # fastapi uvicorn numpy scipy pydantic httpx python-dotenv
```
Run: `uvicorn app.main:app --reload --port 8000`.

## 3. Hours 0–2: mock first, unblock Person 2

Create `/analyze` returning a **hard-coded, contract-valid JSON** (use the example from master 6.2, extended to ~40 mesh nodes with fake smooth amplitudes). Share the file as `mock_analyze.json`. Person 2 builds against it. Replace internals later without changing shape. If you need to change the contract, tell Person 2 immediately and update the master file.

## 4. Solver implementation

### 4.1 Elements (`elements.py`)

```python
import numpy as np

def frame_element(E, A, I, rho, L):
    k = np.zeros((6, 6)); m = np.zeros((6, 6))
    a = E * A / L
    k[np.ix_([0, 3], [0, 3])] = a * np.array([[1, -1], [-1, 1]])
    idx = [1, 2, 4, 5]
    b = E * I / L**3
    k[np.ix_(idx, idx)] = b * np.array([
        [12,   6*L,  -12,   6*L],
        [6*L, 4*L**2, -6*L, 2*L**2],
        [-12, -6*L,   12,  -6*L],
        [6*L, 2*L**2, -6*L, 4*L**2]])
    m[np.ix_([0, 3], [0, 3])] = rho * A * L / 6 * np.array([[2, 1], [1, 2]])
    m[np.ix_(idx, idx)] = rho * A * L / 420 * np.array([
        [156,   22*L,   54,  -13*L],
        [22*L, 4*L**2, 13*L, -3*L**2],
        [54,   13*L,  156,  -22*L],
        [-13*L, -3*L**2, -22*L, 4*L**2]])
    return k, m

def transform(c, s):
    R = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    T = np.zeros((6, 6)); T[:3, :3] = R; T[3:, 3:] = R
    return T
# global element matrices: Kg = T.T @ k @ T ; Mg = T.T @ m @ T
```

### 4.2 Section properties
- `rect(w,h)`: A = w·h, I = w·h³/12 (h is the in-plane bending depth)
- `circ(d)`: A = πd²/4, I = πd⁴/64
- `tube(d,t)`: do = d, di = d−2t, A = π(do²−di²)/4, I = π(do⁴−di⁴)/64
- `box(w,h,t)`: outer minus inner rectangle
- Return also `c` = half-depth for stress.

### 4.3 Mesh and DOFs
- Convert design → list of mesh nodes (ids stable, include `member` and `s`) and elements.
- For each member, collect component `s` values, sort, split the member there, subdivide each part so total elements per member ≈ `n_elements_per_member`.
- DOF numbering: beam node `i` → `[3i, 3i+1, 3i+2]`; component `j` → extra DOF after beam DOFs.
- Keep a map `component_id → dof index` and `component_id → beam vertical dof`.

### 4.4 Assembly (`assemble.py`)
1. Loop elements, add `Kg`, `Mg` into global dense arrays (N ≈ 300–800, dense is fine).
2. For each component: `M[yc,yc] += m_c`; `K` and `C` mount terms between `yc` and the beam vertical DOF (see master 7.4). `c = 2·ζ·√(k·m_c)`.
3. Supports: `fixed` → eliminate all 3 DOF; `pinned` → eliminate u,v; `roller` → eliminate v; `spring` → add `kx, ky, kr` to diagonal; `free` → nothing.
4. Eliminate constrained DOFs by slicing `free = np.setdiff1d(all, fixed)`. Keep the mapping to restore full vectors.
5. Beam Rayleigh damping `C_beam = αM_beam + βK_beam` using the **beam-only** matrices (before adding components), with α, β from two target frequencies (use first mode and ~1.5× max excitation frequency, fall back to ζ-only defaults).
6. Assert `np.allclose(K, K.T)`, `np.allclose(M, M.T)` and eigenvalues of M > 0.

### 4.5 Modal (`modal.py`)
```python
from scipy.linalg import eigh
w2, Phi = eigh(K, M)                 # ascending
w2 = np.clip(w2, 0, None); f = np.sqrt(w2) / (2*np.pi)
# mass normalise: Phi^T M Phi = I (eigh already returns this for generalized problems)
```
- Drop modes below ~1 Hz if they are rigid-body-like (report them as "rigid-body" only if the hover springs are very weak).
- Keep `r` modes with `f ≤ 1.5·f_excite_max` (min 8, max 20).
- Mode labels (nice for the UI): classify by participation (mount mode if component DOF dominates, else bending mode n).

### 4.6 Harmonic (`harmonic.py`)
Force vector: for each excited component with unbalance `me` and frequency `ω`: `F[yc] = me·ω²` (complex amplitude, phase 0; multiple motors can have phase offsets, default 0). For orders `n`: `ω = n·2π·RPM/60`, evaluate separately and take the worst case (or report the order that dominates).

```python
def full_solve(K, C, M, F, omegas):
    X = np.empty((len(omegas), K.shape[0]), complex)
    for i, w in enumerate(omegas):
        X[i] = np.linalg.solve(K + 1j*w*C - w**2*M, F(w))
    return X

def rom_solve(K, C, M, F, omegas, Phi_r):
    Kr, Cr, Mr = Phi_r.T@K@Phi_r, Phi_r.T@C@Phi_r, Phi_r.T@M@Phi_r
    Q = np.empty((len(omegas), Phi_r.shape[1]), complex)
    for i, w in enumerate(omegas):
        Q[i] = np.linalg.solve(Kr + 1j*w*Cr - w**2*Mr, Phi_r.T @ F(w))
    return Q @ Phi_r.T   # back to full DOF
```
Use ROM for sweeps/optimizer and full solve for validation and benchmark. Vectorize across frequencies with `np.linalg.solve` on stacked arrays when possible.

**Report acceleration as RMS in g** unless the UI says peak; `a_peak = ω²|X|`, `a_rms = a_peak/√2`. Use one convention everywhere and state it in findings (`"basis":"rms"`). Component limits are compared on the same basis.

### 4.7 Post-processing (`post.py`)
- `component_accel_g[c][rpm]`, `component_disp_mm`, `transmitted_force_n` = `|(k + iωc)(y_c − v_b)|`.
- `node_amp_mm` on ~100 coarse RPM points for the heatmap.
- **Campbell:** natural frequencies (from modal) + excitation lines for each order and blade-pass.
- **Findings (rule-based, deterministic):**
  1. `resonance`: any mode with `|f_mode − f_exc|/f_mode < 0.15` for some RPM in range. Severity critical if < 0.05.
  2. `limit_exceeded`: sensitive component peak accel > `limit_g`. Include RPM, value, limit, nearest mode, and position (`member`, `s`).
  3. `stress`: max element stress ratio > 0.5 warning, > 0.8 critical.
  4. `mount_amplification`: motor mount natural frequency vs excitation: if `r = f_exc/f_mount < √2` anywhere in range, mounts are amplifying.
  5. `displacement`: > a configurable clearance (default 5 mm) warning.
  Every finding includes numbers. The LLM only paraphrases them.
- **Stress:** per element `f_l = k_l @ T @ u_e`, then `σ = |M|·c/I + |N|/A`. Use the worst across the sweep.

### 4.8 `/response_at`
Single RPM, full complex node data (ux, uy, rot) and component `uy`. Use the same ROM. The frontend animates `Re(X e^{iωt})`.

## 5. Validation suite (do early, do not skip)

`validation/analytical.py`:

```python
def ss_beam_f(n, E, I, rho, A, L):   return (n*np.pi)**2/(2*np.pi*L**2)*np.sqrt(E*I/(rho*A))
BETA_CANT = [1.8751, 4.6941, 7.8548]
BETA_FF   = [4.7300, 7.8532, 10.9956]   # free-free and fixed-fixed
def beam_f(beta, E, I, rho, A, L):    return beta**2/(2*np.pi*L**2)*np.sqrt(E*I/(rho*A))
def sdof_transmissibility(r, zeta):   return np.sqrt((1+(2*zeta*r)**2)/((1-r**2)**2+(2*zeta*r)**2))
```

Tests (pytest, all must pass, tolerances from master section 9):
- V1 simply supported: 40 elements, modes 1–3, < 1%.
- V2 cantilever and V3 fixed-fixed: same.
- V4 single mass on spring on rigid base (use a very stiff beam fixed) compare `f=√(k/m)/2π` and transmissibility curve.
- V5 2-mass chain (use two components on a very stiff beam) vs closed-form eigenvalues.
- V6 mesh convergence table (5/10/20/40 elements): print error vs elements.
- V7 ROM vs full harmonic solve peak error < 2% (use r=12).
- B1 benchmark: time full solve vs ROM over 400 frequency points (`time.perf_counter`), report ms and speedup. If Ansys/CalculiX time is available from a teammate, add it.

`/validate` runs these and returns the table (with `pass` booleans). Also write the table to `validation_report.md` for the slides.

Common bugs checklist: kN/m vs N/m, mm vs m, using `h` and `w` swapped in I, eliminating DOFs but forgetting to map back, using `eig` instead of `eigh`, forgetting 1j·ω·C sign, applying force to the beam DOF instead of the component DOF, treating degrees as radians.

## 6. Optimizer (`optimizer/optimize.py`)

- Variables (skip locked ones): per component `log10(kv)` within preset bounds [log10(5e3), log10(5e5)]; `zeta` [0.02, 0.3]; `s` within member bounds (keep ≥ 0.05 away from supports, nodes get re-meshed so use a **coarse sweep + local polish**, or restrict `s` to a fixed grid of positions so the mesh need not change; simplest: precompute meshes for a few candidate `s` values or use a fine uniform mesh and snap `s` to nodes); optional extra added mass at the sensor (0–0.1 kg).
- Objective per master 7.12; normalize each term to ~1.
- Use `scipy.optimize.differential_evolution(popsize=12, maxiter≈40, seed=1, polish=False)`.
- Speed: precompute modes only when stiffness changes; the ROM solve over ~80 RPM points keeps one evaluation ~5–20 ms.
- Return top 3 distinct candidates (e.g. best overall; best with only mount changes; best with only position changes) so the UI can show options. Each candidate: list of human-readable `changes`, the patched design, metrics before and after, `reduction_pct`. Always **re-run `/analyze` on the candidate with the full solver** before returning metrics.
- Sanity: if the optimizer can't improve by > 5%, say so; do not fabricate.

## 7. LLM agent backend (`agent/`)

### 7.1 Provider adapter
```python
class LLM:
    def chat_json(self, system: str, messages: list[dict], schema: dict) -> dict: ...
```
Implementations for Gemini / Groq / OpenRouter via `httpx`. Env vars in `.env`. Timeout 20 s, 1 retry. Check current free-tier rate limits today.

### 7.2 Op schema (`ops.py`)
Closed vocabulary (master 6.6). Each op has pydantic arg models. `apply_ops(design, ops)` returns a **new** design; raise `OpError` with a message on invalid references (unknown member, `s` outside 0–1, absurd values). Return `warnings` for clamped values. Never mutate in place.

Validation ranges: member length 0.01–5 m; section dims 1 mm–0.5 m; mass 0.001–100 kg; mount `kv` 1e3–1e8; RPM 10–60000; max 50 members, 20 components.

### 7.3 Prompt design (`prompts.py`)
System prompt contains: role, the op vocabulary with arg shapes, presets list (names only), rules ("emit only incremental ops", "ask one clarifying question if the request is ambiguous", "never invent numbers for results", "use SI units"), and 2 few-shot examples (build from scratch; continue from existing design). User message includes the compact current design (strip `ui`, round floats) and, in fix/explain mode, the findings JSON.

Response schema: `{"assistant_message": str, "ops": [...], "action": null|"run_analysis"|"run_optimization", "clarifying_question": null|str}`.

### 7.4 Modes
- **build:** design may be empty. Prefer `load_preset` first, then edits.
- **continue:** only incremental ops against the current design (this is "pick up where the user left").
- **fix:** receives findings; may return `action:"run_optimization"` plus a message.
- **explain:** receives `analysis` + `candidates`, returns Markdown-light text with numbers copied from the JSON. After generation, check that every number in the text appears in the input JSON (simple regex check); if not, regenerate once, else use the template fallback.

### 7.5 Fallback (`fallback.py`)
Keyword rules ("drone/quad" → drone preset, "cantilever", "motor", "camera", "aluminium") and template explanations built from findings. This must work with no network.

### 7.6 Cache
Cache responses for the rehearsed demo prompts (key = hash of prompt + design) so the demo is instant and offline-safe.

## 8. Timeline (your column)

| Hours | Tasks | Done when |
|---|---|---|
| 0–2 | Skeleton, mock `/analyze`, presets, schemas | Person 2 fetches mock JSON |
| 2–5 | `elements`, `mesh`, `assemble`, supports; `eigh` | V1, V2, V3 pass |
| 5–8 | Real `/analyze` for bare beam (modes only), then components + mounts | V4, V5 pass |
| 8–12 | Harmonic full + ROM, accel/force/stress, findings, campbell | V7 pass, drone preset results look sane |
| 12–14 | `/response_at`, `/validate`, benchmark numbers | Table printed |
| 14–18 | Optimizer + candidate verification | 3 candidates on the drone demo |
| 18–21 | Agent: provider, ops, prompts, fallback, cache | 3 demo prompts work, fallback works |
| 21–24 | Slides: validation + benchmark; bug fixing; rehearsal | Table slide ready |

## 9. Sanity checks for the drone demo

- Hover-support springs (1–2 kN/m) at the center node; base natural frequency of the body on supports should be low (≲ 5 Hz) and must not dominate the sweep.
- With motors at 1000–12000 RPM (16.7–200 Hz), expect arm bending modes in tens to a few hundred Hz for ~20 cm CFRP/aluminium arms. If you get modes in kHz, check units; if you get < 1 Hz for the arm, you probably used mm.
- Camera mount (m=0.15 kg, k=5e4 N/m) → mount frequency `√(5e4/0.15)/2π ≈ 92 Hz`. Use such hand calculations to cross-check outputs.
- Design the demo so a **clear problem exists** (e.g. 1× excitation crosses a mode within the range) and the optimizer has a real fix. Tune the preset parameters until this happens naturally; document the final preset numbers.

## 10. Acceptance checklist

- [ ] V1–V7 pass, table saved
- [ ] `/analyze` on the drone preset < 500 ms (target < 100 ms)
- [ ] Findings include RPM, position, mode, numbers
- [ ] `/optimize` returns verified candidates; reduction reported from a full re-run
- [ ] `/agent/chat` returns valid patched designs; fallback works offline
- [ ] `/health` and CORS work; JSON matches the contract
- [ ] Benchmark numbers recorded (full vs ROM; Ansys if available)
