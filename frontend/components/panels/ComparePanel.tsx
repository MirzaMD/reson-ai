"use client";

import { useStore } from "@/lib/store/useStore";
import type { MetricsBlock } from "@/lib/types/contract";
import { ArrowRight, Check, Sparkles, TrendingDown, Weight, Activity } from "lucide-react";
import clsx from "clsx";

export default function ComparePanel() {
  const optimizeResult = useStore((s) => s.optimizeResult);
  const activeCandidate = useStore((s) => s.activeCandidate);
  const setActiveCandidate = useStore((s) => s.setActiveCandidate);
  const applyCandidate = useStore((s) => s.applyCandidate);
  const setUi = useStore((s) => s.setUi);

  if (!optimizeResult || optimizeResult.candidates.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[#8b949e]">
        Run Auto-Fix in the top bar to generate smoother designs!
      </div>
    );
  }

  const cand = activeCandidate ?? optimizeResult.candidates[0];

  const getCameraPeak = (m?: MetricsBlock): number => {
    if (!m) return 0.5;
    if (typeof m.camera_peak_g === "number") return m.camera_peak_g;
    if (m.components) {
      if (m.components.camera?.peak_accel_g != null) return m.components.camera.peak_accel_g;
      const values = Object.values(m.components);
      if (values.length > 0 && values[0]?.peak_accel_g != null) return values[0].peak_accel_g;
    }
    return 0.5;
  };

  const getStressRatio = (m?: MetricsBlock): number => {
    if (!m) return 0.15;
    if (typeof m.max_stress_ratio === "number") return m.max_stress_ratio;
    if (typeof m.stress_ratio === "number") return m.stress_ratio;
    return 0.15;
  };

  const getMass = (m?: MetricsBlock): number => {
    if (!m) return 0.28;
    if (typeof m.mass_kg === "number") return m.mass_kg;
    if (typeof m.mass_added_kg === "number") return 0.28 + m.mass_added_kg;
    return 0.28;
  };

  return (
    <div className="flex flex-col gap-3 p-3.5 text-xs">
      {/* Candidate Switcher Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <Sparkles size={12} />
          </div>
          <span className="font-bold uppercase tracking-wider text-white text-[11px]">
            Auto-Fix Solutions:
          </span>
          <div className="flex gap-1.5">
            {optimizeResult.candidates.map((c) => (
              <button
                key={c.rank}
                className={clsx(
                  "rounded-lg border px-3 py-1 text-xs font-bold transition-all",
                  cand.rank === c.rank
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300 shadow-sm"
                    : "border-[#30363d] bg-[#161b22] text-[#8b949e] hover:border-[#484f58] hover:text-[#e6edf3]"
                )}
                onClick={() => setActiveCandidate(c)}
              >
                Option #{c.rank} (−{c.reduction_pct.toFixed(0)}% Shaking)
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400 font-semibold">
          <span>⚡ Computed in {optimizeResult.solve_ms.toFixed(1)} ms</span>
        </div>
      </div>

      {/* Metrics Comparison Strip */}
      <div className="grid grid-cols-3 gap-2.5">
        <MetricCard
          label="Shaking Force (Camera)"
          icon={Activity}
          before={getCameraPeak(cand.metrics_before)}
          after={getCameraPeak(cand.metrics_after)}
          unit=" g"
          sub="Lower is much better! (<0.5g is safe)"
        />
        <MetricCard
          label="Arm Bending Stress"
          icon={TrendingDown}
          before={getStressRatio(cand.metrics_before)}
          after={getStressRatio(cand.metrics_after)}
          unit=""
          sub="Strength ratio (<0.50 is safe)"
        />
        <MetricCard
          label="Total Drone Weight"
          icon={Weight}
          before={getMass(cand.metrics_before)}
          after={getMass(cand.metrics_after)}
          unit=" kg"
          sub="Total payload & frame weight"
        />
      </div>

      {/* Changes Summary & Actions */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#21262d] bg-[#111820] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
            What was tuned to stop shaking:
          </p>
          <div className="flex flex-wrap gap-2">
            {cand.changes.map((ch, i) => (
              <span
                key={i}
                className="rounded-lg bg-[#161b22] px-2.5 py-1 font-mono text-[11px] text-slate-200 border border-[#30363d]"
              >
                ✨ {ch.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            className="rounded-lg border border-[#30363d] bg-transparent hover:bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors"
            onClick={() => setUi({ viewMode: "single" })}
          >
            Exit Compare
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-emerald-700/30 transition-all"
            onClick={() => {
              applyCandidate(cand);
              setUi({ viewMode: "single" });
            }}
          >
            <Check size={14} />
            <span>Keep This Fix ✅</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  icon: Icon,
  before,
  after,
  unit,
  sub,
}: {
  label: string;
  icon: React.ElementType;
  before: number;
  after: number;
  unit: string;
  sub?: string;
}) {
  const reduction = before > 0 ? ((1 - after / before) * 100).toFixed(0) : "0";

  return (
    <div className="flex flex-col justify-between rounded-xl border border-[#30363d] bg-[#161b22] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
          <Icon size={13} className="text-cyan-400" />
          <span>{label}</span>
        </div>
        {Number(reduction) > 0 && (
          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
            −{reduction}%
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 font-mono text-xs">
        <span className="text-red-400 font-semibold line-through">
          {before.toFixed(2)}
          {unit}
        </span>
        <ArrowRight size={12} className="text-[#6e7681]" />
        <span className="text-emerald-400 font-bold text-sm">
          {after.toFixed(2)}
          {unit}
        </span>
      </div>

      {sub && <p className="mt-1 text-[10px] text-[#6e7681]">{sub}</p>}
    </div>
  );
}
