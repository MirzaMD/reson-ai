"use client";
import { useDebouncedRpm } from "@/hooks/useDebouncedRpm";
import { responseAt as fetchResponseAt } from "@/lib/api/client";
import { useRef, useEffect, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

// Suppress upstream Three.js deprecation warning emitted by @react-three/fiber r183+
if (typeof window !== "undefined") {
  const w = window as unknown as { __threeClockWarnFiltered?: boolean };
  if (!w.__threeClockWarnFiltered) {
    w.__threeClockWarnFiltered = true;
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes("THREE.Clock: This module has been deprecated")
      ) {
        return;
      }
      origWarn.apply(console, args);
    };
  }
}

import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  PerspectiveCamera,
  Stats,
} from "@react-three/drei";
import { usePerfMode } from "@/components/ui/PerfOverlay";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore, type CameraPreset } from "@/lib/store/useStore";
import StructureView from "./StructureView";
import NodesView from "./NodesView";
import Colorbar from "./Colorbar";
import { computeBounds, DRONE_ANGLES, isDroneDesign } from "./mapping";
import type { Design, AnalysisResult, ResponseAt } from "@/lib/types/contract";
import { animClock, notifyThrottledClock } from "./animClock";
import {
  Compass,
  Box,
  Maximize2,
  Scan,
  Activity,
  Play,
  Pause,
  Trash2,
  Grid3X3,
  Eye,
  Cpu,
  X,
} from "lucide-react";
import clsx from "clsx";

interface SceneRootProps {
  customDesign?: Design | null;
  customAnalysis?: AnalysisResult | null;
  customResponseAt?: ResponseAt | null;
  isCompareSecondary?: boolean;
  sharedMaxAmp?: number;
}

function AnimationDriver() {
  const animating = useStore((s) => s.ui.animating);
  const isRpmSweeping = useStore((s) => s.ui.isRpmSweeping);

  useFrame((_, dt) => {
    if (!animating || document.hidden) return;
    const clampedDt = Math.min(dt, 0.05);

    // Smooth RPM sweep if automated sweep mode is engaged
    if (isRpmSweeping) {
      const design = useStore.getState().design;
      if (design) {
        const minRpm = design.analysis.rpm_min || 500;
        const maxRpm = design.analysis.rpm_max || 12000;
        const sweepSpeed = (maxRpm - minRpm) / 10; // 10 second full sweep
        const currentRpm = useStore.getState().rpm;
        let nextRpm = currentRpm + sweepSpeed * clampedDt;
        if (nextRpm > maxRpm) nextRpm = minRpm;
        useStore.getState().setRpm(Math.round(nextRpm));
      }
    }

    // Visually pleasing steady phase rotation updated on mutable non-reactive clock
    const currentRpm = useStore.getState().rpm;
    const visualFreq = Math.min(Math.max(currentRpm / 120, 2), 7);
    const nextTime = (animClock.time + visualFreq * clampedDt * Math.PI * 2) % (Math.PI * 2);
    animClock.time = nextTime;
    notifyThrottledClock(performance.now(), nextTime);
  });

  return null;
}

function CameraController({
  activeDesign,
  isSecondary = false,
}: {
  activeDesign: Design | null;
  isSecondary?: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const cameraTrigger = useStore((s) => s.cameraTrigger);
  const setCameraState = useStore((s) => s.setCameraState);
  const cameraState = useStore((s) => s.cameraState);
  const viewMode = useStore((s) => s.ui.viewMode);
  const isSyncingRef = useRef(false);

  const bounds = useMemo(() => {
    if (!activeDesign)
      return { center: [0, 0, 0] as [number, number, number], size: 0.4 };
    return computeBounds(activeDesign.nodes);
  }, [activeDesign]);

  const applyViewPreset = useCallback(
    (type: CameraPreset) => {
      const { center, size } = bounds;
      const dist = size * 1.6;

      if (type === "front") {
        camera.position.set(center[0], center[1], dist);
      } else if (type === "top") {
        camera.position.set(center[0], dist, center[2] + 0.001);
      } else if (type === "iso") {
        camera.position.set(
          center[0] + size * 0.9,
          center[1] + size * 0.7,
          dist * 0.9
        );
      } else if (type === "fit") {
        camera.position.set(
          center[0] + size * 0.75,
          center[1] + size * 0.55,
          dist
        );
      }
      camera.lookAt(center[0], center[1], center[2]);
      camera.updateProjectionMatrix();

      if (controlsRef.current) {
        controlsRef.current.target.set(center[0], center[1], center[2]);
        controlsRef.current.update();
      }
    },
    [bounds, camera]
  );

  // Initial auto-fit
  useEffect(() => {
    if (!activeDesign) return;
    applyViewPreset("iso");
  }, [activeDesign, applyViewPreset]);

  // Handle triggered preset camera views
  useEffect(() => {
    if (cameraTrigger) {
      applyViewPreset(cameraTrigger.type);
    }
  }, [cameraTrigger, applyViewPreset]);

  // Synchronize secondary canvas in Compare mode
  useEffect(() => {
    if (isSecondary && viewMode === "compare" && controlsRef.current) {
      if (isSyncingRef.current) return;
      camera.position.set(...cameraState.position);
      controlsRef.current.target.set(...cameraState.target);
      controlsRef.current.update();
    }
  }, [cameraState, isSecondary, viewMode, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault={!isSecondary}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.02}
      maxDistance={8}
      onChange={() => {
        if (!controlsRef.current) return;
        if (viewMode === "compare" && !isSecondary) {
          isSyncingRef.current = true;
          const pos: [number, number, number] = [
            camera.position.x,
            camera.position.y,
            camera.position.z,
          ];
          const tgt: [number, number, number] = [
            controlsRef.current.target.x,
            controlsRef.current.target.y,
            controlsRef.current.target.z,
          ];
          setCameraState(pos, tgt);
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 10);
        }
      }}
    />
  );

}

function SceneContent({
  activeDesign,
  activeAnalysis,
  activeResponseAt,
  isSecondary = false,
  sharedMaxAmp,
}: {
  activeDesign?: Design | null;
  activeAnalysis?: AnalysisResult | null;
  activeResponseAt?: ResponseAt | null;
  isSecondary?: boolean;
  sharedMaxAmp?: number;
}) {
  const storeDesign = useStore((s) => s.design);
  const storeAnalysis = useStore((s) => s.analysis);
  const storeResponseAt = useStore((s) => s.responseAt);
  const rpm = useStore((s) => s.rpm);
  const exaggeration = useStore((s) => s.ui.exaggeration);
  const showMesh = useStore((s) => s.ui.showMesh);
  const showGhost = useStore((s) => s.ui.showGhost);
  const selectedId = useStore((s) => s.selection.id);
  const selectedMode = useStore((s) => s.ui.selectedMode);
  const setSelection = useStore((s) => s.setSelection);

  const design = activeDesign ?? storeDesign;
  const analysis = activeAnalysis !== undefined ? activeAnalysis : storeAnalysis;
  const responseAt = activeResponseAt !== undefined ? activeResponseAt : storeResponseAt;

  if (!design) {
    return null;
  }

  const isDrone = isDroneDesign(design.name);
  const angles = isDrone ? DRONE_ANGLES : [0];
  return (
    <>
      {/* High-Performance Lighting Rig: 1 ambient + 1 directional (no shadows) */}
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />

      {/* Engineering Ground Grid */}
      <Grid
        args={[2.5, 2.5]}
        cellSize={0.05}
        sectionSize={0.25}
        cellColor="#1e293b"
        sectionColor="#334155"
        fadeDistance={2.0}
        fadeStrength={1.4}
        position={[0, -0.001, 0]}
      />

     {angles.map((angle) => (
  <group key={angle} rotation={[0, angle, 0]}>
    <StructureView
      design={design}
      analysis={analysis}
      responseAt={responseAt}
      rpm={rpm}
      exaggeration={exaggeration}
      showMesh={showMesh}
      showGhost={showGhost}
      selectedId={selectedId}
      selectedMode={selectedMode}
      overrideMaxAmp={sharedMaxAmp}
      onSelectMember={(id) => setSelection({ type: "member", id })}
      onSelectComponent={(id) => setSelection({ type: "component", id })}
      renderComponents={angle === 0}
    />

    <NodesView
      design={design}
      analysis={analysis}
      showMesh={showMesh}
      rpm={rpm}
    />
  </group>
))}

      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="white"
        />
      </GizmoHelper>

      <CameraController activeDesign={design} isSecondary={isSecondary} />
      {!isSecondary && <AnimationDriver />}
    </>
  );
}

export default function SceneRoot({
  customDesign,
  customAnalysis,
  customResponseAt,
  isCompareSecondary = false,
  sharedMaxAmp,
}: SceneRootProps) {
  const isPerf = usePerfMode();
  const storeDesign = useStore((s) => s.design);
  const storeAnalysis = useStore((s) => s.analysis);
  const triggerCameraView = useStore((s) => s.triggerCameraView);
  const probe = useStore((s) => s.probe);
  const isRpmSweeping = useStore((s) => s.ui.isRpmSweeping);
  const setUi = useStore((s) => s.setUi);
  const selectedMode = useStore((s) => s.ui.selectedMode);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const deleteComponent = useStore((s) => s.deleteComponent);
  const rpm = useStore((s) => s.rpm);
  const animating = useStore((s) => s.ui.animating);
  const setResponseAt = useStore((s) => s.setResponseAt);
  const debouncedRpm = useDebouncedRpm(rpm, 150);
  const abortControllerRef = useRef<AbortController | null>(null);
  const responseCache = useRef(new Map<number, ResponseAt>());

  const design = customDesign !== undefined ? customDesign : storeDesign;
  const analysis = customAnalysis !== undefined ? customAnalysis : storeAnalysis;
  const setRpm = useStore((s) => s.setRpm);
  const showMesh = useStore((s) => s.ui.showMesh);
  const showGhost = useStore((s) => s.ui.showGhost);
  const exaggeration = useStore((s) => s.ui.exaggeration);
  const rpmMin = design?.analysis.rpm_min ?? 500;
  const rpmMax = design?.analysis.rpm_max ?? 12000;
  const sensitiveComponents = analysis?.components?.filter((c) => c.limit_g != null) ?? [];
  const selectedComp =
    selection.type === "component" && selection.id
      ? design?.components.find((c) => c.id === selection.id)
      : null;

  let ampMax = sharedMaxAmp || 1;
  if (!sharedMaxAmp && analysis?.sweep.node_amp_mm?.length) {
    let mx = 0.01;
    for (const row of analysis.sweep.node_amp_mm) {
      for (const v of row) mx = Math.max(mx, v);
    }
    ampMax = mx;
  }

  // Clear cache if design changes
useEffect(() => {
  responseCache.current.clear();
  if (!isCompareSecondary && customDesign === undefined) {
    setResponseAt(null);
  }
}, [design, isCompareSecondary, customDesign, setResponseAt]);

  useEffect(() => {
    // The secondary comparison scene must not overwrite global response state.
    if (isCompareSecondary || customDesign !== undefined) return;

    if (!design || !Number.isFinite(debouncedRpm) || debouncedRpm < 0) {
      return;
    }

    const roundedRpm = Math.round(debouncedRpm);

    // 1. Return from client memory cache immediately if available
    const cached = responseCache.current.get(roundedRpm);
    if (cached) {
      setResponseAt(cached);
      return;
    }

    // 2. Abort in-flight HTTP request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 3. Keep animating previous response while new response loads
    fetchResponseAt(design, roundedRpm, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        responseCache.current.set(roundedRpm, result);
        setResponseAt(result);
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof Error &&
            (error.name === "AbortError" ||
              error.name === "TimeoutError" ||
              error.message.toLowerCase().includes("abort") ||
              error.message.toLowerCase().includes("timed out")))
        ) {
          return;
        }
        console.error("[responseAt] Request failed:", error);
      });

    return () => {
      controller.abort();
    };
  }, [
    design,
    debouncedRpm,
    isCompareSecondary,
    customDesign,
    setResponseAt,
  ]);

  return (
    <div className="relative h-full w-full select-none viewport-bg overflow-hidden">
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: true,
        }}
        shadows={false}
        frameloop={animating ? "always" : "demand"}
        style={{ background: "transparent" }}
      >
        {isPerf && <Stats className="!left-3 !top-20 z-40" />}
        <PerspectiveCamera makeDefault fov={42} near={0.001} far={30} />
        <SceneContent
          activeDesign={design}
          activeAnalysis={analysis}
          activeResponseAt={customResponseAt}
          isSecondary={isCompareSecondary}
          sharedMaxAmp={ampMax}
        />
      </Canvas>

      {/* Floating Status Chips for Sensitive Components (Top Left) */}
      {!isCompareSecondary && sensitiveComponents.length > 0 && (
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5 max-w-[280px]">
          {sensitiveComponents.map((c) => {
            const isSelected = selection.type === "component" && selection.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelection({ type: "component", id: c.id })}
                className={clsx(
                  "glass-panel flex items-center justify-between gap-2.5 rounded-md px-2.5 py-1 text-xs shadow-2xs text-left transition-all",
                  isSelected && "ring-2 ring-accent",
                  c.status === "critical" && "border-danger/40 bg-danger-soft text-danger",
                  c.status === "warning" && "border-warn/40 bg-warn-soft text-warn",
                  c.status === "ok" && "border-ok/40 bg-ok-soft text-ok"
                )}
                title={`Click to inspect ${c.id}`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      c.status === "critical" && "bg-danger",
                      c.status === "warning" && "bg-warn",
                      c.status === "ok" && "bg-ok"
                    )}
                  />
                  <span className="font-semibold capitalize truncate">{c.id}</span>
                </div>
                <span className="font-mono text-[11px] shrink-0 font-medium">
                  {c.peak_accel_g.toFixed(2)} g RMS
                  {c.limit_g != null ? ` / ${c.limit_g.toFixed(1)} g` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Floating CAD View Orientation & Display Toolbar (Top Right) */}
      {!isCompareSecondary && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md glass-panel p-1 shadow-xs">
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:bg-panel hover:text-ink"
            onClick={() => triggerCameraView("front")}
            title="Front Orthogonal View (XY Plane)"
          >
            <Box size={12} />
            <span>Front</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:bg-panel hover:text-ink"
            onClick={() => triggerCameraView("top")}
            title="Top View (XZ Plane)"
          >
            <Compass size={12} />
            <span>Top</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:bg-panel hover:text-ink"
            onClick={() => triggerCameraView("iso")}
            title="Isometric 3D Perspective"
          >
            <Scan size={12} />
            <span>Iso</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:bg-panel hover:text-ink"
            onClick={() => triggerCameraView("fit")}
            title="Zoom to Fit Structure"
          >
            <Maximize2 size={12} />
            <span>Fit</span>
          </button>

          <div className="mx-1 h-3.5 w-px bg-line" />

          {/* Wireframe toggle */}
          <button
            type="button"
            className={clsx(
              "p-1 rounded text-[11px] transition-colors",
              showMesh ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
            )}
            onClick={() => setUi({ showMesh: !showMesh })}
            title="Toggle wireframe mesh"
          >
            <Grid3X3 size={13} />
          </button>

          {/* Resting shape toggle */}
          <button
            type="button"
            className={clsx(
              "p-1 rounded text-[11px] transition-colors",
              showGhost ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
            )}
            onClick={() => setUi({ showGhost: !showGhost })}
            title="Toggle resting wireframe"
          >
            <Eye size={13} />
          </button>

          {/* RPM Automated Sweep Toggle */}
          <button
            type="button"
            className={clsx(
              "flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold transition-colors",
              isRpmSweeping
                ? "bg-accent text-white"
                : "text-muted hover:bg-panel hover:text-ink"
            )}
            onClick={() => setUi({ isRpmSweeping: !isRpmSweeping })}
            title="Auto-sweep RPM range to watch resonance ramp"
          >
            {isRpmSweeping ? <Pause size={12} /> : <Play size={12} />}
            <span>Sweep</span>
          </button>
        </div>
      )}

      {/* Floating RPM Slider & Animation HUD (Bottom Centre) */}
      {!isCompareSecondary && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 rounded-lg glass-panel px-3.5 py-1.5 shadow-md">
          <button
            type="button"
            onClick={() => setUi({ animating: !animating })}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white hover:bg-accent-hover transition-colors shadow-2xs"
            title={animating ? "Pause vibration" : "Play vibration"}
          >
            {animating ? <Pause size={13} /> : <Play size={13} className="fill-current ml-0.5" />}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-ink-2">Speed</span>
            <input
              type="range"
              min={rpmMin}
              max={rpmMax}
              step={50}
              value={rpm}
              onChange={(e) => setRpm(Number(e.target.value))}
              className="w-36"
            />
            <div className="min-w-[120px] font-mono text-xs tabular-nums text-ink font-semibold">
              {rpm.toLocaleString()} <span className="text-[10px] font-normal text-muted">RPM</span>
              <span className="ml-1 text-[11px] text-muted font-normal">({(rpm / 60).toFixed(1)} Hz)</span>
            </div>
          </div>

          <div className="h-4 w-px bg-line" />

          {/* Zoom Exaggeration Scale */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted">Zoom</span>
            <button
              type="button"
              onClick={() => {
                const next = exaggeration === 50 ? 100 : exaggeration === 100 ? 200 : 50;
                setUi({ exaggeration: next });
              }}
              className="rounded bg-panel border border-line-subtle px-1.5 py-0.5 text-[11px] font-mono font-medium text-ink-2 hover:bg-surface"
              title="Vibration visual amplification"
            >
              {exaggeration}×
            </button>
          </div>
        </div>
      )}

      {/* Selected Mode Shape Banner */}
      {selectedMode != null && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 flex items-center gap-2 rounded-full border border-ok/40 bg-ok-soft px-3.5 py-1 text-xs font-medium text-ok shadow-md">
          <Activity size={13} className="animate-pulse text-ok" />
          <span>Viewing Mode {selectedMode} Dynamic Shape</span>
          <button
            type="button"
            className="ml-1 text-ok hover:text-ink font-semibold"
            onClick={() => setUi({ selectedMode: null })}
          >
            ✕ Exit
          </button>
        </div>
      )}

      {/* Hover Node Probe Telemetry HUD */}
      {probe && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 rounded-md glass-panel px-3 py-1.5 text-xs font-mono shadow-md">
          <div className="flex items-center gap-1.5 text-accent font-semibold">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span>{probe.nodeId}</span>
          </div>
          <span className="text-line">|</span>
          <span className="text-ink-2">
            X: {probe.xMm} mm, Y: {probe.yMm} mm
          </span>
          <span className="text-line">|</span>
          <span className="text-warn font-semibold">Amp: {probe.ampMm} mm</span>
          {probe.accelG != null && (
            <>
              <span className="text-line">|</span>
              <span className="text-ok font-semibold">Accel: {probe.accelG} g RMS</span>
            </>
          )}
        </div>
      )}

      {/* Floating Selected Component Action Card */}
      {!isCompareSecondary && selectedComp && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-lg glass-panel px-3.5 py-2 shadow-lg border border-accent-line">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Cpu size={14} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <span>Selected:</span>
                <span className="text-accent capitalize">{selectedComp.kind}</span>
                <span className="font-mono text-[10px] text-muted">({selectedComp.id})</span>
              </div>
              <div className="text-[10px] text-muted font-mono">
                Press <kbd className="rounded bg-panel px-1 text-ink-2 border border-line">Del</kbd> to delete
              </div>
            </div>
          </div>

          <div className="h-5 w-px bg-line mx-1" />

          <button
            type="button"
            onClick={() => deleteComponent(selectedComp.id)}
            className="flex items-center gap-1.5 rounded-md bg-danger hover:brightness-95 px-2.5 py-1 text-xs font-medium text-white transition-all shadow-2xs"
            title="Delete this part"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>

          <button
            type="button"
            onClick={() => setSelection({ type: null, id: null })}
            className="rounded p-1 text-muted hover:text-ink transition-colors text-xs"
            title="Deselect"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Colorbar contour legend */}
      {analysis && (
        <Colorbar min={0} max={ampMax} unit="mm" label="Amplitude" />
      )}

      {/* Symmetry Badge */}
      {design && isDroneDesign(design.name) && (
        <div className="absolute left-3 bottom-3 z-10 rounded border border-line bg-surface/90 px-2 py-0.5 text-[10px] font-mono text-muted shadow-2xs">
          Symmetry Model ×2 Diagonals (4 Arms)
        </div>
      )}
    </div>
  );
}
