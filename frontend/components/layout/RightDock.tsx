"use client";

import { useStore } from "@/lib/store/useStore";
import DetailsPanel from "./DetailsPanel";
import ChatPanel from "@/components/panels/ChatPanel";
import { Sliders, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";
import clsx from "clsx";

export default function RightDock() {
  const rightTab = useStore((s) => s.ui.rightTab);
  const rightPanelOpen = useStore((s) => s.ui.rightPanelOpen);
  const setUi = useStore((s) => s.setUi);

  if (!rightPanelOpen) {
    return (
      <button
        onClick={() => setUi({ rightPanelOpen: true })}
        className="absolute right-3 top-14 z-20 flex items-center gap-2 rounded-xl border border-white/[0.1] bg-[#0d1117]/90 px-3 py-2 text-xs font-semibold text-[#cbd5e1] shadow-2xl backdrop-blur-md transition-all hover:bg-[#161b22] hover:text-white hover:border-cyan-500/40"
        title="Open Part Inspector & AI Assistant"
      >
        <ChevronLeft size={13} className="text-[#6e7681]" />
        <Sliders size={14} className="text-cyan-400" />
        <span>Inspector</span>
      </button>
    );
  }

  return (
    <aside className="relative flex h-full w-80 shrink-0 flex-col border-l border-[#21262d] bg-[#0b0f15] shadow-2xl transition-all">
      {/* Top Tab Bar: Inspector vs AI Assistant */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#21262d] bg-[#0d1117] px-2.5">
        <div className="flex gap-1.5">
          <button
            onClick={() => setUi({ rightTab: "details" })}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
              rightTab === "details"
                ? "bg-blue-500/20 text-blue-300 shadow-sm"
                : "text-slate-400 hover:bg-[#161b22] hover:text-white"
            )}
          >
            <Sliders size={13} className={rightTab === "details" ? "text-cyan-400" : "text-slate-500"} />
            <span>Part Inspector</span>
          </button>

          <button
            onClick={() => setUi({ rightTab: "chat" })}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
              rightTab === "chat"
                ? "bg-cyan-500/20 text-cyan-300 shadow-sm"
                : "text-slate-400 hover:bg-[#161b22] hover:text-white"
            )}
          >
            <Sparkles size={13} className={rightTab === "chat" ? "text-cyan-400" : "text-slate-500"} />
            <span>AI Assistant 🤖</span>
          </button>
        </div>

        {/* Collapse Button */}
        <button
          onClick={() => setUi({ rightPanelOpen: false })}
          className="rounded-lg p-1 text-slate-400 hover:bg-[#161b22] hover:text-white transition-colors"
          title="Minimize Panel"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Dock Content */}
      <div className="flex-1 overflow-hidden">
        <div className={clsx("h-full w-full", rightTab === "details" ? "block" : "hidden")}>
          <DetailsPanel />
        </div>
        <div className={clsx("h-full w-full", rightTab === "chat" ? "block" : "hidden")}>
          <ChatPanel />
        </div>
      </div>
    </aside>
  );
}
