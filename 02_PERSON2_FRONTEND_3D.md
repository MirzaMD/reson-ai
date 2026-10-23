# 02 — PERSON 2: Builder UI, 3D Viewer, Plots, Comparison, Chat Panel

Read `00_MASTER_CONTEXT.md` first. The JSON contract in section 6 there is law. You build everything the judges *see*. You depend on Person 1 only through JSON, and you start with **mock data**, so you are never blocked.

---

## 1. Your deliverables

1. Builder UI: presets, beam/frame dimensions, materials, supports, components, mounts, excitation
2. 3D viewer with Ansys-like look: grid, mesh/nodes, orbit (360°), supports glyphs, component models, spinning motors with RPM labels
3. Vibration animation + contour heatmap + colorbar + probe
4. Plots: FRF, Campbell, position-vs-RPM heatmap
5. Findings/report panel linked to the 3D view
6. Side-by-side compare view (original vs improved)
7. AI chat panel (build / continue / fix / explain) with op animation

## 2. Stack

- Vite + React + TypeScript + Tailwind
- `three`, `@react-three/fiber`, `@react-three/drei` (OrbitControls, Grid, Html, Edges, GizmoHelper, Line)
- `zustand` (global store), `react-plotly.js` + `plotly.js-basic-dist` (plots; basic dist has heatmap/scatter)
- `zod` (validate backend responses, optional)
- Backend base URL from `VITE_API_URL` (default `http://localhost:8000`)

```
frontend/src/
  api/client.ts            # fetch wrappers for /analyze /response_at /optimize /agent/chat /presets /validate
  api/mock/                # mock_analyze.json (from Person 1), mock designs
  store/useStore.ts        # design, analysis, responseAt, selection, rpm, ui flags
  types/contract.ts        # TS types for the JSON contract
  scene/
    SceneRoot.tsx          # Canvas, lights, grid, controls, gizmo
    StructureView.tsx      # members as beam segments (mesh view + deformed)
    NodesView.tsx          # node dots, supports glyphs
    ComponentModel.tsx     # Motor / Camera / IMU / Battery / Generic models
    MountSpring.tsx        # helix spring between component and beam
    Propeller.tsx
    colormap.ts            # jet colormap + colorbar
    mapping.ts             # solver (x,y) -> three coords; symmetry copies
  panels/
    ModelTree.tsx  Details.tsx  Toolbar.tsx
    FindingsPanel.tsx  ComparePanel.tsx  ChatPanel.tsx
  plots/
    FrfPlot.tsx  CampbellPlot.tsx  HeatmapPlot.tsx
  App.tsx
```

## 3. Hours 0–2: skeleton on mock data

- Load `mock_analyze.json` and a mock design, put them in the store, render a straight beam with orbit controls and a plot. This proves the whole data path.
- Write `types/contract.ts` from master section 6. When Person 1 changes the contract, update it here.
- Layout (Ansys-like): top toolbar, left Model Tree, center 3D viewport, right Details panel, bottom tabs (FRF | Campbell | Heatmap | Findings), chat dock on the right (collapsible).

## 4. The Ansys look (what "great" means here)

- Background: dark blue-gray vertical gradient (CSS on the canvas container, `gl={{alpha:true}}`).
- `<Grid />` from drei as the floor (cell size 0.05, section 0.25, fading), axes triad via `<GizmoHelper><GizmoViewport/></GizmoHelper>`.
- **Mesh view:** each element drawn as a thin box between two nodes with `<Edges>` (white/black outline) and node spheres (r ≈ 1.5 mm) — a visible FE grid. Toggle: "Show mesh".
- **Undeformed ghost** (wireframe, 20% opacity) + **deformed** overlay (solid, contour colored) — standard FE-post-processing look.
- **Contour colorbar** (jet: blue→cyan→green→yellow→red) with min/max labels and units (mm or g), left/bottom of the viewport.
- **Probe:** hover a node → tooltip with position, amplitude (mm), acceleration (g), at the current RPM.
- Supports drawn as glyphs: fixed = box with hatch lines, pinned = triangle, roller = triangle + circle, spring = helix.
- Mode-shape view: select mode N from a dropdown → animate that shape with its frequency in Hz.
- Keep post-processing (bloom etc.) **off**. Time goes to correctness and clarity.

## 5. Coordinate mapping (write once, `scene/mapping.ts`)

```ts
// solver (x,y) in metres -> three world coords; y is vertical
export const toWorld = (x: number, y: number): [number, number, number] => [x, y, 0];
// Drone: solver models one diagonal. Render copies rotated about Y.
export const droneCopies = [0, Math.PI / 2];     // two diagonals => four arms
```
Render the drone by wrapping the whole `<StructureView>` in `<group rotation={[0, angle, 0]}>` for each copy; propeller spin direction alternates CW/CCW per motor. Solver results apply identically to every copy (symmetry); label clearly "symmetry model".

Scale: solver in metres; a 25 cm arm is small on screen. Set camera near/far and initial distance based on the design bounding box, and provide a "zoom to fit" button.

## 6. Core 3D components (build in this order, test each in isolation)

### 6.1 `colormap.ts`
```ts
export function jet(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t));
  const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3)));
  const g = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2)));
  const b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)));
  return [r, g, b];
}
```

### 6.2 `StructureView`
- Input: mesh nodes (`mesh_nodes` from `/analyze`), elements derived from consecutive nodes per member, optional `responseAt` complex data, `exaggeration`, `time`.
- Per element render a box oriented from node A to node B using the **deformed** positions:
  - `pos_i(t) = [x_i + gain·Re(ux_i e^{iωt}), y_i + gain·Re(uy_i e^{iωt}), 0]`
  - Midpoint position, length = |B−A|, rotation from atan2 of the segment. Thickness = section width/height (scaled up slightly if too thin to see, up to a visual minimum).
  - Color from amplitude: `t = amp_i / ampMax`, set `material.color` per element ref in `useFrame`.
- Use refs and mutate in `useFrame`, never React state per frame.
- ~100–400 elements as individual meshes is fine. If slow, switch to `InstancedMesh`.

### 6.3 `Propeller` + RPM
```tsx
function Propeller({ rpm, dir = 1, visualScale = 0.02 }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame((_, dt) => {
    // true rpm is shown in the label; visual rotation is slowed so it doesn't strobe
    ref.current.rotation.y += dir * (rpm * 2 * Math.PI / 60) * visualScale * dt * 60;
  });
  return (<group ref={ref}>
    <mesh><boxGeometry args={[0.12, 0.002, 0.012]} /><meshStandardMaterial color="#cfd8dc" /></mesh>
    <mesh rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[0.12, 0.002, 0.012]} /><meshStandardMaterial color="#cfd8dc" /></mesh>
  </group>);
}
```
Show the true RPM with drei `<Html>` anchored above each motor: "4,200 RPM · 70 Hz". Include a global RPM slider (500–12000) and a "sweep" play button that ramps RPM so the viewer sees vibration grow at resonance. The viewer's displayed vibration uses `/response_at` for the current RPM (debounce slider to ~150 ms; cache results by rounded RPM).

### 6.4 `ComponentModel` (primitives only, don't chase models)
- **Motor:** cylinder stator (r 14 mm, h 20 mm), thinner bell on top, shaft, propeller on top. Color dark gray with a colored ring (red if component status critical, amber warning, green ok).
- **Camera:** box body + cylinder lens + small gimbal ring.
- **IMU/FC:** flat green PCB box with small black chips (boxes).
- **Battery:** blue box.
- **Pump/Compressor:** cylinder + box. **Generic mass:** cube scaled by mass^(1/3).
- Each model is placed at the node of its component and **moves with the vertical component DOF** (use `responseAt.components[c].uy`). Because the component moves relative to the beam, draw the mount between them:

### 6.5 `MountSpring`
Helix between beam node and component: `THREE.CatmullRomCurve3` of ~8 turns → `TubeGeometry` (radius 0.5 mm). Rebuild each frame is expensive; instead scale the helix mesh in Y by `(restLength + relDisp)/restLength` in `useFrame`. Color by mount preset (rubber black, silicone translucent, steel spring silver).

### 6.6 Supports and hover glyphs
Simple primitives. For the drone's hover support, draw a small dashed line to a ground-ish marker, or just a spring glyph under the center body.

### 6.7 Camera
`<OrbitControls makeDefault enableDamping />` gives 360° view, zoom, pan. Add preset view buttons (Front / Top / Iso) that tween the camera, and a "Focus on finding" action: clicking a finding moves the camera to the finding's position.

## 7. Builder UI

Design state lives in the store as the exact design JSON (master 6.1). All edits are immutable updates so undo/redo (a simple history array) is easy.

- **Start screen / template picker:** cards for Drone, Simply supported, Cantilever, Fixed-fixed, L-frame, Portal, Box frame, Blank. Fetch from `/presets` (fall back to local JSON).
- **Structure panel:** dimension inputs (mm in the UI → metres in JSON), material dropdown (shows E and ρ), section type and size, support type per node (dropdown), "snap to mesh" toggle.
- **Components:** "+ Add component" with the library (motor, fan, pump, camera, gyro, FC, battery, generic). Selecting the structure member and clicking along it (raycast onto the beam) sets `s`, or type a distance. Drag handle to move along the member (updates `s`, clamped to [0.02, 0.98]).
- **Mount picker:** presets (rubber soft/medium, silicone, foam, spring, wire rope, rigid) + custom `kv` (N/m) and ζ.
- **Excitation:** RPM range, unbalance preset (low/typical/high) → `me`, orders, blades.
- **Analysis settings:** RPM range, damping ζ, mesh density.
- Live validation: highlight inputs outside the sane range (mass, length), show a red badge instead of calling the backend with garbage.
- "Run analysis" button, spinner, and a small "solved in X ms · ROM · N DOF" badge from `meta`.

## 8. Results UI

- **Component status chips:** green/amber/red per component with peak g and limit.
- **Findings panel:** list ordered by severity. Each card: icon, title ("Camera exceeds limit at 4,200 RPM"), numbers, nearest mode, and a "Show" button (sets RPM slider, selects mode, focuses camera, highlights the component). A final "Why?" button asks the agent in `explain` mode.
- **Plots (Plotly):**
  - FRF: accel (g) vs RPM (and Hz on a secondary x-axis) per selected component, shaded operating band, horizontal limit line, markers at resonance crossings.
  - Campbell: x = RPM, y = Hz; flat lines for natural frequencies, sloped lines for `1×`, `2×`, blade-pass; markers at crossings; ±15% bands.
  - Heatmap: x = RPM, y = position along the member (node index), z = amplitude (mm); click sets RPM.
- Sync: moving the RPM slider moves a vertical marker on all plots and updates the 3D animation.

## 9. Compare view (the "wow" moment)

- Layout: two canvases side by side, labels "Original" (red status) and "Optimized" (green status), identical camera.
- **Camera sync:** keep one camera state in the store; each canvas has an `OrbitControls` `onChange` that writes position/target to the store and applies the other's. Guard against feedback loops with a `syncing` ref flag.
- **Use the same colorbar max for both** (max over both results) so the improvement is visible and honest.
- Both animate at the same RPM, same exaggeration, same time `t`.
- Under them: a table of changes from `/optimize` (`changes[]`) and a metric strip: camera accel before → after, % reduction, stress ratio before → after, mass added.
- A candidate switcher (top 3 candidates) and an "Apply to my design" button.

## 10. Chat panel (AI agent UI)

- Right dock, message list + input. Mode chips: **Build for me** / **Continue my design** / **Fix** / **Explain** (auto-select: empty design → build; findings present → fix/explain; otherwise continue).
- Send: `{mode, design, analysis?, messages}` to `/agent/chat`. On response: show `assistant_message`; apply `design` from the response to the store; if `action` is `run_analysis` or `run_optimization`, trigger it.
- **Op animation:** for each returned op, briefly highlight the affected object (new components scale-in over 300 ms, changed members flash). This makes the agent feel alive. Use the `ops` array for that, not diffing.
- Show a collapsible "Changes made" list of ops in human language ("Added camera 0.15 kg at 50% of arm 1").
- Offer quick-prompt chips: "Quadcopter with 4 aluminium arms and a camera", "Add a gyro near the center", "Make the arms carbon fibre", "Reduce camera vibration".
- On `clarifying_question`, render it as a normal reply with quick-answer buttons.
- If the request fails, show an inline error and fall back to the backend's template response; never freeze the UI. Keep a "demo prompts" button that replays the cached rehearsed prompts.

## 11. Timeline (your column)

| Hours | Tasks | Done when |
|---|---|---|
| 0–2 | Vite app, store, types, layout, mock JSON, simple 3D beam + one plot | Mock path works end to end |
| 2–6 | Builder UI for beam, dimensions, material, supports; mesh view with nodes/edges; grid, gizmo, orbit | User edits a beam and sees it change |
| 6–10 | Component library models (motor, camera, IMU, battery), mount springs, placement along member, drone preset incl. symmetry copies | Drone looks good and is orbitable |
| 10–14 | Real `/analyze` + `/response_at` integration, contour + colorbar, animation, spinning props with RPM labels, RPM slider, FRF + Campbell plots | **Go/no-go on 3D at H14**; if broken, build the 2D canvas fallback from the same data |
| 14–18 | Findings panel, heatmap plot, compare view with camera sync, `/optimize` integration | Side-by-side works on the drone |
| 18–21 | Chat panel + op animation + quick prompts + explain panel | 3 demo prompts work live |
| 21–24 | Polish, loading states, error states, demo path, screenshots, slide visuals | Demo rehearsed 3× |

## 12. Fallbacks and performance

- **3D fallback:** if 3D is shaky at H14, render the same data in a 2D canvas (beam as colored polyline with components as icons). Same store, same panels. A working 2D demo beats a broken 3D one.
- Always `useFrame` + refs for animation; never `setState` per frame.
- Limit `devicePixelRatio` to 2 (`dpr={[1,2]}`), turn off shadows, one directional + one ambient light.
- Memoize geometries; reuse materials per color bucket where possible.
- Debounce slider-driven API calls (150 ms) and cache by rounded RPM.
- Don't spend more than ~1 hour in total on lighting, textures, or imported models. Primitives are enough; polish only the drone.
- Keep text readable: min 12 px, high contrast labels, consistent units (mm, g, RPM, Hz).

## 13. Working with AI tools (no paid agent)

Ask for one small component at a time and test it on a throwaway page: "R3F component that draws a box between two 3D points," then "color it from a number using this jet function," then "animate positions from complex amplitudes in useFrame." Paste `types/contract.ts` into every prompt. Commit each working piece.

## 14. Acceptance checklist

- [ ] Orbit/zoom/pan 360° view of the structure with grid, axes triad and mesh view toggle
- [ ] Motors look like motors, propellers spin, RPM + Hz label visible
- [ ] Vibration animation with exaggeration slider, contour colors, colorbar with units
- [ ] Builder edits dimensions/material/supports/components/mounts and re-runs analysis
- [ ] Findings panel with Show/focus behavior; FRF, Campbell and heatmap plots
- [ ] Side-by-side original vs optimized with synchronized cameras and shared color scale
- [ ] Chat builds from scratch and continues a half-built design; ops animate in
- [ ] Loading/error states; demo works with mock data if backend fails
- [ ] 2D fallback exists (or 3D proven stable by H14)
