"use client";

import { useStore } from "@/lib/store/useStore";
import { Sparkles, X } from "lucide-react";

export default function KidFriendlyGuide() {
  const show = useStore((s) => s.ui.showGuideBanner);
  const setUi = useStore((s) => s.setUi);

  if (!show) return null;

  return (
    <div className="relative border-b border-cyan-500/20 bg-gradient-to-r from-blue-950/40 via-cyan-950/30 to-slate-950/50 px-4 py-2.5 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-md shadow-cyan-500/30">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">
                How this works (Simple 3 Steps!):
              </span>
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                Beginner Friendly
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/30 text-[10px] font-bold text-blue-300">1</span>
                <span>🏎️ <strong>Slide Speed (RPM)</strong> to see how parts vibrate</span>
              </span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/30 text-[10px] font-bold text-amber-300">2</span>
                <span>👀 <strong>Green is smooth</strong>, <strong>Red is shaking dangerously</strong></span>
              </span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/30 text-[10px] font-bold text-emerald-300">3</span>
                <span>✨ Click <strong>&quot;Auto-Fix&quot;</strong> to cushion and stop shaking!</span>
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-400 font-medium">
                🗑️ Click any part to inspect or delete it!
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setUi({ showGuideBanner: false })}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          title="Dismiss guide (you can reopen with ? in the top bar)"
        >
          <span>Hide</span>
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
