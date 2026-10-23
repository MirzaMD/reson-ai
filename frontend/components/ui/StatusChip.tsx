"use client";

import type { ComponentStatus } from "@/lib/types/contract";
import clsx from "clsx";

const styles: Record<ComponentStatus, string> = {
  ok: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/20",
  critical: "bg-red-500/15 text-red-300 border-red-500/40 shadow-sm shadow-red-950/30",
};

const labels: Record<ComponentStatus, string> = {
  ok: "Safe & Calm",
  warning: "Wobbly",
  critical: "Violent Shake!",
};

interface Props {
  status: ComponentStatus;
  label?: string;
  className?: string;
}

export default function StatusChip({ status, label, className }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase",
        styles[status],
        className
      )}
    >
      <span
        className={clsx("h-1.5 w-1.5 rounded-full", {
          "bg-emerald-400": status === "ok",
          "bg-amber-400 animate-pulse": status === "warning",
          "bg-red-400 animate-pulse shadow-sm shadow-red-500": status === "critical",
        })}
      />
      {label ?? labels[status]}
    </span>
  );
}
