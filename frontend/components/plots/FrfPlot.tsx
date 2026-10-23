"use client";

import dynamic from "next/dynamic";
import { useMemo, useDeferredValue, memo } from "react";
import { useStore } from "@/lib/store/useStore";
import type { Data } from "plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

function FrfPlotComponent() {
  const analysis = useStore((s) => s.analysis);
  const design = useStore((s) => s.design);
  const rpm = useStore((s) => s.rpm);
  const setRpm = useStore((s) => s.setRpm);
  const selectionId = useStore((s) =>
    s.selection.type === "component" ? s.selection.id : null
  );

  const deferredRpm = useDeferredValue(rpm);

  // Stable FRF Curves data: decoupled from RPM slider scrub!
  const data = useMemo<Data[]>(() => {
    if (!analysis?.sweep) return [];

    const traces: Data[] = [];
    const comps = analysis.components;

    const ids = selectionId ? [selectionId] : comps.map((c) => c.id);
    const colors = ["#38bdf8", "#34d399", "#a78bfa", "#f59e0b", "#f43f5e"];

    ids.forEach((id, i) => {
      const accel = analysis.sweep.component_accel_g[id];
      if (!accel) return;
      const comp = design?.components.find((c) => c.id === id);
      const color = colors[i % colors.length];

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

    return traces;
  }, [analysis, design, selectionId]);

  // Stable layout with shape-based RPM cursor (does not redraw curves)
  const layout = useMemo(() => {
    return {
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
        orientation: "h" as const,
        y: 1.15,
        font: { size: 10 },
      },
      showlegend: true,
      shapes: [
        {
          type: "line" as const,
          x0: deferredRpm,
          x1: deferredRpm,
          y0: 0,
          y1: 1,
          yref: "paper" as const,
          line: { color: "#ef4444", width: 1.5, dash: "dot" as const },
        },
      ],
    };
  }, [deferredRpm]);

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
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
      revision={deferredRpm}
      onClick={(e: Readonly<Plotly.PlotMouseEvent>) => {
        if (e.points?.[0]?.x != null) {
          setRpm(Math.round(Number(e.points[0].x)));
        }
      }}
    />
  );
}

export default memo(FrfPlotComponent);
