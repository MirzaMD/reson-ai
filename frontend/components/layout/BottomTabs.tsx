"use client";

import { useMemo } from "react";
import { useStore, type BottomTab } from "@/lib/store/useStore";
import FrfPlot from "@/components/plots/FrfPlot";
import CampbellPlot from "@/components/plots/CampbellPlot";
import HeatmapPlot from "@/components/plots/HeatmapPlot";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { ChevronDown, ChevronUp, TrendingUp, Activity, Flame, AlertCircle } from "lucide-react";
import clsx from "clsx";

export default function BottomTabs() {
  const bottomTab = useStore((s) => s.ui.bottomTab);
  const bottomPanelOpen = useStore((s) => s.ui.bottomPanelOpen);
  const setUi = useStore((s) => s.setUi);
  const analysis = useStore((s) => s.analysis);

  // Key readout summary calculation
  const keyReadout = useMemo(() => {
    if (!analysis || !analysis.components || analysis.components.length === 0) {
      return {
        text: "No simulation results. Click Run in the top bar to compute frequency curves.",
        status: "none" as const,
      };
    }

    // Prioritize camera component, or component with worst severity/ratio
    const cameraComp = analysis.components.find((c) => c.id === "camera");
    const targetComp =
      cameraComp ??
      [...analysis.components]
        .filter((c) => c.limit_g != null)
        .sort((a, b) => (b.peak_accel_g / (b.limit_g ?? 1)) - (a.peak_accel_g / (a.limit_g ?? 1)))[0] ??
      analysis.components[0];

    if (!targetComp) {
      return { text: "No components evaluated.", status: "none" as const };
    }

    const name = targetComp.id;
    const accel = targetComp.peak_accel_g.toFixed(2);
    const limit = targetComp.limit_g != null ? targetComp.limit_g.toFixed(2) : null;
    const rpm = targetComp.at_rpm.toLocaleString();
    const hz = (targetComp.at_rpm / 60).toFixed(1);

    if (limit) {
      return {
        text: `${name}: ${accel} g RMS (limit ${limit} g RMS) at ${rpm} RPM (${hz} Hz)`,
        status: targetComp.status,
      };
    }
    return {
      text: `${name}: ${accel} g RMS peak at ${rpm} RPM (${hz} Hz)`,
      status: targetComp.status,
    };
  }, [analysis]);

  const TABS: { id: BottomTab; label: string; icon: React.ElementType }[] = [
    { id: "frf", label: "Response", icon: TrendingUp },
    { id: "campbell", label: "Campbell", icon: Activity },
    { id: "heatmap", label: "Heatmap", icon: Flame },
  ];

  return (
    <div
      className={clsx(
        "flex shrink-0 flex-col border-t border-line bg-surface transition-all duration-150 z-20",
        bottomPanelOpen ? "h-[280px]" : "h-10"
      )}
    >
      {/* 40 px Strip Header / Bar */}
      <div
        className="flex h-10 shrink-0 select-none items-center justify-between border-b border-line bg-panel/50 px-3 cursor-pointer"
        onClick={() => setUi({ bottomPanelOpen: !bottomPanelOpen })}
      >
        {/* Left: Tab selectors (visible always or when expanded) */}
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = bottomTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={clsx(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-surface text-ink font-semibold shadow-2xs"
                    : "text-muted hover:text-ink hover:bg-panel"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setUi({ bottomTab: t.id, bottomPanelOpen: true });
                }}
              >
                <Icon size={13} className={isActive ? "text-accent" : "text-muted"} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Center/Right: Key Readout indicator */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-mono truncate">
            {keyReadout.status === "critical" && (
              <span className="flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.2 text-[10px] font-semibold text-danger uppercase font-mono">
                <AlertCircle size={11} />
                <span>Critical</span>
              </span>
            )}
            {keyReadout.status === "warning" && (
              <span className="rounded bg-warn-soft px-1.5 py-0.2 text-[10px] font-semibold text-warn uppercase font-mono">
                Warning
              </span>
            )}
            {keyReadout.status === "ok" && (
              <span className="rounded bg-ok-soft px-1.5 py-0.2 text-[10px] font-semibold text-ok uppercase font-mono">
                Safe
              </span>
            )}
            <span className="text-ink-2 truncate text-[11px]">{keyReadout.text}</span>
          </div>

          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded text-muted hover:text-ink hover:bg-panel transition-colors"
            title={bottomPanelOpen ? "Collapse plots" : "Expand plots"}
            aria-label={bottomPanelOpen ? "Collapse plots" : "Expand plots"}
          >
            {bottomPanelOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </div>

      {/* Expanded Chart Area (Mounts strictly the active tab) */}
      {bottomPanelOpen && (
        <div className="flex-1 overflow-hidden p-2 bg-surface">
          <ErrorBoundary fallbackTitle="Plot Error">
            {bottomTab === "frf" && <FrfPlot />}
            {bottomTab === "campbell" && <CampbellPlot />}
            {bottomTab === "heatmap" && <HeatmapPlot />}
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
