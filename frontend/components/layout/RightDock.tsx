"use client";

import { useStore } from "@/lib/store/useStore";
import DetailsPanel from "./DetailsPanel";
import ChatPanel from "@/components/panels/ChatPanel";
import FindingsPanel from "@/components/panels/FindingsPanel";
import { Sliders, Sparkles, AlertTriangle, ChevronRight, ChevronLeft } from "lucide-react";
import clsx from "clsx";

export default function RightDock() {
  const rightTab = useStore((s) => s.ui.rightTab);
  const rightPanelOpen = useStore((s) => s.ui.rightPanelOpen);
  const analysis = useStore((s) => s.analysis);
  const setUi = useStore((s) => s.setUi);

  const findingsCount = analysis?.findings.length ?? 0;
  const criticalCount = analysis?.findings.filter((f) => f.severity === "critical").length ?? 0;

  // Collapsed state
  if (!rightPanelOpen) {
    return (
      <aside className="relative flex h-full w-12 shrink-0 flex-col items-center border-l border-line bg-surface py-2 z-10 transition-all duration-150">
        <button
          type="button"
          onClick={() => setUi({ rightPanelOpen: true })}
          className="btn-ghost flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-ink hover:bg-panel transition-colors"
          title="Expand Right Dock"
          aria-label="Expand Right Dock"
        >
          <ChevronLeft size={15} />
        </button>

        <div className="my-2 h-px w-6 bg-line-subtle" />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setUi({ rightPanelOpen: true, rightTab: "findings" })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-accent hover:bg-panel transition-colors relative"
            title="Findings"
            aria-label="Findings"
          >
            <AlertTriangle size={15} className={criticalCount > 0 ? "text-danger" : "text-muted"} />
            {findingsCount > 0 && (
              <span
                className={clsx(
                  "absolute top-1 right-1 h-1.5 w-1.5 rounded-full",
                  criticalCount > 0 ? "bg-danger" : "bg-accent"
                )}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setUi({ rightPanelOpen: true, rightTab: "copilot" })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-accent hover:bg-panel transition-colors"
            title="Copilot"
            aria-label="Copilot"
          >
            <Sparkles size={15} />
          </button>

          <button
            type="button"
            onClick={() => setUi({ rightPanelOpen: true, rightTab: "details" })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-accent hover:bg-panel transition-colors"
            title="Details Inspector"
            aria-label="Details"
          >
            <Sliders size={15} />
          </button>
        </div>
      </aside>
    );
  }

  // Expanded 340 px Right Dock
  return (
    <aside className="relative flex h-full w-[340px] shrink-0 flex-col border-l border-line bg-surface z-10 transition-all duration-150">
      {/* Tab Header (ONE visible tab at a time) */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-panel/50 px-2">
        <div className="flex items-center gap-1">
          {/* Tab 1: Findings */}
          <button
            type="button"
            onClick={() => setUi({ rightTab: "findings" })}
            className={clsx(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              rightTab === "findings"
                ? "bg-surface text-ink shadow-2xs font-semibold"
                : "text-muted hover:text-ink hover:bg-panel"
            )}
          >
            <AlertTriangle
              size={13}
              className={criticalCount > 0 ? "text-danger" : rightTab === "findings" ? "text-accent" : "text-muted"}
            />
            <span>Findings</span>
            {findingsCount > 0 && (
              <span
                className={clsx(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-mono font-semibold",
                  criticalCount > 0
                    ? "bg-danger-soft text-danger"
                    : "bg-panel text-muted"
                )}
              >
                {findingsCount}
              </span>
            )}
          </button>

          {/* Tab 2: Copilot */}
          <button
            type="button"
            onClick={() => setUi({ rightTab: "copilot" })}
            className={clsx(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              rightTab === "copilot"
                ? "bg-surface text-ink shadow-2xs font-semibold"
                : "text-muted hover:text-ink hover:bg-panel"
            )}
          >
            <Sparkles size={13} className={rightTab === "copilot" ? "text-accent" : "text-muted"} />
            <span>Copilot</span>
          </button>

          {/* Tab 3: Details */}
          <button
            type="button"
            onClick={() => setUi({ rightTab: "details" })}
            className={clsx(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              rightTab === "details"
                ? "bg-surface text-ink shadow-2xs font-semibold"
                : "text-muted hover:text-ink hover:bg-panel"
            )}
          >
            <Sliders size={13} className={rightTab === "details" ? "text-accent" : "text-muted"} />
            <span>Details</span>
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setUi({ rightPanelOpen: false })}
          className="p-1 rounded text-muted hover:text-ink hover:bg-panel transition-colors"
          title="Collapse dock"
          aria-label="Collapse dock"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Dock Content (renders strictly the visible tab) */}
      <div className="flex-1 overflow-hidden">
        {rightTab === "findings" && <FindingsPanel />}
        {rightTab === "copilot" && <ChatPanel />}
        {rightTab === "details" && <DetailsPanel />}
      </div>
    </aside>
  );
}
