"use client";

import { X } from "lucide-react";
import { useStore } from "@/lib/store/useStore";

export default function ErrorBanner() {
  const error = useStore((s) => s.ui.error);
  const setUi = useStore((s) => s.setUi);

  if (!error) return null;

  return (
    <div className="absolute left-1/2 top-14 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2.5 shadow-lg backdrop-blur-sm animate-slide-up">
      <span className="text-sm text-red-300">{error}</span>
      <button
        onClick={() => setUi({ error: null })}
        className="rounded p-0.5 text-red-400 hover:bg-red-500/20 hover:text-red-200"
      >
        <X size={14} />
      </button>
    </div>
  );
}