"use client";

import dynamic from "next/dynamic";
import { useMemo, memo } from "react";
import { useStore } from "@/lib/store/useStore";
import type { Data } from "plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

function HeatmapPlotComponent() {
  const analysis = useStore((s) => s.analysis);
  const setRpm = useStore((s) => s.setRpm);

  const { z, x, y } = useMemo(() => {
    if (!analysis?.sweep.node_amp_mm) {
      return { z: [], x: [], y: [] };
    }
    // Transpose: rows = position (nodes), cols = RPM
    const nodeAmp = analysis.sweep.node_amp_mm; // [rpm][node]
    const nNodes = nodeAmp[0]?.length ?? 0;
    const nRpm = nodeAmp.length;
    const zRows: number[][] = [];
    for (let n = 0; n < nNodes; n++) {
      const row: number[] = [];
      for (let r = 0; r < nRpm; r++) {
        row.push(nodeAmp[r][n] ?? 0);
      }
      zRows.push(row);
    }
    return {
      z: zRows,
      x: analysis.sweep.rpm,
      y: analysis.mesh_nodes.map((_, i) => i),
    };
  }, [analysis]);

  const data = useMemo<Data[]>(() => {
    return [
      {
        z,
        x,
        y,
        type: "heatmap",
        colorscale: "Jet",
        colorbar: {
          title: { text: "Amplitude (mm)", side: "right" },
          thickness: 12,
          len: 0.85,
          tickfont: { size: 10, color: "#8b949e" },
          titlefont: { size: 10, color: "#8b949e" },
        },
      } as Data,
    ];
  }, [z, x, y]);

  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[#6e7681]">
        Run analysis to view spatial vibration heatmap
      </div>
    );
  }

  return (
    <Plot
      data={data}
      layout={{
        autosize: true,
        margin: { l: 55, r: 65, t: 15, b: 40 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { family: "Inter, sans-serif", size: 11, color: "#8b949e" },
        xaxis: {
          title: "Rotation Speed (RPM) — Click to Seek",
          color: "#8b949e",
          gridcolor: "#21262d",
        },
        yaxis: {
          title: "Mesh Node Index (Position)",
          color: "#8b949e",
          gridcolor: "#21262d",
        },
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

export default memo(HeatmapPlotComponent);
