"use client";

import { Activity } from "lucide-react";

interface Props {
  message?: string;
}

export default function LoadingOverlay({ message = "Solving dynamics…" }: Props) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="flex flex-col items-center gap-3.5 rounded-2xl border border-white/[0.1] bg-[#0c111a]/95 px-8 py-6 shadow-2xl shadow-cyan-950/40 text-center">
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-cyan-400" />
          <Activity size={18} className="animate-pulse text-cyan-400" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-[#f1f5f9]">{message}</p>
          <p className="mt-0.5 font-mono text-[11px] text-[#64748b]">Euler-Bernoulli Reduced-Order ROM</p>
        </div>
      </div>
    </div>
  );
}


