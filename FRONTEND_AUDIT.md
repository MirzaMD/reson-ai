# Frontend Integration Audit (ResonAI)

Date: 2026-10-23
Auditor: Antigravity Assistant (Milestone: Frontend Integration Check)

---

## 1. Summary

The ResonAI frontend is a modern Next.js 16 (Turbopack) and React 19 application utilizing `@react-three/fiber` for 3D visualization, `react-plotly.js` for vibration response curves (FRF, Campbell diagrams, heatmaps), and `zustand` for state management. 

Static checks and compilation passed cleanly:
- `npm install`: 632 packages installed cleanly, lockfile verified.
- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors.
- `npm run build`: Production build succeeded in ~16s, prerendering `/`, `/_not-found`, and `/api/health`.
- Production server startup on `http://127.0.0.1:3000` succeeded (health endpoint returned `{ status: "ok", service: "resonai-frontend" }` and root HTML loaded with HTTP 200).
- Live backend connection succeeded against FastAPI on `http://127.0.0.1:8000`.

However, the frontend was operating largely in client-side simulation ("demo") mode with hardcoded fallback timeouts and several schema/contract mismatches preventing real-time backend orchestration.

---

## 2. Blockers

The following items prevent seamless end-to-end communication with the Python FastAPI backend:

1. **Default Execution Mode**:
   - In `frontend/lib/api/client.ts`, mode defaulted to `NEXT_PUBLIC_RESONAI_MODE ?? "demo"`. When unset, requests bypass the FastAPI backend entirely and run in-browser toy simulations.
   - **Resolution**: Support both `NEXT_PUBLIC_USE_MOCK` and `NEXT_PUBLIC_RESONAI_MODE`. Default to `http://127.0.0.1:8000` with live backend enabled by default.

2. **Hardcoded 6-Second Request Timeout**:
   - `client.ts` enforced a global 6000 ms timeout via `AbortController` on all fetch calls.
   - Long-running operations like `/optimize` (scipy Differential Evolution ~5–12s) and `/agent/chat` (LLM inference ~15–25s) inevitably trigger `AbortError: Solver API /optimize timed out after 6 seconds`.
   - **Resolution**: Implement per-endpoint timeout budgets:
     - `/analyze`: 30,000 ms
     - `/response_at`: 15,000 ms
     - `/optimize`: 60,000 ms
     - `/agent/chat`: 45,000 ms
     - `/validate`: 30,000 ms
     - `/presets`: 10,000 ms
     - `/health`: 5,000 ms

3. **Missing Environment Configuration**:
   - No `.env.local` or `.env` file existed in `frontend/`.
   - **Resolution**: Create `frontend/.env.local` and `frontend/.env.local.example` with:
     ```env
     NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
     NEXT_PUBLIC_USE_MOCK=false
     ```

---

## 3. Contract & Schema Mismatches

1. **`/presets` Endpoint Structure**:
   - `frontend/lib/api/client.ts` had `getPresets()` typed as `Promise<StructurePreset[]>` and expected a list of presets from `GET /presets`.
   - Backend `GET /presets` returns a dictionary:
     `{ "materials": {...}, "mounts": {...}, "components": {...}, "structures": ["quad_drone_diagonal", "simply_supported_beam", ...] }`.
   - Individual structure designs are served at `GET /presets/{name}/design`.
   - **Resolution**: Update `client.ts` to query `/presets` and `/presets/{name}/design` or fallback smoothly to `STRUCTURE_PRESETS`.

2. **`/optimize` Candidate Metrics Shape**:
   - Backend returns `CandidateBlock` containing `metrics_before: MetricsBlock` and `metrics_after: MetricsBlock` where `MetricsBlock` has `components: Dict[str, ComponentMetrics]`, `max_stress_ratio`, `n_resonance_findings`, `mass_added_kg`, etc.
   - Frontend `ComparePanel.tsx` expected `cand.metrics_before.camera_peak_g` and `cand.metrics_before.stress_ratio`.
   - **Resolution**: Normalize metric accessors in `ComparePanel.tsx` and types in `contract.ts` to read either structured `MetricsBlock` (`cand.metrics_before.components?.camera?.peak_accel_g ?? cand.metrics_before.camera_peak_g`) and `max_stress_ratio ?? stress_ratio`.

3. **`/validate` Modal Handling**:
   - `ValidationModal.tsx` swallowed backend `/validate` results and displayed a static disclaimer stating validation reporting had not yet been implemented.
   - Backend `/validate` returns 22 passed analytical cases with zero failures and live benchmark metrics.
   - **Resolution**: Wire `ValidationModal.tsx` to render the actual test cases, error percentages, pass badges, and benchmark speedup numbers returned by the FastAPI `/validate` endpoint.

4. **`Finding` Severity Types**:
   - Backend `schemas.py` defines `Finding.severity` as `Literal["ok", "warning", "critical", "info"]`.
   - Frontend `contract.ts` defined `FindingSeverity` as `"ok" | "warning" | "critical"`.
   - **Resolution**: Add `"info"` to `FindingSeverity` in `frontend/lib/types/contract.ts`.

---

## 4. Warnings & Browser Automation

1. **Browser Automation Tool Absence**:
   - The coding agent workspace does NOT contain an interactive browser automation tool (such as Playwright or Puppeteer).
   - All frontend rendering, routing, static analysis, SSR behavior, and endpoint validation are verified via HTTP requests (`curl` / `Invoke-WebRequest`), Node.js scripts, and unit/contract verification tests.

2. **Client-Side Dynamic Imports (SSR Safety)**:
   - Three.js (`@react-three/fiber`) canvas in `SceneRoot.tsx` and Plotly.js charts in `FrfPlot.tsx`, `CampbellPlot.tsx`, and `HeatmapPlot.tsx` already use `dynamic(() => import(...), { ssr: false })`. This was verified and prevents Next.js SSR hydration crashes.

3. **RPM Debouncing**:
   - `SceneRoot.tsx` implements `useDebouncedRpm(rpm, 150)` with request generation tracking to avoid flooding `/response_at` while scrubbing the speed slider.

---

## 5. Environment Specifications

- **Node.js**: `v22.18.0`
- **npm**: `11.19.0`
- **Next.js**: `16.4.2` (Turbopack enabled)
- **React**: `19.3.0`
- **Python Backend**: Python 3.13.5 in `backend/.venv` (Note: Python 3.10 produces a SyntaxError on nested f-string backslashes in `post.py` line 312; Python >= 3.12 is required for backend execution).

---

## 6. UI Component Inventory

| Category | Component / File | Purpose & Capabilities |
| :--- | :--- | :--- |
| **Layout** | `Toolbar.tsx` | App header, speed slider (500–12,000 RPM), "Test shaking" (analyze), "Auto-fix" (optimize), "Before vs after" (compare toggle), examples picker |
| | `ModelTree.tsx` | Hierarchical sidebar listing arms, joints, mounts, sensitive payloads, and motors |
| | `RightDock.tsx` | Collapsible inspector tabs: Element properties & AI Copilot |
| | `BottomTabs.tsx` | Bottom diagnostic panel hosting findings, FRF curves, Campbell diagrams, and spatial heatmaps |
| | `DetailsPanel.tsx` | Property editor for selected nodes, members, mounts, and components |
| **Panels** | `FindingsPanel.tsx` | Real-time diagnostic cards for resonances, limit violations, and mount amplifications with "Ask Copilot" and "Auto-Fix" shortcuts |
| | `ComparePanel.tsx` | Side-by-side comparison strip displaying before/after acceleration (g), stress ratios, mass deltas, and tuned parameter badges |
| | `ChatPanel.tsx` | Interactive LLM chat copilot with mode switching (build, fix, explain, continue) and automated design op dispatch |
| **Plots** | `FrfPlot.tsx` | Frequency response function (RPM vs. Acceleration in g) with component threshold limit lines |
| | `CampbellPlot.tsx` | Campbell diagram displaying structural natural frequencies (horizontal modes), rotational orders (1x, 2x, 4x rays), and ±15% danger bands |
| | `HeatmapPlot.tsx` | Spatial vibration heatmap (RPM vs. Member discretization node position vs. Vibration amplitude) |
| **3D Scene** | `SceneRoot.tsx` | 3D canvas with OrbitControls, grid, lighting, and side-by-side comparison viewports |
| | `StructureView.tsx` | Animated structural deformation rendering based on `/response_at` complex harmonic deflection or mode shapes |
| | `ComponentModel.tsx` | 3D rendered models for motors, cameras, gyros, batteries, and generic masses |
| | `MountSpring.tsx` | Spring/damper visualizer indicating physical isolation grommets between components and members |
| **Modals** | `PresetGalleryModal.tsx` | Template selector (Quadcopter, Cantilever, Simply Supported, etc.) |
| | `AddComponentModal.tsx` | Component placement dialog (payload, motor, sensor, mount selection) |
| | `ValidationModal.tsx` | Analytical benchmark and numerical verification dialog |

---

## 7. Backend Finding (A10) Analysis

During milestone M5, solver findings were consolidated to reduce alert noise:
- Resonances were grouped to report **one finding per structural mode** (listing causing excitation sources).
- Mount amplifications were grouped into **one finding** listing all affected components.

When evaluating the Quadcopter drone variant (c) with standard excitation bounds (`rpm_max = 9000` or `12000`):
1. **Mode 4 resonance**: 4272 RPM (`~71.2 Hz`), caused by BLDC motor unbalance excitation.
2. **Mode 5 resonance**: 6023 RPM (`~100.4 Hz`), caused by BLDC motor unbalance excitation.
3. **Mount amplification**: Grouped finding identifying components on flexible isolation mounts amplifying high-frequency rotor vibration.
4. **Camera acceleration limit exceeded**: 4K camera payload reaches ~1.44g peak (exceeding its strict `0.5g` limit).
5. **IMU acceleration limit exceeded**: Flight controller gyro reaches ~1.03g peak (exceeding its `1.0g` limit).

All 5 findings are correctly generated, serialized by `backend/app/solver/post.py`, and verified in `backend/app/tests/test_demo_variants.py`.
