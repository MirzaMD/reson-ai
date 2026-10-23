"use client";

import { jetGradient } from "./colormap";

interface Props {
  min: number;
  max: number;
  unit?: string;
  label?: string;
}

export default function Colorbar({
  min,
  max,
  unit = "mm",
  label = "Amplitude",
}: Props) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-2.5 rounded-md glass-panel p-2 shadow-xs">
      <div
        className="h-24 w-2.5 rounded-full border border-line shadow-inner"
        style={{ background: jetGradient() }}
      />
      <div className="flex h-24 flex-col justify-between text-[10px] font-mono">
        <div>
          <span className="font-semibold text-danger">
            {max.toFixed(2)} {unit}
          </span>
          <div className="text-[9px] text-muted">Max</div>
        </div>

        <div className="text-[9px] text-muted font-sans font-medium">
          {label}
        </div>

        <div>
          <span className="font-semibold text-accent">
            {min.toFixed(2)} {unit}
          </span>
          <div className="text-[9px] text-muted">Min</div>
        </div>
      </div>
    </div>
  );
}
