# 00 — MASTER CONTEXT: "ResonAI" Intelligent Vibration Simulator

Working name: **ResonAI** (rename freely). Read this file fully, then read your own file (`01_PERSON1_SOLVER_BACKEND.md` or `02_PERSON2_FRONTEND_3D.md`).

---

## 1. One-paragraph pitch

ResonAI is a web-based **pre-FEM triage simulator** for structures carrying vibrating components (motors, fans, pumps) and vibration-sensitive components (cameras, gyros, PCBs). The user builds a beam/frame structure (or just *describes* it to an AI agent), picks materials, mounts and components. A fast reduced-order solver predicts displacement, acceleration, resonances and stress across the whole speed range in milliseconds, shows exactly **where, at which RPM, and why** the design fails, then **automatically searches for a better design** (mount stiffness, damping, component position, optional tuned mass damper), proves the fix by re-simulating, and shows **original vs improved side by side in 3D**. An LLM agent builds and edits the model and explains the verified results. The LLM never computes physics.

## 2. The problem statement (Problem 15), mapped to our features

| Problem statement requirement | Our feature | Evidence we show |
|---|---|---|
| Model-based, multibody dynamic simulation | Frame/beam FEM + lumped components on spring-damper mounts | Model JSON, mesh view |
| Predict and evaluate vibration of 2+ isolated systems on a shared enclosure | Coupled solve; every component's response reported | Per-component results, findings |
| Line-body modeling to simplify computation, cut simulation time | 1D Euler-Bernoulli beam elements + modal reduction | **Benchmark table** (time, N× faster) |
| Capture coupling: transmitted forces, structure-borne vibration, resonance | Full coupled matrices, transmitted force at mounts, modes and Campbell diagram | Mode shapes, force transmission plot |
| Predict displacement, acceleration, frequency response | Harmonic sweep over RPM/frequency | FRF plots, heatmap |
| Parametric studies: mounts, stiffness, damping, mass distribution | Sweep engine + optimizer | Heatmaps, before/after |
| Validate vs analytical or high-fidelity model | Validation suite (+ optional Ansys/CalculiX) | **Validation table** |
| Recommend design changes to minimize transmission and avoid resonance | Optimizer + rule-based findings + LLM explanation | Side-by-side, % reduction |

**Judges score the physics, the validation and the speed benchmark. Protect those hours.**

## 3. Honest feasibility verdict

- **Buildable?** Yes, if scope is controlled. The risk is breadth (solver + 3D + builder + agent + optimizer + validation for two people in 24 h), not any single piece. Every piece is individually standard.
- **Can it attract judges?** Yes. Visual 3D + AI agent + verified numbers is rare in student hackathons. Most teams will show a plot.
- **"Unlike any other simulation software" — do NOT claim this.** Ansys and others have parametric optimization and are adding AI assistants. Judges who know the field will challenge it. Defensible claim: *"Existing tools need expert setup and minutes-to-hours per run. ResonAI is an early-design triage tool: describe a structure in plain language, get a verified risk diagnosis and a better design in seconds, with reasoning. Use it before expensive FEM, then take the shortlisted design to Ansys."*
- **Biggest risks:** (1) solver bugs from units/boundary conditions, (2) 3D polish eating time, (3) LLM building arbitrary structures unreliably, (4) skipping validation. Mitigations are in section 14.

## 4. Scope tiers (strict)

**Tier 1 — MUST (demo fails without these)**
1. Planar frame solver (nodes + beam elements, 3 DOF/node) with supports.
2. Components on mounts (mass + vertical spring-damper), unbalance excitation, RPM sweep.
3. Outputs: modes, FRF, displacement/acceleration per node and component, findings.
4. Validation suite vs analytical formulas (table on a slide) + speed benchmark.
5. Builder UI: pick preset/beam, dimensions, material, add components/mounts, supports.
6. 3D view: orbit, grid/mesh look, motors that spin with RPM label, vibration animation, heatmap contour.
7. Analysis report panel (findings with RPM, location, severity).
8. Optimizer + original vs improved comparison.

**Tier 2 — SHOULD**
9. LLM agent: build from prompt and continue a half-built design (ops-based).
10. Campbell diagram and vibration-vs-position-vs-RPM heatmap.
11. Stress check (bending stress from element end moments).
12. LLM-written explanation panel on solver findings.
13. Ansys Student/CalculiX comparison for one case.

**Tier 3 — STRETCH (only after everything above works)**
14. Tuned mass damper suggestion. 15. Pi + phone accelerometer measured vs predicted overlay. 16. Stepped sections, more presets. 17. Export PDF report.

**CUT LIST, in this order, if time slips:** 17 → 15 → 14 → 13 → 11 → 16. Never cut 4 (validation) or 8.

## 5. System architecture

```
┌──────────────────────── Frontend (React + Vite + TS) ────────────────────────┐
│ Builder UI ── Zustand store (design JSON, results, selection, rpm) ── Chat   │
│   3D viewer (React Three Fiber + drei)   Plots (Plotly)   Findings panel     │
└──────────────┬───────────────────────────────────────────────┬──────────────┘
               │ REST/JSON                                     │
┌──────────────▼───────────────────────────────────────────────▼──────────────┐
│ Backend (Python FastAPI)                                                      │
│  /analyze  /response_at  /optimize  /validate  /agent/chat  /presets          │
│  solver/: mesh → matrices → modal ROM → harmonic sweep → findings             │
│  optimizer/: scipy differential_evolution over ROM                            │
│  agent/: LLM provider adapter, tool/ops schema, op validator, fallbacks       │
└───────────────────────────────────────────────────────────────────────────────┘
```

Key principle: **the 3D scene is a display layer. The solver outputs numbers. The LLM only edits the design JSON (via validated ops) and explains solver output.**

## 6. Shared data contract (agree in hour 0–1, then freeze)

Units in JSON are **SI** (m, kg, N, Pa, s). The UI may show mm and RPM but converts. Internally frequencies in Hz, rotation speed in RPM.

### 6.1 Design (frontend → backend)

```json
{
  "name": "Quad diagonal arm",
  "plane": "xy",
  "nodes": [{"id":"n1","x":-0.15,"y":0.0},{"id":"n2","x":0.0,"y":0.0},{"id":"n3","x":0.15,"y":0.0}],
  "members": [
    {"id":"m1","n1":"n1","n2":"n2","material":"cfrp",
     "section":{"type":"rect","w":0.016,"h":0.004}},
    {"id":"m2","n1":"n2","n2":"n3","material":"cfrp",
     "section":{"type":"rect","w":0.016,"h":0.004}}
  ],
  "supports": [{"node":"n2","type":"spring","ky":2000,"kx":2000,"kr":0}],
  "components": [
    {"id":"c1","kind":"motor","member":"m1","s":0.0,"mass":0.055,
     "mount":{"preset":"rubber_medium","kv":100000,"zeta":0.08},
     "excitation":{"type":"unbalance","rpm_min":1000,"rpm_max":12000,"me":2e-6,"orders":[1],"blades":2}},
    {"id":"c2","kind":"camera","member":"m1","s":0.9,"mass":0.15,
     "mount":{"preset":"silicone_gel","kv":50000,"zeta":0.15},
     "limit_g":0.5}
  ],
  "analysis": {"rpm_min":500,"rpm_max":12000,"n_points":400,"beam_zeta":0.02,"n_elements_per_member":20}
}
```
- `member` + `s` (0..1 fraction along member from n1 to n2) positions a component. Backend splits the member at `s` so the node is exact.
- `section.type`: `rect` (w,h), `circ` (d), `tube` (d,t), `box` (w,h,t). Bending is about the axis that moves in-plane; for `rect`, `h` is the in-plane (bending) depth: I = w·h³/12.
- Components in the solver have **one vertical DOF** on the mount (MVP). Excitation acts vertically.
- `material` is a key into the shared materials table (section 8).
- Display-only fields allowed anywhere: `ui: {...}` (backend ignores unknown fields under `ui`).

### 6.2 `/analyze` response (backend → frontend)

```json
{
  "meta": {"n_dof":183,"n_modes_kept":12,"solve_ms":14.2,"method":"rom"},
  "mesh_nodes": [{"id":"n1","x":-0.15,"y":0,"member":"m1","s":0.0}],
  "modes": [{"i":1,"f_hz":42.7,"shape":[[0.0,0.01],[0.0,0.2]],"note":"rigid-body-like on supports"}],
  "sweep": {
    "rpm":[500,...], "freq_hz":[8.3,...],
    "node_amp_mm":[[...],[...]],          
    "component_accel_g":{"c1":[...],"c2":[...]},
    "component_disp_mm":{"c1":[...],"c2":[...]},
    "transmitted_force_n":{"c1":[...]}
  },
  "campbell": {"mode_freqs_hz":[42.7,118.0],"lines":[{"label":"1x motor","order":1}]},
  "components": [{"id":"c2","peak_accel_g":1.8,"at_rpm":4200,"limit_g":0.5,"status":"critical"}],
  "findings": [
    {"id":"f1","severity":"critical","type":"limit_exceeded","component":"c2",
     "rpm":4200,"value":1.8,"limit":0.5,"mode":2,"mode_f_hz":70.1,
     "position":{"member":"m1","s":0.9},"detail":"1x excitation at 4206 RPM is within 0.1% of mode 2"}
  ],
  "max_stress_mpa": {"value":41.0,"member":"m1","at_rpm":4200,"yield_mpa":240,"ratio":0.17}
}
```
- `node_amp_mm` shape: `[n_rpm_coarse][n_mesh_nodes]` (coarse = ~100 RPM points) for the heatmap.
- `status`: `ok | warning | critical`.

### 6.3 `/response_at` (for animation at a chosen RPM)

Request `{design, rpm}` → response
```json
{"rpm":4200,"omega":439.8,"nodes":[{"id":"n1","ux":[re,im],"uy":[re,im],"rot":[re,im]}],
 "components":[{"id":"c1","uy":[re,im]}]}
```
Frontend animates `u(t) = Re(X·e^{iωt})` with a visual slow-down and an exaggeration slider.

### 6.4 `/optimize`

Request `{design, locks:{positions:false,mounts:false,damping:false}, objective:"min_sensor_accel", budget:{max_evals:2000}}`
Response `{candidates:[{rank,changes:[{path,from,to,label}], design, metrics_before, metrics_after, reduction_pct}], best_index, solve_ms}`

### 6.5 `/validate`
No body → `{"cases":[{"name","reference","ours","error_pct","pass"}],"benchmark":{"full_ms","rom_ms","speedup","error_pct"}}`

### 6.6 `/agent/chat`

Request
```json
{"mode":"build|continue|fix|explain","design":{...},"analysis":{...optional},
 "messages":[{"role":"user","content":"add a camera at the center and make arms aluminium"}]}
```
Response
```json
{"assistant_message":"Added a camera ...","ops":[{"op":"set_material","args":{"member":"all","material":"aluminium_6061"}}],
 "design":{...patched, validated...},"warnings":[]}
```
Op list (closed vocabulary, backend validates every op): `load_preset, add_node, add_member, remove_member, set_section, set_material, set_support, add_component, move_component, set_component, remove_component, set_mount, set_excitation, set_analysis`. `run_analysis` and `run_optimization` are triggered by the UI or by returning `{"action":"run_analysis"}`.

### 6.7 Coordinates
Solver plane = (x, y), y is vertical (thrust/vibration direction). Three.js mapping: `(x, y, 0)`. Symmetric copies (drone) are rotated about the Y axis in the viewer only.

## 7. Physics and math (everything involved)

### 7.1 Model
Structure = nodes + beam members (line bodies). Each member is subdivided into elements (default 20/member, plus a node inserted at each component). Each node has 3 DOF: axial `u`, transverse `v`, rotation `θ`. Euler-Bernoulli beam theory (valid for length/depth ≳ 10; state this limitation).

### 7.2 Element matrices (local, DOF order `[u1,v1,θ1,u2,v2,θ2]`)
With E, A, I, ρ, length L:

- Axial stiffness `EA/L·[[1,-1],[-1,1]]`, axial mass `ρAL/6·[[2,1],[1,2]]`.
- Bending stiffness `EI/L³ ·`
  ```
  [ 12   6L   -12   6L ]
  [ 6L  4L²   -6L  2L² ]
  [-12  -6L    12  -6L ]
  [ 6L  2L²   -6L  4L² ]
  ```
- Bending consistent mass `ρAL/420 ·`
  ```
  [ 156   22L    54   -13L ]
  [ 22L   4L²   13L   -3L² ]
  [ 54    13L   156   -22L ]
  [-13L  -3L²  -22L    4L² ]
  ```
- Rotate to global: `k_g = Tᵀ k_l T`, `T = blockdiag(R,R)`, `R = [[c,s,0],[-s,c,0],[0,0,1]]`, `c=cosα, s=sinα` (α = member angle from global x).

### 7.3 Assembly and constraints
Assemble global `K`, `M` (sparse or dense; ~300–600 DOF is tiny, dense is fine). Fixed/pinned DOFs are **eliminated** (remove rows/columns). Free structures (drone in flight): use weak support springs (e.g. 1e3 N/m) at the center body so the matrix is non-singular; document it as "hover support".

### 7.4 Components and mounts
Component = lumped mass `m_c` with its own vertical DOF `y_c`. It connects to the beam node vertical DOF `v_b` through a spring `k` and dashpot `c = 2ζ√(k·m_c)`:
```
K += k·[[ 1,-1],[-1, 1]]   on DOFs (y_c, v_b)
C += c·[[ 1,-1],[-1, 1]]
M[y_c,y_c] += m_c
```
Rigid mounting = very large k (1e8) — but warn about conditioning. Every component therefore adds one DOF, and the coupling between components happens through the beam.

### 7.5 Damping
Beam: Rayleigh `C_beam = αM + βK`, with `α = 2ζω₁ω₂/(ω₁+ω₂)`, `β = 2ζ/(ω₁+ω₂)` for target ζ (default 0.02 metal/CFRP, 0.05 for plastics) over the chosen two modes bracketing the operating band. Add mount dashpots explicitly. Without damping, resonance peaks go to infinity.

### 7.6 Modal analysis
Solve `K φ = ω² M φ` with `scipy.linalg.eigh(K, M)`. `f = ω/2π`. Mass-normalize `φᵀMφ = 1`. Keep modes up to ~1.5× the max excitation frequency (or 10–15 modes). Mode shapes are displayed in 3D and give the "position vs RPM" understanding.

### 7.7 Excitation
Rotating unbalance: `F = (m·e)·ω²` where `ω = 2π·RPM/60` and `m·e` is the unbalance (kg·m). Typical small BLDC motor: ~1e-6 kg·m (1 g·mm). Force grows with ω², so a constant-force model gives wrong resonance peaks. Orders: `1×` (rotation), `2×`, and blade pass `blades×`: excitation frequency `f = order·RPM/60`. For multiple orders, evaluate each and report the worst.

### 7.8 Harmonic response
`(K + iωC − ω²M)·X(ω) = F(ω)`. Displacement amplitude `|X|`, acceleration amplitude `ω²|X|`, in g: divide by 9.81. Define clearly whether you report peak or RMS (`RMS = peak/√2`) and use the same everywhere. **Full solve** (all DOF) is the reference. **Reduced solve:** `X ≈ Φ_r q`, `(K_r + iωC_r − ω²M_r) q = F_r` with `K_r = Φᵀ K Φ` etc. (r ≈ 10–15; C_r projected, not assumed diagonal). This is the "reduced simulation time" proof.

### 7.9 Force transmission and isolation
Force into the structure from a mount: `F_T = |k(y_c − v_b) + iωc(y_c − v_b)|`. SDOF reference (used in validation): transmissibility
`T = √((1+(2ζr)²) / ((1−r²)² + (2ζr)²))`, `r = ω/ω_n`. Isolation only works for `r > √2`; below that mounts amplify. This is why "softer mount" fixes work only if natural frequency drops far enough below the operating range.

### 7.10 Campbell diagram
Because structural natural frequencies don't change with RPM here, lines are flat. Excitation lines: `f = order·RPM/60`. Crossings = critical speeds. Rule: flag any crossing, and any natural frequency within **±15%** of an excitation line inside the operating range.

### 7.11 Stress
From node displacements get local element end forces `f_l = k_l·T·u`. Bending stress `σ = M·c/I + N/A` (c = half depth). Compare to yield and to an endurance fraction (approx. 0.3·yield for rough high-cycle screening; label as screening only).

### 7.12 Optimization
Variables: mount stiffness (log scale), mount damping ratio, component position `s` along its member, optional extra mass, optional TMD. Bounds from presets. Objective:
```
J = w1·max_rpm RMS_accel(sensitive comps)/limit
  + w2·Σ resonance_proximity_penalty
  + w3·max_stress_ratio
  + w4·(added_mass/limit) 
```
Method: `scipy.optimize.differential_evolution` (gradient-free, robust) on the **reduced model** — each evaluation takes milliseconds. Re-run the full analysis on the winner and report real before/after numbers. Respect user locks.

### 7.13 Tuned mass damper (stretch)
Den Hartog: mass ratio `μ = m_a/m_modal`, `f_opt = f_n/(1+μ)`, `ζ_opt = √(3μ/(8(1+μ)³))`. Place at the largest-amplitude point of the target mode. Adds one DOF.

### 7.14 Stated limitations (say these out loud, it builds trust)
Planar model with symmetry for the drone; Euler-Bernoulli; linear small displacements; lumped components; constant damping; unbalance forces vertical only in MVP. Extension path: 3D frame (6 DOF/node), Timoshenko beams, shell parts.

## 8. Shared presets (illustrative values, label them as such in the UI)

**Materials** (E Pa, ρ kg/m³, yield MPa): steel (200e9, 7850, 250), aluminium_6061 (69e9, 2700, 240), titanium (110e9, 4500, 880), cfrp quasi-isotropic (70e9, 1600, 600), abs_plastic (2.3e9, 1050, 40).

**Mounts** (vertical k N/m, ζ): rubber_soft (2e4, 0.10), rubber_medium (1e5, 0.08), silicone_gel (5e4, 0.15), foam (1e4, 0.20), steel_spring (5e4, 0.005), wire_rope (8e4, 0.12), rigid (1e8, 0.01).

**Components:** motor (BLDC 2212: 0.055 kg, 1000–12000 RPM, me=2e-6), fan (0.1 kg, me=5e-6), pump (0.8 kg, me=2e-5, 1500–3500 RPM), compressor (3 kg, me=1e-4), camera (0.15 kg, limit 0.5 g), gyro/IMU (0.005 kg, limit 1 g), flight controller PCB (0.03 kg, limit 1 g), battery (0.25 kg, passive), generic mass.

**Presets:** quad drone diagonal (motor–arm–body–arm–motor, symmetry ×2), simply supported beam, cantilever, fixed-fixed, L-frame, portal frame, box frame.

## 9. Validation plan (a slide in the pitch)

| # | Case | Reference | Target |
|---|---|---|---|
| V1 | Bare simply supported beam, modes 1–3 | `f_n = (nπ)²/(2πL²)·√(EI/ρA)` | < 1% |
| V2 | Bare cantilever, modes 1–3 | `β_nL = 1.875, 4.694, 7.855`; `f_n = (β_nL)²/(2πL²)·√(EI/ρA)` | < 1% |
| V3 | Free-free / fixed-fixed beam | `β_nL = 4.730, 7.853, 10.996` | < 1% |
| V4 | One mass on a spring on a rigid support | SDOF `f=√(k/m)/2π`, transmissibility formula | < 0.5% |
| V5 | 2-mass spring-dashpot chain | Closed-form eigenvalues / transmissibility | < 1% |
| V6 | Mesh convergence | 5, 10, 20, 40 elements/member | converges, report |
| V7 | Reduced vs full harmonic solve (same model) | direct full solve | peak error < 2% |
| V8 | (Bonus) Ansys Student modal + harmonic or CalculiX for the drone arm | FEM result | < 5% on modes |
| B1 | **Benchmark** | full direct solve vs ROM; vs Ansys wall-clock if available | report N× faster |

Be honest in the table: if full 3D FEM isn't run, say "validated against analytical solutions and a full-DOF direct solve".

## 10. LLM agent design

**Principle:** LLM = interface and explainer. Solver = truth.

1. **Build mode** (empty or novice): user prompt → LLM emits ops to compose from known primitives (`load_preset` + `set_*` + `add_component`). It cannot invent free geometry beyond what ops allow.
2. **Continue mode** (half-built design): every call includes the current design JSON (compact) and the user's text ("now add a gyro near the center and make arms thinner"). The LLM returns **only the incremental ops**. Backend applies them to the current design, validates, returns the patched design. UI animates new parts appearing.
3. **Fix mode:** includes the analysis findings; user says "reduce camera vibration"; LLM proposes ops or triggers `/optimize`.
4. **Explain mode:** input = findings + candidates JSON → output = short reasoning per finding ("camera exceeds 0.5 g at 4,200 RPM because the 1× excitation is within 0.1% of mode 2 at 70 Hz; softer mount lowers the mount mode to ...").
5. **Guardrails:** JSON-schema output, op whitelist, range validation (e.g. mass 0.001–50 kg, lengths 0.01–5 m), clarifying question when ambiguous, max 8 ops per call. Never trust LLM numbers: every number shown in the UI comes from the solver.
6. **Providers:** abstract adapter with env var (`LLM_PROVIDER=gemini|groq|openrouter`). Check free-tier limits today. One call per user action. Cache canned answers for the demo prompts. **Fallback:** keyword → preset matcher and template-based explanations if the API fails.

## 11. UI/look (Ansys-like)

Dark theme with blue-gray gradient background, left "Model Tree" (Beam, Materials, Supports, Components, Mounts, Analysis), right "Details" panel for the selected object, bottom plots, top toolbar (Run, Optimize, Compare, Animate). 3D: floor grid, axes triad, **mesh view** (nodes as dots, elements outlined with edges), supports as glyphs, undeformed ghost + deformed overlay, **jet-style contour with colorbar** (amplitude in mm or g), probe tooltip on hover, view cube/orbit/zoom/pan. Details in Person 2's file.

## 12. Work split and timeline (2 people, 24 h)

- **Person 1 — Solver, validation, optimizer, API, LLM backend** → `01_PERSON1_SOLVER_BACKEND.md`
- **Person 2 — Builder UI, 3D viewer, plots, comparison, chat panel, report UI** → `02_PERSON2_FRONTEND_3D.md`

| Hours | Person 1 | Person 2 | Sync |
|---|---|---|---|
| 0–2 | Repo, FastAPI skeleton, **mock `/analyze`** returning contract JSON, materials/presets | Vite app, store, layout, mock JSON loader, basic 3D beam from design | **Freeze JSON contract at H2** |
| 2–8 | Frame element + assembly + modes; V1–V3 tests pass | Builder UI (presets, dimensions, materials), mesh view, supports, component 3D models | H8: real `/analyze` live for straight beam |
| 8–14 | Components + mounts + harmonic + ROM + findings; V4–V7 | Animation, contour/heatmap, RPM labels, plots (FRF, Campbell) | H14: end-to-end on beam; **3D go/no-go** (else 2D fallback) |
| 14–18 | Optimizer + `/optimize` + benchmark | Compare view (side by side), findings panel, camera sync | H18: feature freeze for Tier 1 |
| 18–21 | Agent backend (ops, validator, prompts, fallback) | Chat panel, op animation, explanation panel | H21: agent working on 3 demo prompts |
| 21–24 | Validation table, benchmark slide, bug fixing | Polish, demo path, screenshots | **Full demo rehearsal x3** |

Hard rules: no new features after H21. Commit every hour. Both people use the same mock JSON so neither blocks the other. One person owns the pitch deck each hour block, alternating.

## 13. Demo script (4–5 minutes)

1. **Problem (20 s):** "Vibration from one component travels through the structure and hits the sensitive one. Resonance makes it dangerous. Checking this normally needs expert FEM setup."
2. **Build by talking (40 s):** type "Quadcopter, 4 aluminium arms 25 cm, 0.15 kg camera at the center, motors up to 9000 RPM". Parts appear. Orbit around it; motors spin, RPM labels shown.
3. **Run (30 s):** press Run. Results in < 1 s. Findings: "Camera: 1.8 g at 4,200 RPM (limit 0.5 g). Cause: 1× excitation within 0.1% of mode 2. Arm 2 stress 17% of yield." Show animation + heatmap + Campbell diagram with the crossing.
4. **Continue prompt (20 s):** "add a gyro on the left arm" — it appears, results update.
5. **Optimize (40 s):** press Optimize. Side-by-side 3D: original (red) vs improved (green). "Soften camera mount 100→28 kN/m, move motor mount 3 cm outward: camera vibration −71%."
6. **Proof (40 s):** validation table (< 1% vs analytical), benchmark (N× faster than full solve), honest limitations slide.
7. **Close (20 s):** "Use it before FEM to find risks early; export the shortlisted design to Ansys."

Prepare 2 backup prompts and a recorded screen capture in case of Wi-Fi/API failure.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Solver wrong (units, BCs) | Tests V1–V5 before anything else; SI everywhere; assert on matrix symmetry and positive mass |
| Singular matrix on free structures | Weak hover support springs; never use pure free-free in harmonic solve |
| 3D too slow to build | Primitives only; go/no-go at H14; 2D canvas fallback |
| LLM builds nonsense | Closed op vocabulary, validators, presets, clarifying questions |
| API rate limit / outage | Provider adapter, cached demo prompts, template fallback |
| Frontend/back mismatch | Frozen contract at H2, shared mock JSON, contract tests |
| Scope creep | Cut list in section 4; no features after H21 |
| Overclaiming | Use claims in section 3; state limitations |

## 15. Working without Claude Code / paid tools

- Use free chat tools in **small, testable pieces** ("write `frame_element(E,A,I,rho,L)`", "write a `<Propeller rpm>` component"). Never ask for the whole app.
- Paste the contract JSON into every prompt so generated code matches.
- Test each piece immediately (pytest for solver, a throwaway page for 3D components).
- Commit working states; revert rather than patch broken generations.
- Keep a running `NOTES.md` of decisions and units.

## 16. Definition of done (checklist)

- [ ] V1–V7 pass and are shown in a table
- [ ] Benchmark shows speedup
- [ ] Build a drone by prompt, orbit it in 3D, motors spin with RPM shown
- [ ] Run → findings with RPM, location, cause
- [ ] Optimize → side-by-side with % reduction
- [ ] Agent continues a half-built design correctly on 3 rehearsed prompts
- [ ] Demo rehearsed 3 times, backups ready
