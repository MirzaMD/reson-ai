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
  { label: string; icon: React.ElementType; desc: string; emoji: string }
> = {
  camera: {
    label: "4K Camera",
    icon: Camera,
    desc: "Captures video. Hates vibrations because shakes make footage blurry.",
    emoji: "📷",
  },
  motor: {
    label: "BLDC Motor & Prop",
    icon: Fan,
    desc: "Spins super fast to create lift, which creates the vibration source.",
    emoji: "🌀",
  },
  gyro: {
    label: "Gyro / IMU Sensor",
    icon: Navigation,
    desc: "Measures drone balance to steer. Needs calm, smooth mounting.",
    emoji: "🎯",
  },
  fc: {
    label: "Flight Computer",
    icon: Navigation,
    desc: "The brain of the drone. Runs autopilots and orientation sensors.",
    emoji: "🧠",
  },
  fan: {
    label: "Cooling Fan",
    icon: Fan,
    desc: "Blows air over hot electronics. Can cause spinning hum vibrations.",
    emoji: "💨",
  },
  battery: {
    label: "LiPo Battery",
    icon: Battery,
    desc: "Heavy battery pack. Adds mass to center of gravity.",
    emoji: "🔋",
  },
  pump: {
    label: "Liquid Pump",
    icon: Box,
    desc: "Pumps fluids with rhythmic pulses.",
    emoji: "💧",
  },
  compressor: {
    label: "Air Compressor",
    icon: Box,
    desc: "Heavier rotating pump.",
    emoji: "⚙️",
  },
  generic: {
    label: "Counterweight (Mass)",
    icon: Box,
    desc: "General weight or tuned mass damper to cancel vibrations.",
    emoji: "🧊",
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
    showToast(`🚀 Added ${KIND_DETAILS[kind].label} (${newId})!`, "success");

    try {
      const res = await analyze(nextDesign);
      setAnalysis(res);
    } finally {
      setUi({ isAnalyzing: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-2xl border border-cyan-500/30 bg-[#0d131f] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#21262d] bg-[#0f1726] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Plus size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Add a Part to your Machine 🛠️
              </h2>
              <p className="text-[11px] text-slate-400">
                Choose what part to attach, where to place it, and how to cushion it!
              </p>
            </div>
          </div>
          <button
            onClick={() => setUi({ addComponentModalOpen: false })}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
          {/* Part Type Cards */}
          <div>
            <label className="mb-2 block font-bold uppercase tracking-wider text-cyan-400 text-[10px]">
              1. Choose What Kind of Part
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(["camera", "motor", "gyro", "fan", "battery", "generic"] as ComponentKind[]).map((k) => {
                const info = KIND_DETAILS[k];
                const isSelected = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKindChange(k)}
                    className={clsx(
                      "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
                      isSelected
                        ? "border-cyan-400 bg-cyan-500/20 text-white shadow-md shadow-cyan-950/40"
                        : "border-[#21262d] bg-[#141b28] text-slate-300 hover:border-slate-600 hover:bg-[#1a2335]"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-base">{info.emoji}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {(COMPONENT_CATALOG[k]?.mass * 1000).toFixed(0)}g
                      </span>
                    </div>
                    <span className="mt-1 font-bold text-xs text-white">
                      {info.label}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-[10px] text-slate-400 leading-tight">
                      {info.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Placement Settings */}
          <div className="rounded-xl border border-[#21262d] bg-[#141b28] p-4 space-y-3">
            <span className="block font-bold uppercase tracking-wider text-cyan-400 text-[10px]">
              2. Where to Attach It
            </span>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-slate-300 font-semibold text-[11px]">
                  Attach to Arm / Member
                </label>
                <select
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  className="w-full rounded-lg border border-[#30363d] bg-[#0d131f] px-2.5 py-1.5 text-xs text-white"
                >
                  {design.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      Arm {m.id} ({m.material === "cfrp" ? "Carbon Fiber" : m.material})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-slate-300 font-semibold text-[11px]">
                    Position: {(s * 100).toFixed(0)}%
                  </label>
                  <span className="text-[10px] text-cyan-400">
                    {s < 0.35 ? "Near Center" : s > 0.65 ? "Near Tip" : "Middle"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.02}
                  max={0.98}
                  step={0.01}
                  value={s}
                  onChange={(e) => setS(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                  <span>Center</span>
                  <span>Middle</span>
                  <span>Tip</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cushion / Shock Absorber Settings */}
          <div className="rounded-xl border border-[#21262d] bg-[#141b28] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-cyan-400 text-[10px]">
                3. Shock Absorber Cushion Pad
              </span>
              <span className="text-[10px] text-slate-400">Protects from shaking</span>
            </div>

            <div>
              <label className="mb-1 block text-slate-300 font-semibold text-[11px]">
                Cushion Type
              </label>
              <select
                value={mountPreset}
                onChange={(e) => handleMountPresetChange(e.target.value as MountPreset)}
                className="w-full rounded-lg border border-[#30363d] bg-[#0d131f] px-2.5 py-1.5 text-xs text-white"
              >
                {Object.values(MOUNT_PRESETS).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#21262d] bg-[#0c1017] px-6 py-3.5">
          <button
            onClick={() => setUi({ addComponentModalOpen: false })}
            className="rounded-lg border border-slate-700 bg-transparent px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-700/30 transition-all"
          >
            <Plus size={15} />
            <span>Add Part &amp; Test Shaking 🚀</span>
          </button>
        </div>
      </div>
    </div>
  );
}
