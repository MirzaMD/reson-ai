"use client";
import { useDebouncedRpm } from "@/hooks/useDebouncedRpm";
import { responseAt as fetchResponseAt } from "@/lib/api/client";
import { useRef, useEffect, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

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
import {
  Compass,
  Box,
  Maximize2,
  Scan,
  Activity,
  Play,
  Pause,
  Trash2,
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
  const setTime = useStore((s) => s.setTime);
  const rpm = useStore((s) => s.rpm);
  const setRpm = useStore((s) => s.setRpm);
  const isRpmSweeping = useStore((s) => s.ui.isRpmSweeping);
  const design = useStore((s) => s.design);

  useFrame((_, dt) => {
    if (!animating) return;
    const clampedDt = Math.min(dt, 0.05);

    // Smooth RPM sweep if automated sweep mode is engaged
    if (isRpmSweeping && design) {
      const minRpm = design.analysis.rpm_min || 500;
      const maxRpm = design.analysis.rpm_max || 12000;
      const sweepSpeed = (maxRpm - minRpm) / 10; // 10 second full sweep
      let nextRpm = rpm + sweepSpeed * clampedDt;
      if (nextRpm > maxRpm) nextRpm = minRpm;
      setRpm(Math.round(nextRpm));
    }

    // Visually pleasing steady phase rotation
    const visualFreq = Math.min(Math.max(rpm / 120, 2), 7);
    const nextTime = (useStore.getState().time + visualFreq * clampedDt * Math.PI * 2) % (Math.PI * 2);
    setTime(nextTime);
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
  const isPerf = usePerfMode();
  const storeAnalysis = useStore((s) => s.analysis);
  const storeResponseAt = useStore((s) => s.responseAt);
  const rpm = useStore((s) => s.rpm);
  const time = useStore((s) => s.time);
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
    return (
      <group>
        <ambientLight intensity={0.4} />
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.08, 0.005, 0.005]} />
          <meshStandardMaterial color="#334155" wireframe />
        </mesh>
      </group>
    );
  }

  const isDrone = isDroneDesign(design.name);
  const angles = isDrone ? DRONE_ANGLES : [0];
  return (
    <>
      {/* Lighting Rig for High-Contrast CAD Aesthetic */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <directionalLight position={[-3, 2, -3]} intensity={0.45} />
      <directionalLight position={[0, -3, 0]} intensity={0.2} />

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
      time={time}
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
  const storeDesign = useStore((s) => s.design);
  const isPerf = usePerfMode();
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
  const setResponseAt = useStore((s) => s.setResponseAt);
  const debouncedRpm = useDebouncedRpm(rpm, 150);
  const requestGeneration = useRef(0);

  const design = customDesign !== undefined ? customDesign : storeDesign;
  const analysis = customAnalysis !== undefined ? customAnalysis : storeAnalysis;
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
  useEffect(() => {
    // The secondary comparison scene must not overwrite global response state.
    if (isCompareSecondary || customDesign !== undefined) return;

    if (!design || !Number.isFinite(debouncedRpm) || debouncedRpm < 0) {
      setResponseAt(null);
      return;
    }

    const generation = ++requestGeneration.current;
    let cancelled = false;

    fetchResponseAt(design, debouncedRpm)
      .then((result) => {
        if (!cancelled && generation === requestGeneration.current) {
          setResponseAt(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && generation === requestGeneration.current) {
          setResponseAt(null);
          console.error("[responseAt] Solver request failed:", error);
          useStore.getState().setUi({
            error:
              error instanceof Error
                ? error.message
                : "Harmonic response calculation failed.",
          });
        }
      });

    return () => {
      cancelled = true;
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
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
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

      {/* Floating CAD View Orientation Toolbar */}
      {!isCompareSecondary && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-[#30363d]/80 bg-[#0d1117]/85 p-1 shadow-lg backdrop-blur-md">
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#e6edf3]"
            onClick={() => triggerCameraView("front")}
            title="Front Orthogonal View (XY Plane)"
          >
            <Box size={12} />
            <span>Front</span>
          </button>
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#e6edf3]"
            onClick={() => triggerCameraView("top")}
            title="Top View (XZ Plane)"
          >
            <Compass size={12} />
            <span>Top</span>
          </button>
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#e6edf3]"
            onClick={() => triggerCameraView("iso")}
            title="Isometric 3D Perspective"
          >
            <Scan size={12} />
            <span>Iso</span>
          </button>
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#e6edf3]"
            onClick={() => triggerCameraView("fit")}
            title="Zoom to Fit Structure"
          >
            <Maximize2 size={12} />
            <span>Fit</span>
          </button>

          <div className="mx-1 h-3.5 w-px bg-[#30363d]" />

          {/* RPM Automated Sweep Toggle */}
          <button
            className={clsx(
              "flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold transition-colors",
              isRpmSweeping
                ? "bg-cyan-500/20 text-cyan-400"
                : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
            )}
            onClick={() => setUi({ isRpmSweeping: !isRpmSweeping })}
            title="Auto-sweep RPM range to watch resonance ramp"
          >
            {isRpmSweeping ? <Pause size={12} /> : <Play size={12} />}
            <span>Sweep</span>
          </button>
        </div>
      )}

      {/* Selected Mode Shape Banner */}
      {selectedMode != null && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/80 px-3.5 py-1 text-[11px] font-medium text-emerald-300 shadow-xl backdrop-blur-md">
          <Activity size={13} className="animate-pulse text-emerald-400" />
          <span>Viewing Mode {selectedMode} Dynamic Shape</span>
          <button
            className="ml-1 text-emerald-400/80 hover:text-white"
            onClick={() => setUi({ selectedMode: null })}
          >
            ✕ Exit
          </button>
        </div>
      )}

      {/* Hover Node Probe Telemetry HUD */}
      {probe && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-xl border border-cyan-500/40 bg-[#0b1320]/95 px-3.5 py-1.5 text-[11px] font-mono shadow-2xl backdrop-blur-md animate-fade-in">
          <div className="flex items-center gap-1.5 text-cyan-400">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span className="font-semibold">{probe.nodeId}</span>
          </div>
          <span className="text-[#64748b]">|</span>
          <span className="text-[#cbd5e1]">
            X: {probe.xMm} mm, Y: {probe.yMm} mm
          </span>
          <span className="text-[#64748b]">|</span>
          <span className="text-amber-400">Amp: {probe.ampMm} mm</span>
          {probe.accelG != null && (
            <>
              <span className="text-[#64748b]">|</span>
              <span className="text-emerald-400">Accel: {probe.accelG} g</span>
            </>
          )}
        </div>
      )}

      {/* Floating Selected Component Action Card */}
      {!isCompareSecondary && selectedComp && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-2xl border border-cyan-500/40 bg-[#0d1522]/95 px-4 py-2.5 shadow-2xl backdrop-blur-md animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 font-bold text-xs">
              {selectedComp.kind === "motor" ? "🌀" : selectedComp.kind === "camera" ? "📷" : selectedComp.kind === "gyro" ? "🎯" : "📦"}
            </span>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <span>Selected:</span>
                <span className="text-cyan-400 capitalize">{selectedComp.kind}</span>
                <span className="font-mono text-[10px] text-slate-400">({selectedComp.id})</span>
              </div>
              <div className="text-[10px] text-slate-400">
                Click delete or press <kbd className="rounded bg-slate-800 px-1 text-slate-300">Del</kbd> key
              </div>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-700/80 mx-1" />

          {/* Quick Delete button right on the 3D canvas */}
          <button
            onClick={() => deleteComponent(selectedComp.id)}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/50 bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-red-950/40 transition-all"
            title="Delete this part"
          >
            <Trash2 size={13} />
            <span>Delete Part</span>
          </button>

          <button
            onClick={() => setSelection({ type: null, id: null })}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors text-xs font-bold"
            title="Deselect"
          >
            ✕
          </button>
        </div>
      )}

      {/* Colorbar contour legend */}
      {analysis && (
        <Colorbar min={0} max={ampMax} unit="mm" label="Amplitude" />
      )}

      {/* Symmetry Badge */}
      {design && isDroneDesign(design.name) && (
        <div className="absolute right-3 top-3 z-10 rounded-md border border-[#30363d] bg-[#0d1117]/85 px-2.5 py-1 text-[10px] font-mono text-[#8b949e] backdrop-blur-sm">
          Symmetry Model ×2 Diagonals (4 Arms)
        </div>
      )}
    </div>
  );
}
