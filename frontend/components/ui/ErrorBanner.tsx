"use client";

import { X, AlertCircle, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { healthCheck } from "@/lib/api/client";

export default function ErrorBanner() {
  const error = useStore((s) => s.ui.error);
  const setUi = useStore((s) => s.setUi);

  if (!error) return null;

  const isOffline =
    error.toLowerCase().includes("cannot reach") ||
    error.toLowerCase().includes("failed to fetch") ||
    error.toLowerCase().includes("offline");

  const handleRetry = async () => {
    const ok = await healthCheck();
    if (ok) {
      setUi({ error: null });
    }
  };

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-md border border-danger/30 bg-danger-soft px-3.5 py-2 text-xs text-danger shadow-md animate-in fade-in slide-in-from-top-2 duration-150 max-w-lg">
      <AlertCircle size={15} className="shrink-0 text-danger" />
      <span className="font-medium text-danger flex-1 leading-snug">{error}</span>
      {isOffline && (
        <button
          type="button"
          onClick={handleRetry}
          className="flex items-center gap-1 rounded bg-surface border border-danger/30 px-2 py-0.5 text-[11px] font-semibold text-danger hover:bg-danger hover:text-white transition-colors shrink-0"
        >
          <RefreshCw size={11} />
          <span>Retry</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setUi({ error: null })}
        className="rounded p-0.5 text-danger/70 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
        title="Dismiss error"
        aria-label="Dismiss error"
      >
        <X size={14} />
      </button>
    </div>
  );
}
