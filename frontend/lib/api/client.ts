/**
 * API client for ResonAI backend.
 * Seamlessly connects to Python FastAPI backend (http://127.0.0.1:8000)
 * with robust in-browser simulation and validation engine fallback.
 */

import type {
  Design,
  AnalysisResult,
  ResponseAt,
  OptimizeResult,
  AgentRequest,
  AgentResponse,
  ValidationResult,
  StructurePreset,
  AgentOp,
} from "@/lib/types/contract";
import {
  runClientSimulation,
  getResponseAtRpm,
  runClientOptimization,
} from "@/lib/solver/clientSolver";
import { STRUCTURE_PRESETS } from "@/lib/presets/presets";

// Toggle mock/client mode via NEXT_PUBLIC_USE_MOCK=true or NEXT_PUBLIC_RESONAI_MODE=demo
const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK === "true" ||
  process.env.NEXT_PUBLIC_RESONAI_MODE === "demo";

const BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:8000"
    : "http://127.0.0.1:8000");

// Per-endpoint timeout budgets in milliseconds
const ENDPOINT_TIMEOUTS: Record<string, number> = {
  "/analyze": 30_000,
  "/response_at": 5_000,
  "/optimize": 60_000,
  "/agent/chat": 45_000,
  "/validate": 30_000,
  "/presets": 10_000,
  "/health": 5_000,
};

function combineSignals(
  signalA: AbortSignal,
  signalB?: AbortSignal | null
): AbortSignal {
  if (!signalB) return signalA;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signalA, signalB]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signalA.aborted || signalB.aborted) {
    controller.abort();
    return controller.signal;
  }
  signalA.addEventListener("abort", onAbort, { once: true });
  signalB.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

async function request<T>(
  path: string,
  options?: RequestInit,
  customTimeoutMs?: number
): Promise<T> {
  if (USE_MOCK) {
    throw new Error(`Running in mock mode. Request to ${path} bypassed.`);
  }

  const timeoutMs =
    customTimeoutMs ?? ENDPOINT_TIMEOUTS[path] ?? 10_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const combinedSignal = combineSignals(controller.signal, options?.signal);

    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: combinedSignal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Solver API ${path} returned HTTP ${res.status}: ${body.slice(0, 500)}`
      );
    }

    return (await res.json()) as T;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "DOMException")
    ) {
      // If the caller cancelled the request, rethrow the original AbortError
      if (options?.signal?.aborted) {
        throw error;
      }
      const timeoutError = new Error(
        `Solver API ${path} timed out after ${(timeoutMs / 1000).toFixed(0)} seconds.`
      );
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }

    if (error instanceof TypeError) {
      throw new Error(
        `Cannot reach the solver API at ${BASE}. Check that the Python backend is running (uvicorn app.main:app) and NEXT_PUBLIC_API_URL is correct, or set NEXT_PUBLIC_USE_MOCK=true to use the local solver.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function healthCheck(): Promise<boolean> {
  if (USE_MOCK) return true;
  try {
    await request("/health", undefined, 5_000);
    return true;
  } catch {
    return false;
  }
}

export async function analyze(design: Design): Promise<AnalysisResult> {
  if (USE_MOCK) {
    return runClientSimulation(design);
  }

  return request<AnalysisResult>("/analyze", {
    method: "POST",
    body: JSON.stringify(design),
  });
}

export async function responseAt(
  design: Design,
  rpm: number,
  signal?: AbortSignal
): Promise<ResponseAt> {
  if (USE_MOCK) {
    return getResponseAtRpm(design, rpm);
  }

  try {
    return await request<ResponseAt>(
      "/response_at",
      {
        method: "POST",
        body: JSON.stringify({ design, rpm }),
        signal,
      },
      5_000
    );
  } catch (error: unknown) {
    // If request was aborted by caller, rethrow so caller handles abort
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
    // If backend is unreachable or timed out, gracefully fall back to local client solver
    return getResponseAtRpm(design, rpm);
  }
}

export async function optimize(
  design: Design,
  locks: { positions?: boolean; mounts?: boolean; damping?: boolean } = {},
  objective = "min_sensor_accel",
  movable: string[] = []
): Promise<OptimizeResult> {
  if (USE_MOCK) {
    return runClientOptimization(design);
  }

  return request<OptimizeResult>("/optimize", {
    method: "POST",
    body: JSON.stringify({ design, locks, objective, movable, budget: { max_evals: 1200 }, seed: 1 }),
  });
}

export async function validate(): Promise<ValidationResult> {
  if (USE_MOCK) {
    throw new Error(
      "Engineering validation is unavailable in mock mode. " +
      "Connect to the Python backend to run analytical verification benchmarks."
    );
  }

  return request<ValidationResult>("/validate");
}

export async function getPresets(): Promise<StructurePreset[]> {
  if (USE_MOCK) {
    return STRUCTURE_PRESETS;
  }
  try {
    const data = await request<unknown>("/presets");
    if (Array.isArray(data)) {
      return data as StructurePreset[];
    }
    // Backend returns { materials, mounts, components, structures }
    return STRUCTURE_PRESETS;
  } catch {
    return STRUCTURE_PRESETS;
  }
}

export async function getPresetDesign(name: string): Promise<Design | null> {
  if (USE_MOCK) {
    const found = STRUCTURE_PRESETS.find(
      (p) => p.id === name || p.name.toLowerCase().includes(name.toLowerCase())
    );
    return found ? structuredClone(found.design) : null;
  }
  try {
    return await request<Design>(`/presets/${encodeURIComponent(name)}/design`);
  } catch {
    const found = STRUCTURE_PRESETS.find(
      (p) => p.id === name || p.name.toLowerCase().includes(name.toLowerCase())
    );
    return found ? structuredClone(found.design) : null;
  }
}

/** Local rule-based agent interpreter for offline / fallback workflow */
function runLocalAgent(req: AgentRequest): AgentResponse {
  const latestUserMsg =
    req.messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
  const lower = latestUserMsg.toLowerCase();
  const ops: AgentOp[] = [];
  const design: Design = structuredClone(req.design);
  let assistantMessage = "";
  let action: "run_analysis" | "run_optimization" | null = null;

  if (lower.includes("quad") || lower.includes("drone")) {
    const dronePreset = STRUCTURE_PRESETS.find((p) => p.id === "quad_diagonal")!;
    return {
      assistant_message:
        "Loaded Quadcopter Diagonal Arm model with 4 arms, dual BLDC motors (12,000 RPM range), and a 0.15 kg optical camera on a silicone gel mount.",
      ops: [{ op: "load_preset", args: { preset: "quad_diagonal" } }],
      design: structuredClone(dronePreset.design),
      warnings: [],
      action: "run_analysis",
    };
  }

  if (lower.includes("carbon") || lower.includes("cfrp")) {
    design.members.forEach((m) => {
      m.material = "cfrp";
    });
    ops.push({ op: "set_material", args: { member: "all", material: "cfrp" } });
    assistantMessage =
      "Upgraded all structural members to high-stiffness CFRP Quasi-Isotropic (E = 70 GPa, ρ = 1600 kg/m³). This raises arm bending modes away from motor excitation.";
    action = "run_analysis";
  } else if (lower.includes("aluminium") || lower.includes("aluminum")) {
    design.members.forEach((m) => {
      m.material = "aluminium_6061";
    });
    ops.push({ op: "set_material", args: { member: "all", material: "aluminium_6061" } });
    assistantMessage = "Switched structure material to Aluminium 6061-T6.";
    action = "run_analysis";
  } else if (lower.includes("gyro") || lower.includes("imu")) {
    const newGyroId = `c_${Date.now().toString().slice(-4)}`;
    design.components.push({
      id: newGyroId,
      kind: "gyro",
      member: design.members[0]?.id || "m1",
      s: 0.5,
      mass: 0.005,
      mount: { preset: "silicone_gel", kv: 45000, zeta: 0.15 },
      limit_g: 1.0,
    });
    ops.push({
      op: "add_component",
      args: { id: newGyroId, kind: "gyro", member: "m1", s: 0.5, mass: 0.005 },
    });
    assistantMessage = `Added 3-axis MEMS Gyroscope (${newGyroId}) at mid-span (s = 0.5) with silicone gel isolation pad. Limit set to 1.0 g.`;
    action = "run_analysis";
  } else if (lower.includes("camera")) {
    const newCamId = `c_${Date.now().toString().slice(-4)}`;
    design.components.push({
      id: newCamId,
      kind: "camera",
      member: design.members[0]?.id || "m1",
      s: 0.85,
      mass: 0.15,
      mount: { preset: "silicone_gel", kv: 50000, zeta: 0.15 },
      limit_g: 0.5,
    });
    ops.push({
      op: "add_component",
      args: { id: newCamId, kind: "camera", member: "m1", s: 0.85, mass: 0.15 },
    });
    assistantMessage = `Added optical camera payload (${newCamId}, 0.15 kg) at s = 0.85 with silicone gel mount (kv = 50 kN/m, limit = 0.5 g).`;
    action = "run_analysis";
  } else if (lower.includes("delete") || lower.includes("remove")) {
    const target = design.components.find((c) =>
      lower.includes(c.id.toLowerCase()) || lower.includes(c.kind.toLowerCase())
    );
    if (target) {
      design.components = design.components.filter((c) => c.id !== target.id);
      ops.push({ op: "remove_component", args: { id: target.id } });
      assistantMessage = `Deleted ${target.kind} (${target.id}) from the design and recalculated the simulation.`;
      action = "run_analysis";
    } else if (design.components.length > 0) {
      const last = design.components[design.components.length - 1];
      design.components = design.components.filter((c) => c.id !== last.id);
      ops.push({ op: "remove_component", args: { id: last.id } });
      assistantMessage = `Deleted ${last.kind} (${last.id}) from the design and recalculated the simulation.`;
      action = "run_analysis";
    } else {
      assistantMessage = "There are no attached components left to delete.";
    }
  } else if (
    lower.includes("reduce") ||
    lower.includes("vibration") ||
    lower.includes("fix") ||
    lower.includes("optimize")
  ) {
    assistantMessage =
      "Initiating differential evolution optimizer to minimize payload acceleration and avoid resonance crossings.";
    action = "run_optimization";
  } else {
    assistantMessage = `Received request: "${latestUserMsg}". You can modify members, add payloads (camera, gyro, FC), or trigger optimization to eliminate resonance.`;
  }

  return {
    assistant_message: assistantMessage,
    ops,
    design,
    warnings: [],
    action,
    clarifying_question: null,
  };
}

export async function agentChat(req: AgentRequest): Promise<AgentResponse> {
  if (USE_MOCK) {
    return runLocalAgent(req);
  }

  try {
    return await request<AgentResponse>(
      "/agent/chat",
      {
        method: "POST",
        body: JSON.stringify(req),
      },
      45_000
    );
  } catch (error: unknown) {
    console.warn(
      "[agentChat] Backend chat failed or offline, falling back to local interpreter:",
      error
    );
    return runLocalAgent(req);
  }
}
