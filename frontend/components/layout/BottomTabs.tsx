"use client";

import { useStore, type BottomTab } from "@/lib/store/useStore";
import FrfPlot from "@/components/plots/FrfPlot";
import CampbellPlot from "@/components/plots/CampbellPlot";
import HeatmapPlot from "@/components/plots/HeatmapPlot";
import FindingsPanel from "@/components/panels/FindingsPanel";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { ChevronDown, ChevronUp, Activity, AlertTriangle, TrendingUp, Flame } from "lucide-react";
import clsx from "clsx";

export default function BottomTabs() {
  const bottomTab = useStore((s) => s.ui.bottomTab);
  const bottomPanelOpen = useStore((s) => s.ui.bottomPanelOpen);
  const setUi = useStore((s) => s.setUi);
  const analysis = useStore((s) => s.analysis);

  const findingsCount = analysis?.findings.length ?? 0;
  const criticalCount =
    analysis?.findings.filter((f) => f.severity === "critical").length ?? 0;

  const TABS: {
    id: BottomTab;
    label: string;
    sublabel: string;
    icon: React.ElementType;
    badge?: string;
    badgeColor?: string;
  }[] = [
    {
      id: "findings",
      label: "Health Report",
      sublabel: "Findings",
      icon: AlertTriangle,
      badge: findingsCount > 0 ? `${findingsCount}` : undefined,
      badgeColor: criticalCount > 0 ? "bg-red-500 text-white" : "bg-emerald-500 text-white",
    },
    {
      id: "frf",
      label: "Shake vs Speed",
      sublabel: "FRF Curve",
      icon: TrendingUp,
    },
    {
      id: "campbell",
      label: "Danger Zones",
      sublabel: "Resonance",
      icon: Activity,
    },
    {
      id: "heatmap",
      label: "Shake Heatmap",
      sublabel: "Spatial",
      icon: Flame,
    },
  ];

  return (
    <div
      className={clsx(
        "flex shrink-0 flex-col border-t border-[#21262d] bg-[#0b0f15] transition-all duration-200",
        bottomPanelOpen ? "h-64" : "h-11"
      )}
    >
      {/* Tab bar */}
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[#21262d] bg-[#0d1117] px-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = bottomTab === t.id;
          return (
            <button
              key={t.id}
              className={clsx(
                "relative flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-all rounded-lg",
                isActive
                  ? "bg-blue-500/15 text-blue-300"
                  : "text-slate-400 hover:bg-[#161b22] hover:text-slate-200"
              )}
              onClick={() => setUi({ bottomTab: t.id, bottomPanelOpen: true })}
            >
              <Icon size={14} className={isActive ? "text-cyan-400" : "text-slate-400"} />
              <span>{t.label}</span>
              <span className="text-[10px] text-slate-400 font-normal">({t.sublabel})</span>
              {t.badge && (
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.2 text-[9px] font-bold font-mono",
                    t.badgeColor
                  )}
                >
                  {t.badge}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-cyan-400 rounded-full" />
              )}
            </button>
          );
        })}

        {!analysis && (
          <span className="ml-auto pr-3 text-[11px] text-slate-400">
            Click &quot;Test Shaking&quot; above to see graphs &amp; health results
          </span>
        )}

        {/* Minimize / Expand Toggle Button */}
        <button
          onClick={() => setUi({ bottomPanelOpen: !bottomPanelOpen })}
          className={clsx(
            "rounded-lg p-1.5 text-slate-400 hover:bg-[#161b22] hover:text-white transition-colors",
            analysis ? "ml-auto" : "ml-2"
          )}
          title={bottomPanelOpen ? "Minimize Diagnostics Dock" : "Expand Diagnostics Dock"}
        >
          {bottomPanelOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {/* Tab Panels with 1-line kid-friendly header */}
      {bottomPanelOpen && (
        <div className="relative flex-1 overflow-hidden flex flex-col">
          {/* Friendly Tab Explainer */}
          <div className="flex items-center justify-between border-b border-[#21262d] bg-[#0c1017] px-4 py-1 text-[11px] text-slate-400">
            {bottomTab === "findings" && (
              <span>
                📋 <strong>Doctor&apos;s Checkup:</strong> Tells you which parts are safe (green) and which are shaking too hard (red).
              </span>
            )}
            {bottomTab === "frf" && (
              <span>
                📈 <strong>Shake vs Speed:</strong> Shows how much parts wobble at each motor speed. Keep lines below the dashed limit!
              </span>
            )}
            {bottomTab === "campbell" && (
              <span>
                ⚡ <strong>Resonance Lines:</strong> Where lines intersect is a danger zone where the machine vibrates like a tuning fork.
              </span>
            )}
            {bottomTab === "heatmap" && (
              <span>
                🔥 <strong>Heat Map:</strong> Red and yellow show which spots on the frame are bending and shaking the most.
              </span>
            )}

            {analysis && (
              <span className="font-mono text-[10px] text-emerald-400 font-semibold shrink-0">
                ⚡ Solved in {analysis.meta.solve_ms.toFixed(1)} ms
              </span>
            )}
          </div>

          <div className="relative flex-1 overflow-hidden">
            <div className={clsx("h-full w-full", bottomTab === "frf" ? "block" : "hidden")}>
              <ErrorBoundary fallbackTitle="FRF Chart Recovery">
                <FrfPlot />
              </ErrorBoundary>
            </div>

            <div className={clsx("h-full w-full", bottomTab === "campbell" ? "block" : "hidden")}>
              <ErrorBoundary fallbackTitle="Campbell Diagram Recovery">
                <CampbellPlot />
              </ErrorBoundary>
            </div>

            <div className={clsx("h-full w-full", bottomTab === "heatmap" ? "block" : "hidden")}>
              <ErrorBoundary fallbackTitle="Heatmap Recovery">
                <HeatmapPlot />
              </ErrorBoundary>
            </div>

            <div className={clsx("h-full w-full", bottomTab === "findings" ? "block" : "hidden")}>
              <ErrorBoundary fallbackTitle="Findings Panel Recovery">
                <FindingsPanel />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
