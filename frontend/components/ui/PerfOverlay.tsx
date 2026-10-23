"use client";

import { useEffect, useRef, useState, Profiler, type ReactNode } from "react";

interface PerfStats {
  commitsPerSec: number;
  lastDurationMs: number;
  enabled: boolean;
}

export const perfState = {
  enabled: false,
};

export function usePerfMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isPerf = new URLSearchParams(window.location.search).get("perf") === "1";
      setEnabled(isPerf);
      perfState.enabled = isPerf;
    }
  }, []);

  return enabled;
}

export default function PerfOverlay({ children }: { children: ReactNode }) {
  const isPerf = usePerfMode();
  const [stats, setStats] = useState<PerfStats>({
    commitsPerSec: 0,
    lastDurationMs: 0,
    enabled: false,
  });

  const commitTimestamps = useRef<number[]>([]);
  const lastUpdate = useRef<number>(Date.now());

  const onRender = (
    _id: string,
    _phase: "mount" | "update" | "nested-update",
    actualDuration: number
  ) => {
    if (!isPerf) return;
    const now = performance.now();
    commitTimestamps.current.push(now);

    // Keep timestamps from the last 1000ms
    const oneSecAgo = now - 1000;
    while (
      commitTimestamps.current.length > 0 &&
      commitTimestamps.current[0] < oneSecAgo
    ) {
      commitTimestamps.current.shift();
    }

    // Update UI stats at most 4 times a second to prevent profiling self-interference
    if (now - lastUpdate.current > 250) {
      lastUpdate.current = now;
      setStats({
        commitsPerSec: commitTimestamps.current.length,
        lastDurationMs: actualDuration,
        enabled: true,
      });
    }
  };

  if (!isPerf) {
    return <>{children}</>;
  }

  const commitColor =
    stats.commitsPerSec <= 4
      ? "text-emerald-400 bg-emerald-950/80 border-emerald-500/40"
      : stats.commitsPerSec <= 20
      ? "text-amber-400 bg-amber-950/80 border-amber-500/40"
      : "text-red-400 bg-red-950/80 border-red-500/40";

  return (
    <Profiler id="ResonAI_Root" onRender={onRender}>
      {children}
      <div className="fixed bottom-3 right-3 z-50 flex items-center gap-2 font-mono text-[11px] backdrop-blur-md">
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 shadow-xl ${commitColor}`}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
          <span>
            React Commits: <strong>{stats.commitsPerSec} / sec</strong>
          </span>
          <span className="opacity-40">|</span>
          <span>Render: {stats.lastDurationMs.toFixed(1)} ms</span>
          <span className="opacity-40">|</span>
          <span className="text-[10px] text-cyan-300 font-sans font-medium">?perf=1</span>
        </div>
      </div>
    </Profiler>
  );
}
