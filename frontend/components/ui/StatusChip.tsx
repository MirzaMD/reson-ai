"use client";

import type { ComponentStatus } from "@/lib/types/contract";
import clsx from "clsx";

const styles: Record<ComponentStatus, string> = {
  ok: "bg-ok-soft text-ok border-ok/30",
  warning: "bg-warn-soft text-warn border-warn/30",
  critical: "bg-danger-soft text-danger border-danger/30",
};

const labels: Record<ComponentStatus, string> = {
  ok: "Safe",
  warning: "Warning",
  critical: "Critical",
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
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase",
        styles[status],
        className
      )}
    >
      <span
        className={clsx("h-1.5 w-1.5 rounded-full shrink-0", {
          "bg-ok": status === "ok",
          "bg-warn": status === "warning",
          "bg-danger": status === "critical",
        })}
      />
      {label ?? labels[status]}
    </span>
  );
}
