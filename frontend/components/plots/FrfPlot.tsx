"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useStore } from "@/lib/store/useStore";
import type { Data } from "plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export default function FrfPlot() {
  const analysis = useStore((s) => s.analysis);
  const design = useStore((s) => s.design);
  const rpm = useStore((s) => s.rpm);
  const setRpm = useStore((s) => s.setRpm);
  const selection = useStore((s) => s.selection);

  const data = useMemo<Data[]>(() => {
    if (!analysis?.sweep) return [];

    const traces: Data[] = [];
    const comps = analysis.components;

    const ids =
      selection.type === "component" && selection.id
        ? [selection.id]
        : comps.map((c) => c.id);

    const colors = ["#38bdf8", "#34d399", "#a78bfa", "#f59e0b", "#f43f5e"];

    let maxVal = 0.5;

    ids.forEach((id, i) => {
      const accel = analysis.sweep.component_accel_g[id];
      if (!accel) return;
      const comp = design?.components.find((c) => c.id === id);
      const color = colors[i % colors.length];

      accel.forEach((v) => {
        if (v > maxVal) maxVal = v;
      });

      // Frequency response curve
      traces.push({
        x: analysis.sweep.rpm,
        y: accel,
        type: "scatter",
        mode: "lines",
        name: `${id} (${comp?.kind ?? "comp"})`,
        line: { color, width: 2.2 },
      });

      // Limit line if component has limit_g
      if (comp?.limit_g) {
        if (comp.limit_g > maxVal) maxVal = comp.limit_g;
        traces.push({
          x: [analysis.sweep.rpm[0], analysis.sweep.rpm[analysis.sweep.rpm.length - 1]],
          y: [comp.limit_g, comp.limit_g],
          type: "scatter",
          mode: "lines",
          name: `${id} limit (${comp.limit_g} g)`,
          line: { color, width: 1.5, dash: "dash" },
          showlegend: true,
        });
      }
    });

    // Current RPM indicator marker
    traces.push({
      x: [rpm, rpm],
      y: [0, maxVal * 1.15],
      type: "scatter",
      mode: "lines",
      name: `Current RPM (${rpm})`,
      line: { color: "#ef4444", width: 1.5, dash: "dot" },
      showlegend: false,
    });

    return traces;
  }, [analysis, design, rpm, selection]);

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[#6e7681]">
        Run analysis to compute frequency response functions
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
          zerolinecolor: "#30363d",
          color: "#8b949e",
        },
        yaxis: {
          title: "Acceleration (g, RMS)",
          gridcolor: "#21262d",
          zerolinecolor: "#30363d",
          color: "#8b949e",
        },
        legend: {
          orientation: "h",
          y: 1.15,
          font: { size: 10 },
        },
        showlegend: true,
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
