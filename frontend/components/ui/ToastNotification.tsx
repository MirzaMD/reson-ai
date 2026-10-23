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
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-2 text-xs text-ink shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="flex items-center gap-2">
        {toast.type === "success" && (
          <CheckCircle2 size={15} className="text-ok shrink-0" />
        )}
        {toast.type === "warning" && (
          <AlertTriangle size={15} className="text-warn shrink-0" />
        )}
        {(toast.type === "info" || !toast.type) && (
          <Info size={15} className="text-accent shrink-0" />
        )}
        <span className="font-medium text-ink truncate max-w-sm">{toast.message}</span>
      </div>

      <div className="flex items-center gap-1.5 ml-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            undo();
            clearToast();
          }}
          className="flex items-center gap-1 rounded bg-panel border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2 hover:bg-line-subtle transition-colors"
          title="Undo previous action"
        >
          <RotateCcw size={11} />
          <span>Undo</span>
        </button>

        <button
          type="button"
          onClick={clearToast}
          className="rounded p-0.5 text-muted hover:text-ink transition-colors"
          title="Dismiss notification"
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
