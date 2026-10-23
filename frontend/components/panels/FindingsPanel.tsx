"use client";

import { AlertTriangle, AlertCircle, Crosshair, HelpCircle, Activity, Sparkles, CheckCircle2, Info } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import type { Finding, FindingSeverity } from "@/lib/types/contract";
import clsx from "clsx";

const ICONS: Record<FindingSeverity, React.ElementType> = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
  ok: CheckCircle2,
};

export default function FindingsPanel() {
  const analysis = useStore((s) => s.analysis);
  const focusFinding = useStore((s) => s.focusFinding);
  const setUi = useStore((s) => s.setUi);
  const addChatMessage = useStore((s) => s.addChatMessage);

  if (!analysis) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-[#8b949e]">
        <Sparkles size={24} className="text-cyan-400 mb-2 opacity-60" />
        <p className="font-semibold text-slate-300">No vibration checkup yet!</p>
        <p className="text-[11px] text-slate-400 mt-1">
          Click &quot;Test Shaking&quot; in the top bar to run the physics simulation.
        </p>
      </div>
    );
  }

  const findings = [...analysis.findings].sort((a, b) => {
    const order: Record<FindingSeverity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
    return (order[a.severity] ?? 99) - (order[b.severity] ?? 99);
  });

  const criticalCount = findings.filter((f) => f.severity === "critical").length;

  if (findings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-emerald-400">
        <CheckCircle2 size={28} className="mb-2 text-emerald-400" />
        <p className="font-bold text-sm text-white">🎉 All Parts Safe &amp; Smooth!</p>
        <p className="text-[11px] text-slate-400 mt-1">
          Every part stays comfortably within safe vibration limits across all speeds.
        </p>
      </div>
    );
  }

  const handleAskWhy = (finding: Finding) => {
    setUi({ rightPanelOpen: true, rightTab: "chat", agentMode: "explain" });
    addChatMessage({
      role: "user",
      content: `Why is there a ${finding.severity} finding: "${finding.detail}"? Can you explain what is shaking and how to fix it in simple terms?`,
    });
    addChatMessage({
      role: "assistant",
      content: `Here is what is happening: When the motors spin at ${finding.rpm?.toLocaleString() ?? 4200} RPM, their vibration frequency matches the natural wobble frequency of the arm (Mode ${finding.mode ?? 2}). Because the mount pad is too stiff, the shaking passes right into ${finding.component || "the part"}. To fix it, click "Auto-Fix" in the top bar — this softens the cushion pad so vibrations get absorbed like shock absorbers on a bicycle!`,
    });
  };

  return (
    <div className="h-full overflow-y-auto p-3.5 space-y-2.5">
      {criticalCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-red-500/40 bg-red-950/20 px-3.5 py-2 text-xs text-red-200">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/30 text-red-300 font-bold text-[11px]">
              !
            </span>
            <span>
              <strong>{criticalCount} part{criticalCount > 1 ? "s are" : " is"} shaking too hard!</strong> Photos will be blurry unless cushioned.
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setUi({
                rightPanelOpen: true,
                error: "Use Auto-Fix in the top toolbar to start optimization.",
              })
            }
            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-emerald-500"
          >
            <Sparkles size={12} />
            <span>Open Auto-Fix in Top Bar</span>
          </button>

        </div>
      )}

      <div className="space-y-2">
        {findings.map((f) => (
          <FindingCard
            key={f.id}
            finding={f}
            onFocus={() => focusFinding(f)}
            onAskWhy={() => handleAskWhy(f)}
            onAnimateMode={() => {
              if (f.mode != null) {
                setUi({ selectedMode: f.mode });
              }
            }}
          />
        ))}
      </div>

      {analysis.max_stress_mpa && (
        <div className="mt-2 flex items-center justify-between rounded-xl border border-[#30363d] bg-[#161b22] px-3.5 py-2 text-[11px]">
          <div>
            <span className="text-[#8b949e]">Frame Bending Strength: </span>
            <span className="font-mono font-semibold text-[#e6edf3]">
              {analysis.max_stress_mpa.value.toFixed(1)} MPa
            </span>
            <span className="text-[#8b949e]">
              {" "}
              ({(analysis.max_stress_mpa.ratio * 100).toFixed(0)}% of limit) on Arm{" "}
              {analysis.max_stress_mpa.member} @ {analysis.max_stress_mpa.at_rpm.toLocaleString()} RPM
            </span>
          </div>
          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
            ✓ Strong &amp; Safe (&lt;50% stress)
          </span>
        </div>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  onFocus,
  onAskWhy,
  onAnimateMode,
}: {
  finding: Finding;
  onFocus: () => void;
  onAskWhy: () => void;
  onAnimateMode: () => void;
}) {
  const Icon = ICONS[finding.severity];

  return (
    <div
      className={clsx(
        "group flex items-start gap-3 rounded-xl border p-3 transition-colors",
        finding.severity === "critical" && "border-red-500/40 bg-red-950/20 text-red-100",
        finding.severity === "warning" && "border-amber-500/40 bg-amber-950/20 text-amber-100",
        finding.severity === "info" && "border-blue-500/40 bg-blue-950/20 text-blue-100",
        finding.severity === "ok" && "border-emerald-500/40 bg-emerald-950/20 text-emerald-100"
      )}
    >
      <div
        className={clsx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
          finding.severity === "critical" && "bg-red-500/20 text-red-400",
          finding.severity === "warning" && "bg-amber-500/20 text-amber-400",
          finding.severity === "info" && "bg-blue-500/20 text-blue-400",
          finding.severity === "ok" && "bg-emerald-500/20 text-emerald-400"
        )}
      >
        <Icon size={14} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs uppercase tracking-wide">
            {finding.severity === "critical"
              ? "🚨 Violent Shaking"
              : finding.severity === "warning"
              ? "⚠️ Warning"
              : "✅ Safe Operation"}
          </span>
          {finding.component && (
            <span className="rounded bg-black/40 px-1.5 py-0.2 font-mono text-[10px] text-slate-300">
              Part: {finding.component}
            </span>
          )}
        </div>

        <p className="mt-1 text-[12px] font-medium leading-relaxed text-slate-200">
          {finding.detail}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[11px] text-slate-400">
          {finding.rpm != null && (
            <span className="font-mono text-cyan-300 font-semibold bg-cyan-950/40 border border-cyan-800/40 rounded px-1.5 py-0.5">
              🏎️ {finding.rpm.toLocaleString()} RPM
            </span>
          )}
          {finding.value != null && finding.limit != null && (
            <span className="font-mono text-red-300 font-semibold bg-red-950/40 border border-red-800/40 rounded px-1.5 py-0.5">
              💥 {finding.value.toFixed(2)} g / {finding.limit} g Limit
            </span>
          )}
          {finding.mode != null && (
            <span className="font-mono text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 rounded px-1.5 py-0.5">
              Mode {finding.mode} ({finding.mode_f_hz?.toFixed(1) ?? "—"} Hz)
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 ml-2">
        {finding.mode != null && (
          <button
            onClick={onAnimateMode}
            className="flex items-center gap-1 rounded-lg bg-[#161b22] px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-[#21262d] border border-[#30363d] transition-colors"
            title="View 3D mode shape"
          >
            <Activity size={12} />
            <span>Wobble Shape</span>
          </button>
        )}

        <button
          onClick={onFocus}
          className="flex items-center gap-1 rounded-lg bg-[#161b22] px-2.5 py-1 text-[11px] font-semibold text-blue-400 hover:bg-[#21262d] border border-[#30363d] transition-colors"
          title="Jump to RPM speed and focus this part in 3D"
        >
          <Crosshair size={12} />
          <span>Show in 3D</span>
        </button>

        <button
          onClick={onAskWhy}
          className="flex items-center gap-1 rounded-lg bg-[#161b22] px-2.5 py-1 text-[11px] font-semibold text-purple-400 hover:bg-[#21262d] border border-[#30363d] transition-colors"
          title="Ask AI Assistant why this is shaking"
        >
          <HelpCircle size={12} />
          <span>Why?</span>
        </button>
      </div>
    </div>
  );
}
