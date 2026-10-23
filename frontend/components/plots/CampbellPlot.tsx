"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useStore } from "@/lib/store/useStore";
import type { Data } from "plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export default function CampbellPlot() {
  const analysis = useStore((s) => s.analysis);
  const design = useStore((s) => s.design);
  const rpm = useStore((s) => s.rpm);
  const setRpm = useStore((s) => s.setRpm);

  const data = useMemo<Data[]>(() => {
    if (!analysis?.campbell || !design) return [];

    const rpmMin = design.analysis.rpm_min;
    const rpmMax = design.analysis.rpm_max;
    const traces: Data[] = [];

    // Natural frequency lines (horizontal) + ±15% danger bands
    analysis.campbell.mode_freqs_hz.forEach((f, i) => {
      // ±15% exclusion band
      const fUpper = f * 1.15;
      const fLower = f * 0.85;

      traces.push({
        x: [rpmMin, rpmMax, rpmMax, rpmMin],
        y: [fLower, fLower, fUpper, fUpper],
        fill: "toself",
        fillcolor: "rgba(34, 197, 94, 0.06)",
        line: { color: "transparent" },
        type: "scatter",
        mode: "none",
        name: `Mode ${i + 1} ±15% Band`,
        showlegend: false,
        hoverinfo: "skip",
      });

      // Nominal mode natural frequency
      traces.push({
        x: [rpmMin, rpmMax],
        y: [f, f],
        type: "scatter",
        mode: "lines",
        name: `Mode ${i + 1} (${f.toFixed(1)} Hz)`,
        line: { color: "#22c55e", width: 1.8 },
      });
    });

    // Excitation order lines (sloped)
    const orderColors = ["#38bdf8", "#a78bfa", "#f59e0b"];
    const crossingPoints: { rpm: number; hz: number; label: string }[] = [];

    analysis.campbell.lines.forEach((line, i) => {
      const x = [rpmMin, rpmMax];
      const y = x.map((r) => (line.order * r) / 60);
      traces.push({
        x,
        y,
        type: "scatter",
        mode: "lines",
        name: line.label,
        line: {
          color: orderColors[i % orderColors.length],
          width: 2,
          dash: "dash",
        },
      });

      // Calculate crossing intersections
      analysis.campbell.mode_freqs_hz.forEach((f, mIdx) => {
        const critRpm = (f * 60) / line.order;
        if (critRpm >= rpmMin && critRpm <= rpmMax) {
          crossingPoints.push({
            rpm: critRpm,
            hz: f,
            label: `${line.order}× × Mode ${mIdx + 1} (${Math.round(critRpm)} RPM)`,
          });
        }
      });
    });

    // Critical speed crossing markers
    if (crossingPoints.length > 0) {
      traces.push({
        x: crossingPoints.map((p) => p.rpm),
        y: crossingPoints.map((p) => p.hz),
        type: "scatter",
        mode: "markers+text",
        text: crossingPoints.map((p) => ` ${Math.round(p.rpm)} RPM`),
        textposition: "top right",
        textfont: { size: 10, color: "#f87171" },
        name: "Critical Speeds (Resonance)",
        marker: {
          color: "#ef4444",
          size: 8,
          symbol: "x",
          line: { width: 2 },
        },
      });
    }

    // Current RPM Indicator
    const maxFreq = Math.max(...analysis.campbell.mode_freqs_hz, 200);
    traces.push({
      x: [rpm, rpm],
      y: [0, maxFreq * 1.3],
      type: "scatter",
      mode: "lines",
      name: "Current RPM",
      line: { color: "#ef4444", width: 1.5, dash: "dot" },
      showlegend: false,
    });

    return traces;
  }, [analysis, design, rpm]);

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[#6e7681]">
        Run analysis to compute Campbell diagram
      </div>
    );
  }

  return (
    <Plot
      data={data}
      layout={{
        autosize: true,
        margin: { l: 55, r: 25, t: 15, b: 40 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { family: "Inter, sans-serif", size: 11, color: "#8b949e" },
        xaxis: {
          title: "Shaft Rotation Speed (RPM)",
          gridcolor: "#21262d",
          color: "#8b949e",
        },
        yaxis: {
          title: "Frequency (Hz)",
          gridcolor: "#21262d",
          color: "#8b949e",
        },
        legend: { orientation: "h", y: 1.15, font: { size: 10 } },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
      onClick={(e: Readonly<Plotly.PlotMouseEvent>) => {
        if (e.points?.[0]?.x != null) {
          setRpm(Math.round(Number(e.points[0].x)));
        }
      }}
    />
  );
}
