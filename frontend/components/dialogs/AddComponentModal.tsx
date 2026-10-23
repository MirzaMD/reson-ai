"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/useStore";
import { COMPONENT_CATALOG, MOUNT_PRESETS } from "@/lib/presets/presets";
import { analyze } from "@/lib/api/client";
import {
  X,
  Plus,
  Camera,
  Fan,
  Navigation,
  Battery,
  Box,
} from "lucide-react";
import type {
  ComponentKind,
  MountPreset,
  Component,
} from "@/lib/types/contract";
import clsx from "clsx";

const KIND_DETAILS: Record<
  ComponentKind,
  { label: string; icon: React.ElementType; desc: string }
> = {
  camera: {
    label: "Camera",
    icon: Camera,
    desc: "Sensitive optical payload. Sensitive to high-frequency blur.",
  },
  motor: {
    label: "BLDC Motor",
    icon: Fan,
    desc: "Primary rotational excitation source spinning at operational RPM.",
  },
  gyro: {
    label: "Gyro / IMU",
    icon: Navigation,
    desc: "Flight stabilization sensor requiring quiet mounting.",
  },
  fc: {
    label: "Flight Computer",
    icon: Navigation,
    desc: "Autopilot processor and orientation sensor suite.",
  },
  fan: {
    label: "Cooling Fan",
    icon: Fan,
    desc: "Auxiliary cooling blade with multi-harmonic excitation.",
  },
  battery: {
    label: "Battery Pack",
    icon: Battery,
    desc: "Concentrated mass pack without internal excitation.",
  },
  pump: {
    label: "Pump",
    icon: Box,
    desc: "Reciprocating or rotating pump mechanism.",
  },
  compressor: {
    label: "Compressor",
    icon: Box,
    desc: "Mechanical compressor with rotating unbalance.",
  },
  generic: {
    label: "Lumped Mass",
    icon: Box,
    desc: "General payload mass or tuned vibration absorber.",
  },
};

export default function AddComponentModal() {
  const isOpen = useStore((s) => s.ui.addComponentModalOpen);
  const setUi = useStore((s) => s.setUi);
  const design = useStore((s) => s.design);
  const updateDesign = useStore((s) => s.updateDesign);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const showToast = useStore((s) => s.showToast);

  const [kind, setKind] = useState<ComponentKind>("camera");
  const [memberId, setMemberId] = useState<string>(design?.members[0]?.id || "m1");
  const [s, setS] = useState<number>(0.5);
  const [mass, setMass] = useState<number>(0.15);
  const [mountPreset, setMountPreset] = useState<MountPreset>("silicone_gel");
  const [kv, setKv] = useState<number>(50000);
  const [zeta, setZeta] = useState<number>(0.15);
  const [limitG, setLimitG] = useState<number>(0.5);

  if (!isOpen || !design) return null;

  const handleKindChange = (newKind: ComponentKind) => {
    setKind(newKind);
    const cat = COMPONENT_CATALOG[newKind];
    if (cat) {
      setMass(cat.mass);
      if (cat.limit_g) setLimitG(cat.limit_g);
    }
    if (newKind === "camera" || newKind === "gyro" || newKind === "fc") {
      setMountPreset("silicone_gel");
      setKv(50000);
      setZeta(0.15);
    } else if (newKind === "motor" || newKind === "fan") {
      setMountPreset("rubber_medium");
      setKv(100000);
      setZeta(0.08);
    }
  };

  const handleMountPresetChange = (preset: MountPreset) => {
    setMountPreset(preset);
    const p = MOUNT_PRESETS[preset];
    if (p) {
      setKv(p.kv);
      setZeta(p.zeta);
    }
  };

  const handleAdd = async () => {
    const newId = `c_${kind.slice(0, 3)}_${Date.now().toString().slice(-4)}`;
    const isExciter =
      kind === "motor" || kind === "fan" || kind === "pump" || kind === "compressor";
    const cat = COMPONENT_CATALOG[kind];

    const newComp: Component = {
      id: newId,
      kind,
      member: memberId || design.members[0].id,
      s,
      mass,
      mount: {
        preset: mountPreset,
        kv,
        zeta,
      },
      limit_g: !isExciter && limitG > 0 ? limitG : undefined,
      excitation: isExciter
        ? {
            type: "unbalance",
            rpm_min: cat.rpm_min || design.analysis.rpm_min,
            rpm_max: cat.rpm_max || design.analysis.rpm_max,
            me: cat.me || 2e-6,
            orders: [1],
            blades: kind === "fan" ? 4 : 2,
          }
        : undefined,
    };

    const nextDesign = {
      ...design,
      components: [...design.components, newComp],
    };

    updateDesign(() => nextDesign);
    setUi({ addComponentModalOpen: false, isAnalyzing: true });
    showToast(`Added ${KIND_DETAILS[kind].label} (${newId}).`, "success");

    try {
      const res = await analyze(nextDesign);
      setAnalysis(res);
    } finally {
      setUi({ isAnalyzing: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-lg border border-line bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-panel/50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Plus size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Add Component</h2>
              <p className="text-xs text-muted">
                Select component kind, attachment point, and mount isolator properties
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUi({ addComponentModalOpen: false })}
            className="rounded p-1 text-muted hover:text-ink hover:bg-panel transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          {/* Part Type Selection */}
          <div>
            <label className="mb-2 block font-semibold uppercase tracking-wider text-muted text-[10px]">
              1. Component Kind
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["camera", "motor", "gyro", "fan", "battery", "generic"] as ComponentKind[]).map((k) => {
                const info = KIND_DETAILS[k];
                const Icon = info.icon;
                const isSelected = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKindChange(k)}
                    className={clsx(
                      "flex flex-col items-start rounded-md border p-2.5 text-left transition-all",
                      isSelected
                        ? "border-accent bg-accent-soft/40 shadow-xs"
                        : "border-line bg-surface hover:bg-panel text-ink"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Icon size={14} className={isSelected ? "text-accent" : "text-muted"} />
                      <span className="text-[10px] font-mono text-muted">
                        {(COMPONENT_CATALOG[k]?.mass * 1000).toFixed(0)}g
                      </span>
                    </div>
                    <span className="mt-1 font-semibold text-xs text-ink">
                      {info.label}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-[10px] text-muted leading-snug">
                      {info.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Member & Location */}
          <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-panel p-3">
            <div>
              <label className="mb-1 block font-semibold text-ink text-[11px]">
                Attach to Member
              </label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full text-xs"
              >
                {design.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    Member {m.id} ({m.material})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-semibold text-ink text-[11px]">
                Position on Span: {(s * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.01}
                value={s}
                onChange={(e) => setS(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted font-mono mt-0.5">
                <span>Root (0%)</span>
                <span>Mid</span>
                <span>Tip (100%)</span>
              </div>
            </div>
          </div>

          {/* Mount Isolator */}
          <div className="rounded-md border border-line bg-panel p-3 space-y-2.5">
            <span className="block font-semibold uppercase tracking-wider text-muted text-[10px]">
              2. Mount Isolator
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-ink text-[11px]">Preset</label>
                <select
                  value={mountPreset}
                  onChange={(e) => handleMountPresetChange(e.target.value as MountPreset)}
                  className="w-full text-xs"
                >
                  {Object.values(MOUNT_PRESETS).map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-ink text-[11px]">Mass (kg)</label>
                <input
                  type="number"
                  step={0.01}
                  value={mass}
                  onChange={(e) => setMass(Number(e.target.value))}
                  className="w-full font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-ink text-[11px]">Stiffness kv (N/m)</label>
                <input
                  type="number"
                  step={1000}
                  value={kv}
                  onChange={(e) => setKv(Number(e.target.value))}
                  className="w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-ink text-[11px]">Damping Ratio (ζ)</label>
                <input
                  type="number"
                  step={0.01}
                  min={0.01}
                  max={0.5}
                  value={zeta}
                  onChange={(e) => setZeta(Number(e.target.value))}
                  className="w-full font-mono text-xs"
                />
              </div>
            </div>

            {kind !== "motor" && kind !== "fan" && (
              <div>
                <label className="mb-1 block text-ink text-[11px]">
                  Acceleration Limit (g RMS)
                </label>
                <input
                  type="number"
                  step={0.1}
                  value={limitG}
                  onChange={(e) => setLimitG(Number(e.target.value))}
                  className="w-full font-mono text-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-line bg-panel/50 px-5 py-2.5">
          <button
            type="button"
            onClick={() => setUi({ addComponentModalOpen: false })}
            className="btn btn-outline h-8 px-3 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="btn btn-primary h-8 px-4 text-xs font-semibold shadow-xs"
          >
            Add Component
          </button>
        </div>
      </div>
    </div>
  );
}
