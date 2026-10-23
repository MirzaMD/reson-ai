"use client";

import { useMemo } from "react";
import { Edges } from "@react-three/drei";
import * as THREE from "three";
import type { Design, AnalysisResult, ResponseAt } from "@/lib/types/contract";
import { toWorld } from "./mapping";
import { jet } from "./colormap";
import ComponentModel from "./ComponentModel";
import MountSpring from "./MountSpring";

interface Props {
  design: Design;
  analysis: AnalysisResult | null;
  responseAt: ResponseAt | null;
  rpm: number;
  time: number;
  exaggeration: number;
  showMesh: boolean;
  showGhost: boolean;
  selectedId: string | null;
  selectedMode?: number | null;
  overrideMaxAmp?: number;
  onSelectMember?: (id: string) => void;
  onSelectComponent?: (id: string) => void;

  // Prevent duplicated components in symmetric scene rendering.
  renderComponents?: boolean;
}


/** Build element segments from consecutive mesh nodes per member */
function buildElements(
  meshNodes: AnalysisResult["mesh_nodes"]
): { a: number; b: number; member?: string }[] {
  const byMember = new Map<string, number[]>();
  meshNodes.forEach((n, i) => {
    const m = n.member ?? "_";
    if (!byMember.has(m)) byMember.set(m, []);
    byMember.get(m)!.push(i);
  });
  const elems: { a: number; b: number; member?: string }[] = [];
  for (const [member, idxs] of byMember) {
    for (let i = 0; i < idxs.length - 1; i++) {
      elems.push({
        a: idxs[i],
        b: idxs[i + 1],
        member: member === "_" ? undefined : member,
      });
    }
  }
  return elems;
}

function BeamElement({
  posA,
  posB,
  color,
  thickness = 0.0035,
  ghost = false,
  selected = false,
  onClick,
}: {
  posA: THREE.Vector3;
  posB: THREE.Vector3;
  color: string;
  thickness?: number;
  ghost?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const mid = useMemo(() => {
    return new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
  }, [posA, posB]);

  const { length, quat } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(posB, posA);
    const len = dir.length();
    const q = new THREE.Quaternion();
    if (len > 1e-9) {
      dir.normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
    return { length: len, quat: q };
  }, [posA, posB]);

  return (
    <mesh
      position={mid}
      quaternion={quat}
      onClick={(e) => {
        if (onClick && !ghost) {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      <boxGeometry args={[thickness, length, thickness]} />
      <meshStandardMaterial
        color={selected ? "#38bdf8" : color}
        transparent={ghost}
        opacity={ghost ? 0.2 : 1}
        metalness={0.3}
        roughness={0.5}
        wireframe={ghost}
        emissive={selected ? "#0284c7" : "#000000"}
        emissiveIntensity={selected ? 0.35 : 0}
      />
      {!ghost && (
        <Edges
          threshold={15}
          color={selected ? "#38bdf8" : "#0f172a"}
        />
      )}
    </mesh>
  );
}

export default function StructureView({
  design,
  analysis,
  responseAt,
  rpm,
  time,
  exaggeration,
  showMesh,
  showGhost,
  selectedId,
  selectedMode,
  overrideMaxAmp,
  onSelectMember,
  onSelectComponent,
  renderComponents = true,
}: Props) {
  const meshNodes = useMemo(() => analysis?.mesh_nodes ?? [], [analysis]);
  const elements = useMemo(() => buildElements(meshNodes), [meshNodes]);

  const statusMap = useMemo(() => {
    const m = new Map<string, "ok" | "warning" | "critical">();
    analysis?.components.forEach((c) => m.set(c.id, c.status));
    return m;
  }, [analysis]);

  const ampMax = useMemo(() => {
    if (overrideMaxAmp) return overrideMaxAmp;
    if (!analysis?.sweep.node_amp_mm?.length) return 1;
    let mx = 0.01;
    for (const row of analysis.sweep.node_amp_mm) {
      for (const v of row) mx = Math.max(mx, v);
    }
    return mx;
  }, [analysis, overrideMaxAmp]);

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

  // Node positions: either animated harmonic response OR animated mode shape
  const nodePositions = useMemo(() => {
    if (meshNodes.length === 0) {
      return design.nodes.map((n) => new THREE.Vector3(...toWorld(n.x, n.y)));
    }

    // Check if mode shape visualization is active
    if (selectedMode != null && analysis?.modes) {
      const mode = analysis.modes.find((m) => m.i === selectedMode);
      if (mode?.shape) {
        const gain = exaggeration * 0.0008;
        const wave = Math.cos(time);
        return meshNodes.map((n, i) => {
          const uy = (mode.shape[i]?.[1] ?? 0) * wave * gain;
          return new THREE.Vector3(n.x, n.y + uy, 0);
        });
      }
    }

    // Standard harmonic sweep deformation
    return meshNodes.map((n, i) => {
      let ux = 0;
      let uy = 0;
      if (responseAt?.nodes?.[i]) {
        const node = responseAt.nodes[i];
        const c = Math.cos(time);
        const s = Math.sin(time);
        ux = node.ux[0] * c - node.ux[1] * s;
        uy = node.uy[0] * c - node.uy[1] * s;
      }
      const gain = exaggeration * 0.001;
      return new THREE.Vector3(n.x + gain * ux, n.y + gain * uy, 0);
    });
  }, [meshNodes, responseAt, time, exaggeration, design.nodes, selectedMode, analysis]);

  const ghostPositions = useMemo(() => {
    if (meshNodes.length === 0) {
      return design.nodes.map((n) => new THREE.Vector3(...toWorld(n.x, n.y)));
    }
    return meshNodes.map((n) => new THREE.Vector3(n.x, n.y, 0));
  }, [meshNodes, design.nodes]);

  const componentPositions = useMemo(() => {
    const nodeMap = new Map(design.nodes.map((n) => [n.id, n]));
    return design.components.map((comp, compIdx) => {
      const member = design.members.find((m) => m.id === comp.member);
      if (!member) return { comp, pos: new THREE.Vector3(0, 0, 0), beamY: 0, dir: 1 as 1 | -1 };

      const n1 = nodeMap.get(member.n1);
      const n2 = nodeMap.get(member.n2);
      if (!n1 || !n2) return { comp, pos: new THREE.Vector3(0, 0, 0), beamY: 0, dir: 1 as 1 | -1 };

      const x = n1.x + (n2.x - n1.x) * comp.s;
      const y = n1.y + (n2.y - n1.y) * comp.s;

      let uy = 0;
      if (responseAt?.components) {
        const rc = responseAt.components.find((c) => c.id === comp.id);
        if (rc) {
          const c = Math.cos(time);
          const s = Math.sin(time);
          uy = rc.uy[0] * c - rc.uy[1] * s;
        }
      }
      const gain = exaggeration * 0.001;
      // Alternating spin direction for quadrotor motors (c1 CW, c2 CCW)
      const dir: 1 | -1 = compIdx % 2 === 0 ? 1 : -1;

      return {
        comp,
        pos: new THREE.Vector3(x, y + gain * uy, 0),
        beamY: y,
        relDisp: gain * uy,
        dir,
      };
    });
  }, [design, responseAt, time, exaggeration]);

  return (
    <group>
      {/* Ghost (undeformed) wireframe overlay */}
      {showGhost &&
        elements.map((el, i) => (
          <BeamElement
            key={`ghost-${i}`}
            posA={ghostPositions[el.a] ?? new THREE.Vector3()}
            posB={ghostPositions[el.b] ?? new THREE.Vector3()}
            color="#64748b"
            thickness={0.0025}
            ghost
          />
        ))}

      {/* Deformed structure with FE jet colormap */}
      {elements.map((el, i) => {
        const amp = analysis?.sweep.node_amp_mm?.[rpmIdx]?.[el.a] ?? 0;
        const t = Math.min(1, Math.max(0, amp / ampMax));
        const [r, g, b] = jet(t);
        const color = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        const isSelected = selectedId === el.member;

        return (
          <BeamElement
            key={`el-${i}`}
            posA={nodePositions[el.a] ?? new THREE.Vector3()}
            posB={nodePositions[el.b] ?? new THREE.Vector3()}
            color={showMesh ? color : "#6366f1"}
            thickness={0.004}
            selected={isSelected}
            onClick={() => el.member && onSelectMember?.(el.member)}
          />
        );
      })}

      {/* Fallback when no FE mesh yet */}
      {meshNodes.length === 0 &&
        design.members.map((m) => {
          const n1 = design.nodes.find((n) => n.id === m.n1);
          const n2 = design.nodes.find((n) => n.id === m.n2);
          if (!n1 || !n2) return null;
          return (
            <BeamElement
              key={m.id}
              posA={new THREE.Vector3(...toWorld(n1.x, n1.y))}
              posB={new THREE.Vector3(...toWorld(n2.x, n2.y))}
              color="#6366f1"
              thickness={0.005}
              selected={selectedId === m.id}
              onClick={() => onSelectMember?.(m.id)}
            />
          );
        })}

      {/* Lumped Components & Dynamic Mount Springs */}
{renderComponents &&
  componentPositions.map(({ comp, pos, beamY, relDisp, dir }) => (
        <group
          key={comp.id}
          position={[pos.x, 0, pos.z]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectComponent?.(comp.id);
          }}
        >
          <MountSpring
            position={[0, beamY, 0]}
            restLength={0.012}
            relDisp={relDisp ?? 0}
            preset={comp.mount.preset}
          />
          <group position={[0, pos.y, 0]}>
            <ComponentModel
              kind={comp.kind}
              status={statusMap.get(comp.id) ?? "ok"}
              rpm={comp.kind === "motor" || comp.kind === "fan" ? rpm : 0}
              dir={dir}
              selected={selectedId === comp.id}
            />
          </group>
        </group>
      ))}
    </group>
  );
}
