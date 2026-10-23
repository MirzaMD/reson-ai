"use client";

import { useMemo } from "react";
import Propeller from "./Propeller";
import type { ComponentKind, ComponentStatus } from "@/lib/types/contract";

const STATUS_RING: Record<ComponentStatus, string> = {
  ok: "#22c55e",
  warning: "#f59e0b",
  critical: "#ef4444",
};

interface Props {
  kind: ComponentKind;
  status?: ComponentStatus;
  rpm?: number;
  dir?: 1 | -1;
  yOffset?: number;
  selected?: boolean;
}

function BldcMotor({
  status = "ok",
  rpm = 0,
  dir = 1,
}: {
  status?: ComponentStatus;
  rpm?: number;
  dir?: 1 | -1;
}) {
  return (
    <group>
      {/* Lower Stator Base */}
      <mesh position={[0, 0.005, 0]}>
        <cylinderGeometry args={[0.013, 0.014, 0.01, 24]} />
        <meshStandardMaterial color="#1e242b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Internal Copper Windings Hint */}
      <mesh position={[0, 0.011, 0]}>
        <cylinderGeometry args={[0.0115, 0.0115, 0.005, 16]} />
        <meshStandardMaterial color="#b87333" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Rotating Bell / Rotor */}
      <mesh position={[0, 0.016, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.012, 24]} />
        <meshStandardMaterial color="#2d3748" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Anodized Status Ring on Rotor Bell */}
      <mesh position={[0, 0.019, 0]}>
        <torusGeometry args={[0.0142, 0.0012, 10, 28]} />
        <meshStandardMaterial
          color={STATUS_RING[status]}
          emissive={STATUS_RING[status]}
          emissiveIntensity={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Bell Top Cap with Cooling Holes Aesthetic */}
      <mesh position={[0, 0.0225, 0]}>
        <cylinderGeometry args={[0.011, 0.014, 0.003, 24]} />
        <meshStandardMaterial color="#1a202c" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Motor Steel Shaft */}
      <mesh position={[0, 0.028, 0]}>
        <cylinderGeometry args={[0.0018, 0.0018, 0.01, 16]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* Propeller Unit with true RPM label */}
      <group position={[0, 0.033, 0]}>
        <Propeller rpm={rpm} dir={dir} />
      </group>
    </group>
  );
}

function GimbalCamera({ status = "ok" }: { status?: ComponentStatus }) {
  return (
    <group>
      {/* Gimbal Outer Pitch Ring */}
      <mesh position={[0, 0.014, 0]}>
        <torusGeometry args={[0.015, 0.0015, 8, 24]} />
        <meshStandardMaterial color="#4a5568" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Camera Body Cube */}
      <mesh position={[0, 0.014, 0]}>
        <boxGeometry args={[0.018, 0.016, 0.016]} />
        <meshStandardMaterial color="#1a202c" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Lens Barrel */}
      <mesh position={[0, 0.014, 0.011]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0055, 0.0065, 0.009, 20]} />
        <meshStandardMaterial color="#2d3748" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Front Optical Lens Coating (Cyan/Blue reflection) */}
      <mesh position={[0, 0.014, 0.0156]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.0048, 20]} />
        <meshStandardMaterial
          color="#0ea5e9"
          metalness={0.95}
          roughness={0.05}
          emissive="#0284c7"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Status Tally LED */}
      <mesh position={[0.006, 0.02, 0.006]}>
        <sphereGeometry args={[0.0015, 10, 10]} />
        <meshStandardMaterial
          color={STATUS_RING[status]}
          emissive={STATUS_RING[status]}
          emissiveIntensity={1.0}
        />
      </mesh>
    </group>
  );
}

function MemsImu({ status = "ok" }: { status?: ComponentStatus }) {
  return (
    <group>
      {/* Green PCB Substrate with Gold Contacts */}
      <mesh position={[0, 0.002, 0]}>
        <boxGeometry args={[0.022, 0.002, 0.016]} />
        <meshStandardMaterial color="#065f46" metalness={0.2} roughness={0.6} />
      </mesh>

      {/* Main MEMS Gyro / Accelerometer Chip (QFN) */}
      <mesh position={[-0.004, 0.004, 0]}>
        <boxGeometry args={[0.007, 0.002, 0.007]} />
        <meshStandardMaterial color="#111827" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Microcontroller / Filter IC */}
      <mesh position={[0.005, 0.0035, 0.002]}>
        <boxGeometry args={[0.005, 0.0018, 0.005]} />
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Micro Status LED */}
      <mesh position={[0.008, 0.0038, -0.005]}>
        <sphereGeometry args={[0.0012, 8, 8]} />
        <meshStandardMaterial
          color={STATUS_RING[status]}
          emissive={STATUS_RING[status]}
          emissiveIntensity={1.2}
        />
      </mesh>
    </group>
  );
}

function LipoBattery() {
  return (
    <group>
      {/* Main 4S Pack Wrapped in Deep Blue */}
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[0.045, 0.02, 0.024]} />
        <meshStandardMaterial color="#1e3a8a" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Yellow XT60 Terminal Plug */}
      <mesh position={[0.024, 0.012, 0]}>
        <boxGeometry args={[0.005, 0.008, 0.01]} />
        <meshStandardMaterial color="#eab308" metalness={0.2} roughness={0.5} />
      </mesh>
    </group>
  );
}

function IndustrialPump() {
  return (
    <group>
      {/* Heavy Cylindrical Impeller Casing */}
      <mesh position={[0, 0.016, 0]}>
        <cylinderGeometry args={[0.016, 0.016, 0.028, 20]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Outlet Flange */}
      <mesh position={[0.015, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.006, 0.006, 0.014, 16]} />
        <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

function GenericMass({ mass = 0.2 }: { mass?: number }) {
  const size = Math.cbrt(mass) * 0.045;
  return (
    <mesh position={[0, size / 2, 0]}>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.4} />
    </mesh>
  );
}

export default function ComponentModel({
  kind,
  status = "ok",
  rpm = 0,
  dir = 1,
  yOffset = 0.012,
  selected = false,
}: Props) {
  const model = useMemo(() => {
    switch (kind) {
      case "motor":
      case "fan":
        return <BldcMotor status={status} rpm={rpm} dir={dir} />;
      case "camera":
        return <GimbalCamera status={status} />;
      case "gyro":
      case "fc":
        return <MemsImu status={status} />;
      case "battery":
        return <LipoBattery />;
      case "pump":
      case "compressor":
        return <IndustrialPump />;
      default:
        return <GenericMass />;
    }
  }, [kind, status, rpm, dir]);

  return (
    <group position={[0, yOffset, 0]}>
      {model}
      {selected && (
        <mesh position={[0, 0.002, 0]}>
          <ringGeometry args={[0.022, 0.026, 36]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} side={2} />
        </mesh>
      )}
    </group>
  );
}
