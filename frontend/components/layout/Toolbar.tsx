// → replaces src/components/layout/Toolbar.tsx
"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  Eye,
  GitCompare,
  Grid3X3,
  HelpCircle,
  LayoutGrid,
  Loader2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  ShieldCheck,
  Sparkles,
  Vibrate, // if your lucide-react version lacks this, swap for `Waves`
} from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { analyze, optimize } from "@/lib/api/client";

/** Percentage of the way `value` sits between min and max, for the slider's filled track. */
function fillPct(value: number, min: number, max: number) {
  if (max <= min) return "0%";
  return `${Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))}%`;
}

/** Icon-only toggle inside a segmented group. `label` is read by screen readers; `hint` is the tooltip. */
function SegButton({
  pressed,
  label,
  hint,
  onClick,
  children,
}: {
  pressed: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="seg-btn"
      aria-pressed={pressed}
      aria-label={label}
      title={hint}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function Toolbar() {
  const design = useStore((s) => s.design);
  const analysis = useStore((s) => s.analysis);
  const optimizeResult = useStore((s) => s.optimizeResult); // reactive: was getState() before
  const rpm = useStore((s) => s.rpm);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setOptimizeResult = useStore((s) => s.setOptimizeResult);
  const setActiveCandidate = useStore((s) => s.setActiveCandidate);
  const setRpm = useStore((s) => s.setRpm);
  const showToast = useStore((s) => s.showToast);

  const rpmMin = design?.analysis.rpm_min ?? 500;
  const rpmMax = design?.analysis.rpm_max ?? 12000;
  const compareOn = ui.viewMode === "compare";

  const handleRun = async () => {
    if (!design) return;
    setUi({ isAnalyzing: true, error: null });
    try {
      const result = await analyze(design);
      setAnalysis(result);
      const crit = result.findings.find((f) => f.severity === "critical" && f.rpm);
      if (crit?.rpm) setRpm(crit.rpm);
      showToast("Shaking simulation updated.", "success");
    } catch (e: unknown) {
      setUi({ error: e instanceof Error ? e.message : "Analysis failed" });
    } finally {
      setUi({ isAnalyzing: false });
    }
  };

  const handleOptimize = async () => {
    if (!design) return;
    setUi({ isOptimizing: true, error: null });
    try {
      const result = await optimize(design);
      setOptimizeResult(result);

      if (result.candidates.length === 0) {
        setActiveCandidate(null);
        showToast("No optimization candidates were returned.", "warning");
        return; // `finally` below still runs
      }

      const best = result.candidates[result.best_index];
      if (!best) {
        throw new Error("The optimizer returned an invalid best candidate index.");
      }

      setActiveCandidate(best);
      setUi({ viewMode: "compare" });

      if (best.reduction_pct > 0) {
        showToast(
          `Candidate found with a reported ${best.reduction_pct.toFixed(1)}% reduction. Review before applying.`,
          "success"
        );
      } else {
        showToast(
          "Candidates returned, but none showed a positive reduction.",
          "warning"
        );
      }
    } catch (e: unknown) {
      setUi({ error: e instanceof Error ? e.message : "Optimization failed" });
    } finally {
      setUi({ isOptimizing: false });
    }
  };

  return (
    <header className="z-30 flex min-h-14 shrink-0 select-none flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2">
      {/* Left: brand, examples, actions */}
      <div className="flex items-center gap-3">
        <div className="mr-1 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <Activity size={17} strokeWidth={2.25} aria-hidden />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink">ResonAI</div>
            <div className="hidden text-[11px] text-muted xl:block">
              Vibration playground
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-line" aria-hidden />

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setUi({ presetPickerOpen: true })}
          aria-label="Examples"
          title="Pick a pre-made drone, arm, or test structure"
        >
          <LayoutGrid size={15} aria-hidden />
          <span className="hidden xl:inline">Examples</span>
        </button>

        <div className="flex items-center gap-2">
          {/* The single filled button: the main action */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRun}
            disabled={!design || ui.isAnalyzing}
            title="Simulate motor vibrations to see what shakes"
          >
            {ui.isAnalyzing ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Play size={15} className="fill-current" aria-hidden />
            )}
            <span>Test shaking</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleOptimize}
            disabled={!design || !analysis || ui.isOptimizing}
            title="Finds softer rubber pads to reduce the shaking"
          >
            {ui.isOptimizing ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={15} aria-hidden />
            )}
            <span>Auto-fix</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={compareOn}
            aria-label="Before vs after"
            onClick={() => setUi({ viewMode: compareOn ? "single" : "compare" })}
            disabled={!optimizeResult}
            title="See before and after side by side in 3D"
          >
            <GitCompare size={15} aria-hidden />
            <span className="hidden xl:inline">Before vs after</span>
          </button>
        </div>
      </div>

      {/* Center: speed, zoom, view toggles */}
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-1"
          title="Motor spin speed in revolutions per minute (RPM)"
        >
          <label htmlFor="rpm-slider" className="text-xs font-medium text-ink-2">
            Speed
          </label>
          <input
            id="rpm-slider"
            type="range"
            min={rpmMin}
            max={rpmMax}
            step={50}
            value={rpm}
            onChange={(e) => setRpm(Number(e.target.value))}
            style={{ "--fill": fillPct(rpm, rpmMin, rpmMax) } as CSSProperties}
            className="w-28"
          />
          {/* Fixed min-width + tabular figures so the toolbar doesn't jitter while dragging */}
          <output
            htmlFor="rpm-slider"
            className="min-w-[6rem] text-right font-mono text-[13px] font-medium tabular-nums text-accent"
          >
            {rpm.toLocaleString()} <span className="text-xs text-muted">RPM</span>
          </output>
        </div>

        <div
          className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-1"
          title="Real vibrations are tiny. This magnifies the motion so you can see it."
        >
          <label htmlFor="zoom-slider" className="text-xs font-medium text-ink-2">
            Wiggle zoom
          </label>
          <input
            id="zoom-slider"
            type="range"
            min={1}
            max={200}
            value={ui.exaggeration}
            onChange={(e) => setUi({ exaggeration: Number(e.target.value) })}
            style={{ "--fill": fillPct(ui.exaggeration, 1, 200) } as CSSProperties}
            className="w-20"
          />
          <output
            htmlFor="zoom-slider"
            className="min-w-[3rem] text-right font-mono text-[13px] font-medium tabular-nums text-ink"
          >
            {ui.exaggeration}×
          </output>
        </div>

        <div className="seg" role="group" aria-label="View options">
          <SegButton
            pressed={ui.showMesh}
            label="Wireframe"
            hint="Show the wireframe skeleton"
            onClick={() => setUi({ showMesh: !ui.showMesh })}
          >
            <Grid3X3 size={15} aria-hidden />
          </SegButton>
          <SegButton
            pressed={ui.showGhost}
            label="Resting shape"
            hint="Show the resting shape (where parts sit when the motors are off)"
            onClick={() => setUi({ showGhost: !ui.showGhost })}
          >
            <Eye size={15} aria-hidden />
          </SegButton>
          <SegButton
            pressed={ui.animating}
            label="Animate vibration"
            hint="Play or pause the vibration animation"
            onClick={() => setUi({ animating: !ui.animating })}
          >
            <Vibrate size={15} aria-hidden />
          </SegButton>
        </div>
      </div>

      {/* Right: help, validation, panel toggles */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={ui.showGuideBanner}
          aria-label="How it works"
          onClick={() => setUi({ showGuideBanner: !ui.showGuideBanner })}
          title="Show or hide the beginner guide"
        >
          <HelpCircle size={15} aria-hidden />
          <span className="hidden xl:inline">How it works</span>
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          aria-label="Accuracy tests"
          onClick={() => setUi({ validationModalOpen: true })}
          title="See engineering validation and accuracy tests"
        >
          <ShieldCheck size={15} aria-hidden />
          <span className="hidden xl:inline">Accuracy tests</span>
        </button>

        <div className="h-5 w-px bg-line" aria-hidden />

        <div className="seg" role="group" aria-label="Panels">
          <SegButton
            pressed={ui.leftSidebarOpen}
            label="Parts list"
            hint="Show or hide the parts list"
            onClick={() => setUi({ leftSidebarOpen: !ui.leftSidebarOpen })}
          >
            <PanelLeft size={15} aria-hidden />
          </SegButton>
          <SegButton
            pressed={ui.bottomPanelOpen}
            label="Charts and diagnostics"
            hint="Show or hide charts and diagnostics"
            onClick={() => setUi({ bottomPanelOpen: !ui.bottomPanelOpen })}
          >
            <PanelBottom size={15} aria-hidden />
          </SegButton>
          <SegButton
            pressed={ui.rightPanelOpen}
            label="Inspector and assistant"
            hint="Show or hide the part inspector and AI assistant"
            onClick={() => setUi({ rightPanelOpen: !ui.rightPanelOpen })}
          >
            <PanelRight size={15} aria-hidden />
          </SegButton>
        </div>
      </div>
    </header>
  );
}