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
  label = "Vibration",
}: Props) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-3 rounded-xl border border-white/[0.1] bg-[#0b0f15]/90 p-2.5 shadow-xl backdrop-blur-md">
      <div
        className="h-28 w-3 rounded-full border border-white/[0.1] shadow-inner"
        style={{ background: jetGradient() }}
      />
      <div className="flex h-28 flex-col justify-between text-[10px]">
        <div>
          <div className="font-bold text-red-400 font-mono">
            {max.toFixed(2)} {unit}
          </div>
          <div className="text-[9px] font-semibold text-red-300">🔴 Violent Shake</div>
        </div>

        <div className="text-[9px] font-bold text-amber-300">
          🟡 {label}
        </div>

        <div>
          <div className="font-bold text-blue-400 font-mono">
            {min.toFixed(2)} {unit}
          </div>
          <div className="text-[9px] font-semibold text-blue-300">🔵 Calm &amp; Still</div>
        </div>
      </div>
    </div>
  );
}
