"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  message?: string;
  isOptimizing?: boolean;
}

const OPTIMIZE_STAGES = [
  "Evaluating mount stiffness (kv)...",
  "Tuning isolator damping (zeta)...",
  "Checking harmonic sweep attenuation...",
  "Converging optimal candidate...",
];

export default function LoadingOverlay({
  message = "Solving dynamics...",
  isOptimizing = false,
}: Props) {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    if (!isOptimizing) return;
    const interval = setInterval(() => {
      setStageIdx((i) => (i + 1) % OPTIMIZE_STAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isOptimizing]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-canvas/40 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="flex flex-col items-center gap-2.5 rounded-lg border border-line bg-surface px-6 py-4 shadow-lg text-center max-w-xs">
        <div className="relative flex h-8 w-8 items-center justify-center">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
        <div>
          <p className="text-xs font-semibold text-ink">
            {isOptimizing ? OPTIMIZE_STAGES[stageIdx] : message}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-muted">
            {isOptimizing ? "Isolator Optimization (ROM Search)" : "Reduced-Order Harmonic Sweep"}
          </p>
        </div>
      </div>
    </div>
  );
}
