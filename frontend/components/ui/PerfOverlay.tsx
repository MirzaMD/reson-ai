"use client";

import { useRef, useState, Profiler, type ReactNode } from "react";

interface PerfStats {
  commitsPerSec: number;
  lastDurationMs: number;
  enabled: boolean;
}

export const perfState = {
  enabled: false,
};

export function usePerfMode() {
  const [enabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const isPerf = new URLSearchParams(window.location.search).get("perf") === "1";
      perfState.enabled = isPerf;
      return isPerf;
    }
    return false;
  });

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
  const lastUpdate = useRef<number>(0);

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

    if (lastUpdate.current === 0) {
      lastUpdate.current = now;
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

  return (
    <Profiler id="App" onRender={onRender}>
      {children}
      {/* Dev-only perf overlay */}
      <div className="fixed bottom-3 right-3 z-50 pointer-events-none rounded-md border border-line bg-surface/95 px-3 py-2 font-mono text-[11px] text-ink shadow-lg backdrop-blur-xs">
        <div className="font-semibold text-ink mb-1 flex items-center gap-1.5 text-xs">
          <span className="h-2 w-2 rounded-full bg-ok animate-pulse" />
          <span>PERF PROFILER (?perf=1)</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
          <span className="text-muted">Commits / sec:</span>
          <span
            className={
              stats.commitsPerSec > 10
                ? "text-danger font-bold"
                : stats.commitsPerSec > 2
                ? "text-warn font-semibold"
                : "text-ok font-semibold"
            }
          >
            {stats.commitsPerSec} /s
          </span>
          <span className="text-muted">Render time:</span>
          <span className="text-ink-2">
            {stats.lastDurationMs.toFixed(2)} ms
          </span>
        </div>
      </div>
    </Profiler>
  );
}
