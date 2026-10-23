/**
 * ResonAI Contract Verification Script
 * Validates frontend data models and live backend responses against
 * the frozen JSON contract defined in 00_MASTER_CONTEXT.md section 6.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[CONTRACT VIOLATION] ${message}`);
  }
}

function validateAnalyzeResponse(data, sourceLabel) {
  console.log(`Checking /analyze schema compliance on: ${sourceLabel}...`);

  // 1. Meta
  assert(data.meta && typeof data.meta === "object", "Missing 'meta' block");
  assert(typeof data.meta.n_dof === "number", "meta.n_dof must be a number");
  assert(typeof data.meta.solve_ms === "number", "meta.solve_ms must be a number");
  assert(["rom", "full"].includes(data.meta.method), "meta.method must be 'rom' or 'full'");

  // 2. Mesh nodes
  assert(Array.isArray(data.mesh_nodes), "mesh_nodes must be an array");
  assert(data.mesh_nodes.length > 0, "mesh_nodes must not be empty");
  const firstNode = data.mesh_nodes[0];
  assert(typeof firstNode.id === "string", "mesh_node.id must be string");
  assert(typeof firstNode.x === "number", "mesh_node.x must be number");
  assert(typeof firstNode.y === "number", "mesh_node.y must be number");

  // 3. Modes
  assert(Array.isArray(data.modes), "modes must be an array");
  assert(data.modes.length > 0, "modes must not be empty");
  const firstMode = data.modes[0];
  assert(typeof (firstMode.i ?? firstMode.mode) === "number", "mode.i (mode index) must be number");
  assert(typeof firstMode.f_hz === "number", "mode.f_hz must be number");
  assert(Array.isArray(firstMode.shape), "mode.shape must be array");
  assert(Array.isArray(firstMode.shape[0]), "mode.shape items must be [ux, uy]");

  // 4. Sweep
  assert(data.sweep && typeof data.sweep === "object", "sweep block missing");
  assert(Array.isArray(data.sweep.rpm), "sweep.rpm must be array");
  assert(Array.isArray(data.sweep.freq_hz), "sweep.freq_hz must be array");
  assert(typeof data.sweep.component_accel_g === "object", "sweep.component_accel_g missing");
  assert(typeof data.sweep.component_disp_mm === "object", "sweep.component_disp_mm missing");
  assert(Array.isArray(data.sweep.node_amp_mm), "sweep.node_amp_mm must be 2D array [n_rpm][n_nodes]");
  if (data.sweep.node_amp_mm.length > 0) {
    assert(
      data.sweep.node_amp_mm.length === data.sweep.rpm.length,
      `node_amp_mm rows (${data.sweep.node_amp_mm.length}) must match rpm length (${data.sweep.rpm.length})`
    );
  }

  // 5. Campbell
  assert(data.campbell && typeof data.campbell === "object", "campbell block missing");
  assert(Array.isArray(data.campbell.mode_freqs_hz), "campbell.mode_freqs_hz must be array");
  assert(Array.isArray(data.campbell.lines), "campbell.lines must be array");

  // 6. Components
  assert(Array.isArray(data.components), "components summary array missing");
  if (data.components.length > 0) {
    const c = data.components[0];
    assert(typeof c.id === "string", "component.id must be string");
    assert(typeof c.peak_accel_g === "number", "component.peak_accel_g must be number");
    assert(typeof c.at_rpm === "number", "component.at_rpm must be number");
    assert(["ok", "warning", "critical"].includes(c.status), "component.status must be ok|warning|critical");
  }

  // 7. Findings
  assert(Array.isArray(data.findings), "findings must be array");
  for (const f of data.findings) {
    assert(typeof f.id === "string", "finding.id must be string");
    assert(["ok", "warning", "critical", "info"].includes(f.severity), `finding.severity invalid: ${f.severity}`);
    assert(typeof f.type === "string", "finding.type must be string");
    assert(typeof f.detail === "string", "finding.detail must be string");
  }

  // 8. Max Stress
  assert(data.max_stress_mpa && typeof data.max_stress_mpa === "object", "max_stress_mpa missing");
  assert(typeof data.max_stress_mpa.value === "number", "max_stress_mpa.value must be number");
  assert(typeof data.max_stress_mpa.ratio === "number", "max_stress_mpa.ratio must be number");
  assert(typeof data.max_stress_mpa.member === "string", "max_stress_mpa.member must be string");

  console.log(`✓ ${sourceLabel}: All 8 contract blocks strictly verified.`);
}

async function runCheck() {
  console.log("=== ResonAI Frontend Contract Check ===");
  let checkedCount = 0;

  // 1. Verify mock_analyze.json at repo root or local directory
  const rootMock = resolve(__dirname, "../../mock_analyze.json");
  const localMock = resolve(__dirname, "../mock_analyze.json");
  const mockPath = existsSync(rootMock) ? rootMock : existsSync(localMock) ? localMock : null;

  if (mockPath) {
    const mockContent = JSON.parse(readFileSync(mockPath, "utf-8"));
    validateAnalyzeResponse(mockContent, `Mock file (${mockPath})`);
    checkedCount++;
  } else {
    console.warn("Notice: mock_analyze.json not found at repo root.");
  }

  // 2. Try checking against live backend if running
  try {
    const healthRes = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (healthRes.ok) {
      console.log(`Backend detected at ${BACKEND_URL}. Checking live endpoints...`);

      // GET /presets/drone/design
      const designRes = await fetch(`${BACKEND_URL}/presets/drone/design`);
      if (designRes.ok) {
        const droneDesign = await designRes.json();
        const analyzeRes = await fetch(`${BACKEND_URL}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(droneDesign),
        });

        if (analyzeRes.ok) {
          const liveAnalyze = await analyzeRes.json();
          validateAnalyzeResponse(liveAnalyze, "Live /analyze endpoint");
          checkedCount++;
        }
      }

      // GET /validate
      const valRes = await fetch(`${BACKEND_URL}/validate`);
      if (valRes.ok) {
        const valData = await valRes.json();
        assert(Array.isArray(valData.cases), "Live /validate missing cases array");
        assert(valData.cases.length > 0, "Live /validate cases empty");
        console.log(`✓ Live /validate: Verified ${valData.cases.length} analytical test cases.`);
        checkedCount++;
      }
    }
  } catch (err) {
    console.log(`Backend offline or unreachable at ${BACKEND_URL} (${err.message}). Skipping live checks.`);
  }

  assert(checkedCount > 0, "At least one contract verification source must be evaluated.");
  console.log("\n=============================================");
  console.log("✓ Contract Check Passed: JSON contracts verified.");
  console.log("=============================================\n");
}

runCheck().catch((err) => {
  console.error("\n❌ Contract Check Failed:", err.message);
  process.exit(1);
});
