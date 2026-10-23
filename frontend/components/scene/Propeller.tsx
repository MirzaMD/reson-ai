"use client";

import { useRef, useMemo, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";

interface Props {
  rpm: number;
  dir?: 1 | -1;
  visualScale?: number;
  showLabel?: boolean;
  labelOffset?: [number, number, number];
}

/** Draws high-contrast engineering telemetry tag on an offscreen canvas */
function createTelemetryCanvas(rpm: number, hz: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, 256, 64);

  // Dark engineering pill container
  ctx.fillStyle = "rgba(11, 19, 32, 0.92)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
  ctx.lineWidth = 3;

  const x = 4;
  const y = 4;
  const w = 248;
  const h = 56;
  const r = 14;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cyan active pulse dot
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.arc(26, 32, 5, 0, Math.PI * 2);
  ctx.fill();

  // Telemetry text
  ctx.font = "bold 22px 'JetBrains Mono', monospace, sans-serif";
  ctx.fillStyle = "#67e8f9";
  ctx.textBaseline = "middle";
  ctx.fillText(`${rpm.toLocaleString()} RPM`, 42, 32);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "18px 'JetBrains Mono', monospace, sans-serif";
  ctx.fillText(`· ${hz} Hz`, 172, 32);

  return canvas;
}

function PropellerComponent({
  rpm,
  dir = 1,
  visualScale = 0.012,
  showLabel = true,
  labelOffset = [0, 0.038, 0],
}: Props) {
  const ref = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const clampedDt = Math.min(dt, 0.05);
    // Visual smooth rotation; true RPM presented in telemetry badge
    ref.current.rotation.y += dir * ((rpm * 2 * Math.PI) / 60) * visualScale * clampedDt * 60;
  });

  const roundedRpm = Math.round(rpm / 100) * 100;
  const hz = (roundedRpm / 60).toFixed(0);

  const texture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = createTelemetryCanvas(roundedRpm, hz);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [roundedRpm, hz]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  return (
    <group>
      <group ref={ref}>
        {/* Blade 1 */}
        <mesh>
          <boxGeometry args={[0.115, 0.0016, 0.011]} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.6}
            roughness={0.35}
          />
        </mesh>
        {/* Blade 2 */}
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.115, 0.0016, 0.011]} />
          <meshStandardMaterial
            color="#334155"
            metalness={0.6}
            roughness={0.35}
          />
        </mesh>
        {/* Center Spinner Hub */}
        <mesh position={[0, 0.002, 0]}>
          <cylinderGeometry args={[0.005, 0.008, 0.008, 16]} />
          <meshStandardMaterial
            color="#cbd5e1"
            metalness={0.85}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* Pure WebGL Telemetry Billboard Badge - 0 DOM nodes, zero React roots */}
      {showLabel && rpm > 0 && texture && (
        <Billboard position={labelOffset}>
          <mesh>
            <planeGeometry args={[0.07, 0.0175]} />
            <meshBasicMaterial
              map={texture}
              transparent={true}
              depthWrite={false}
            />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}

export default memo(PropellerComponent);
