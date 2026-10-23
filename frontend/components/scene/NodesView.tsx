"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import type { Design, Support, AnalysisResult } from "@/lib/types/contract";
import { toWorld } from "./mapping";
import { useStore } from "@/lib/store/useStore";

interface Props {
  design: Design;
  analysis: AnalysisResult | null;
  showMesh: boolean;
  rpm: number;
}

const sphereGeom = new THREE.SphereGeometry(0.003, 10, 10);
const sphereMat = new THREE.MeshStandardMaterial({
  color: "#60a5fa",
  emissive: "#2563eb",
  emissiveIntensity: 0.6,
  roughness: 0.3,
});
const _nodeMatrix = new THREE.Matrix4();

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
        <mesh position={[0, -0.008, 0]}>
          <boxGeometry args={[0.018, 0.006, 0.018]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
        </mesh>
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
        <mesh position={[0, -0.008, 0]}>
          <coneGeometry args={[0.01, 0.012, 3]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
        </mesh>
        {support.type === "roller" && (
          <group position={[0, -0.016, 0]}>
            <mesh position={[-0.004, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0022, 0.0022, 0.012, 10]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0.004, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0022, 0.0022, 0.012, 10]} />
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
        <mesh position={[0, -0.01, 0]}>
          <cylinderGeometry args={[0.0035, 0.0035, 0.016, 8]} />
          <meshStandardMaterial color="#38bdf8" wireframe metalness={0.8} />
        </mesh>
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
  const instancedNodesRef = useRef<THREE.InstancedMesh>(null);

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
    for (let i = 0; i < rpms.length; i++) {
      const d = Math.abs(rpms[i] - rpm);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, [analysis, rpm]);

  // Position instanced nodes (single draw call for all nodes)
  useEffect(() => {
    if (!instancedNodesRef.current || !design.nodes.length) return;
    const mesh = instancedNodesRef.current;

    for (let i = 0; i < design.nodes.length; i++) {
      const n = design.nodes[i];
      const [wx, wy, wz] = toWorld(n.x, n.y);
      _nodeMatrix.makeTranslation(wx, wy, wz);
      mesh.setMatrixAt(i, _nodeMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [design.nodes]);

  return (
    <group>
      {/* Nodes InstancedMesh: 1 single draw call for all joint spheres */}
      {showMesh && design.nodes.length > 0 && (
        <instancedMesh
          ref={instancedNodesRef}
          args={[sphereGeom, sphereMat, design.nodes.length]}
          frustumCulled={false}
          onPointerMove={(e) => {
            if (e.instanceId != null && design.nodes[e.instanceId]) {
              e.stopPropagation();
              const n = design.nodes[e.instanceId];
              const amp = analysis?.sweep.node_amp_mm?.[rpmIdx]?.[0] ?? 0.01;
              const accel = (Math.pow((rpm * 2 * Math.PI) / 60, 2) * amp * 0.001) / 9.81;
              setProbe({
                nodeId: n.id,
                xMm: Math.round(n.x * 1000),
                yMm: Math.round(n.y * 1000),
                ampMm: +amp.toFixed(3),
                accelG: +accel.toFixed(2),
              });
            }
          }}
          onPointerOut={() => setProbe(null)}
        />
      )}

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
