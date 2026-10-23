"use client";

import { useMemo } from "react";
import type { Design, Support, AnalysisResult } from "@/lib/types/contract";
import { toWorld } from "./mapping";
import { useStore } from "@/lib/store/useStore";

interface Props {
  design: Design;
  analysis: AnalysisResult | null;
  showMesh: boolean;
  rpm: number;
}

function SupportGlyph({
  support,
  position,
}: {
  support: Support;
  position: [number, number, number];
}) {
  const [x, y, z] = position;

  if (support.type === "fixed") {
    return (
      <group position={[x, y, z]}>
        {/* Support Base Block */}
        <mesh position={[0, -0.008, 0]}>
          <boxGeometry args={[0.018, 0.006, 0.018]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Foundation Hatch Lines */}
        {[-0.006, -0.002, 0.002, 0.006].map((ox, i) => (
          <mesh key={i} position={[ox, -0.013, 0]} rotation={[0, 0, Math.PI / 5]}>
            <boxGeometry args={[0.0012, 0.007, 0.0012]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        ))}
      </group>
    );
  }

  if (support.type === "pinned" || support.type === "roller") {
    return (
      <group position={[x, y, z]}>
        {/* Triangular Hinge Prism */}
        <mesh position={[0, -0.008, 0]}>
          <coneGeometry args={[0.01, 0.012, 3]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Roller cylinders underneath */}
        {support.type === "roller" && (
          <group position={[0, -0.016, 0]}>
            <mesh position={[-0.004, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0022, 0.0022, 0.012, 12]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0.004, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0022, 0.0022, 0.012, 12]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        )}
      </group>
    );
  }

  if (support.type === "spring") {
    return (
      <group position={[x, y, z]}>
        {/* Spring Coil Glyph */}
        <mesh position={[0, -0.01, 0]}>
          <cylinderGeometry args={[0.0035, 0.0035, 0.016, 10]} />
          <meshStandardMaterial color="#38bdf8" wireframe metalness={0.8} />
        </mesh>
        {/* Ground Pad */}
        <mesh position={[0, -0.02, 0]}>
          <boxGeometry args={[0.014, 0.003, 0.014]} />
          <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
    );
  }

  return null;
}

export default function NodesView({
  design,
  analysis,
  showMesh,
  rpm,
}: Props) {
  const setProbe = useStore((s) => s.setProbe);

  const nodeMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of design.nodes) m.set(n.id, n);
    return m;
  }, [design.nodes]);

  const rpmIdx = useMemo(() => {
    if (!analysis?.sweep.rpm?.length) return 0;
    const rpms = analysis.sweep.rpm;
    let best = 0;
    let bestDist = Infinity;
    rpms.forEach((r, i) => {
      const d = Math.abs(r - rpm);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }, [analysis, rpm]);

  return (
    <group>
      {showMesh &&
        design.nodes.map((n) => {
          const pos = toWorld(n.x, n.y);
          return (
            <mesh
              key={n.id}
              position={pos}
              onPointerOver={(e) => {
                e.stopPropagation();
                // Estimate amplitude
                const amp = analysis?.sweep.node_amp_mm?.[rpmIdx]?.[0] ?? 0.01;
                const accel = (Math.pow((rpm * 2 * Math.PI) / 60, 2) * amp * 0.001) / 9.81;
                setProbe({
                  nodeId: n.id,
                  xMm: Math.round(n.x * 1000),
                  yMm: Math.round(n.y * 1000),
                  ampMm: +amp.toFixed(3),
                  accelG: +accel.toFixed(2),
                });
              }}
              onPointerOut={() => setProbe(null)}
            >
              <sphereGeometry args={[0.003, 14, 14]} />
              <meshStandardMaterial
                color="#60a5fa"
                emissive="#2563eb"
                emissiveIntensity={0.6}
                roughness={0.3}
              />
            </mesh>
          );
        })}

      {design.supports.map((s) => {
        const node = nodeMap.get(s.node);
        if (!node) return null;
        return (
          <SupportGlyph
            key={`${s.node}-${s.type}`}
            support={s}
            position={toWorld(node.x, node.y)}
          />
        );
      })}
    </group>
  );
}
