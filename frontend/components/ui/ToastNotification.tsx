"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store/useStore";
import { RotateCcw, X, CheckCircle2, Info, AlertTriangle } from "lucide-react";

export default function ToastNotification() {
  const toast = useStore((s) => s.ui.toast);
  const clearToast = useStore((s) => s.clearToast);
  const undo = useStore((s) => s.undo);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      clearToast();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-cyan-500/40 bg-[#0d1520]/95 px-4 py-2 text-xs text-white shadow-2xl backdrop-blur-md animate-slide-up">
      <div className="flex items-center gap-2">
        {toast.type === "success" && (
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
        )}
        {toast.type === "warning" && (
          <AlertTriangle size={15} className="text-amber-400 shrink-0" />
        )}
        {(toast.type === "info" || !toast.type) && (
          <Info size={15} className="text-cyan-400 shrink-0" />
        )}
        <span className="font-medium text-slate-100">{toast.message}</span>
      </div>

      <div className="flex items-center gap-1.5 ml-2">
        <button
          onClick={() => {
            undo();
            clearToast();
          }}
          className="flex items-center gap-1 rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/30 transition-colors"
          title="Undo previous action"
        >
          <RotateCcw size={11} />
          <span>Undo</span>
        </button>

        <button
          onClick={clearToast}
          className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
