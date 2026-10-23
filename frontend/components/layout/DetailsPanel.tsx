"use client";

import { useStore } from "@/lib/store/useStore";
import StatusChip from "@/components/ui/StatusChip";
import { MATERIALS, MOUNT_PRESETS } from "@/lib/presets/presets";
import type {
  MaterialKey,
  SectionType,
  SupportType,
  MountPreset,
} from "@/lib/types/contract";
import {
  Sliders,
  Box,
  Layers,
  Trash2,
} from "lucide-react";

export default function DetailsPanel() {
  const design = useStore((s) => s.design);
  const analysis = useStore((s) => s.analysis);
  const selection = useStore((s) => s.selection);
  const updateDesign = useStore((s) => s.updateDesign);
  const deleteComponent = useStore((s) => s.deleteComponent);

  if (!design) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-xs text-[#6e7681]">
        Select an element or load a preset to inspect properties
      </div>
    );
  }

  const renderContent = () => {
    // 1. Component Inspector
    if (selection.type === "component" && selection.id) {
      const comp = design.components.find((c) => c.id === selection.id);
      if (!comp) return null;
      const result = analysis?.components.find((c) => c.id === comp.id);

      return (
        <div className="space-y-4 p-3.5 text-xs">
          {/* Header with Title and Fast Delete Button */}
          <div className="flex items-center justify-between border-b border-[#21262d] pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                Inspecting Part
              </span>
              <h3 className="text-sm font-bold text-[#e6edf3] capitalize">
                {comp.kind === "motor"
                  ? "🌀 Motor & Propeller"
                  : comp.kind === "camera"
                  ? "📷 4K Gimbal Camera"
                  : comp.kind === "gyro"
                  ? "🎯 Flight Gyro Sensor"
                  : comp.kind === "fan"
                  ? "💨 Cooling Fan"
                  : comp.kind}{" "}
                <span className="text-slate-400 font-mono text-xs">({comp.id})</span>
              </h3>
              <p className="font-mono text-[11px] text-[#8b949e]">
                Mounted on {comp.member} @ {(comp.s * 100).toFixed(0)}%
              </p>
            </div>

            {/* Quick delete button */}
            <button
              onClick={() => deleteComponent(comp.id)}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1.5 text-xs font-semibold text-red-400 transition-colors"
              title="Delete this component"
            >
              <Trash2 size={13} />
              <span>Delete</span>
            </button>
          </div>

          {/* Friendly Health Status Card */}
          {result && (
            <div
              className={`rounded-xl border p-3 ${
                result.status === "critical"
                  ? "border-red-500/50 bg-red-950/30 text-red-200"
                  : result.status === "warning"
                  ? "border-amber-500/50 bg-amber-950/30 text-amber-200"
                  : "border-emerald-500/50 bg-emerald-950/30 text-emerald-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <StatusChip status={result.status} />
                <span className="font-mono text-xs font-bold">
                  {result.peak_accel_g.toFixed(2)} g peak
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-200">
                {result.status === "critical"
                  ? `🚨 DANGER! Shaking violently at ${result.at_rpm.toLocaleString()} RPM! (Safe limit is ${comp.limit_g ?? 0.5} g). Videos will be blurry. Click "Auto-Fix" in the top bar to stop this shake!`
                  : result.status === "warning"
                  ? `⚠️ A bit wobbly at ${result.at_rpm.toLocaleString()} RPM. Noticeable vibration.`
                  : `✅ Smooth & Calm! Shaking is well below danger levels. Perfect!`}
              </p>
            </div>
          )}

          {/* Position Along Arm */}
          <Field label={`Where on Arm: ${(comp.s * 100).toFixed(0)}% (${comp.s < 0.3 ? "Near Center" : comp.s > 0.7 ? "Near Tip" : "Mid-Span"})`}>
            <input
              type="range"
              step={0.01}
              min={0.02}
              max={0.98}
              value={comp.s}
              onChange={(e) =>
                updateDesign((d) => ({
                  ...d,
                  components: d.components.map((c) =>
                    c.id === comp.id ? { ...c, s: Number(e.target.value) } : c
                  ),
                }))
              }
              className="w-full accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>Center (0%)</span>
              <span>Middle (50%)</span>
              <span>Tip (100%)</span>
            </div>
          </Field>

          {/* Weight */}
          <Field label={`Weight: ${(comp.mass * 1000).toFixed(0)} grams (${comp.mass} kg)`}>
            <input
              type="number"
              step={0.005}
              min={0.001}
              max={50}
              value={comp.mass}
              onChange={(e) =>
                updateDesign((d) => ({
                  ...d,
                  components: d.components.map((c) =>
                    c.id === comp.id ? { ...c, mass: Number(e.target.value) } : c
                  ),
                }))
              }
              className="w-full"
            />
          </Field>

          {/* Mount Isolator Presets (Shock Absorbers) */}
          <div className="rounded-xl border border-[#21262d] bg-[#111820] p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-cyan-400 text-[10px]">
                Shock Absorber Cushion Pad
              </span>
              <span className="text-[10px] text-slate-400">Protects from shake</span>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Cushion Material</label>
              <select
                value={comp.mount.preset}
                onChange={(e) => {
                  const pKey = e.target.value as MountPreset;
                  const p = MOUNT_PRESETS[pKey];
                  updateDesign((d) => ({
                    ...d,
                    components: d.components.map((c) =>
                      c.id === comp.id
                        ? {
                            ...c,
                            mount: {
                              preset: pKey,
                              kv: p?.kv ?? c.mount.kv,
                              zeta: p?.zeta ?? c.mount.zeta,
                            },
                          }
                        : c
                    ),
                  }));
                }}
                className="w-full"
              >
                {Object.values(MOUNT_PRESETS).map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Stiffness (N/m)">
                <input
                  type="number"
                  step={1000}
                  value={comp.mount.kv}
                  onChange={(e) =>
                    updateDesign((d) => ({
                      ...d,
                      components: d.components.map((c) =>
                        c.id === comp.id
                          ? {
                              ...c,
                              mount: { ...c.mount, kv: Number(e.target.value) },
                            }
                          : c
                      ),
                    }))
                  }
                  className="w-full font-mono text-xs"
                />
              </Field>

              <Field label="Damping (ζ)">
                <input
                  type="number"
                  step={0.01}
                  min={0.01}
                  max={0.5}
                  value={comp.mount.zeta}
                  onChange={(e) =>
                    updateDesign((d) => ({
                      ...d,
                      components: d.components.map((c) =>
                        c.id === comp.id
                          ? { ...c, mount: { ...c.mount, zeta: Number(e.target.value) } }
                          : c
                      ),
                    }))
                  }
                  className="w-full font-mono text-xs"
                />
              </Field>
            </div>
          </div>

          {comp.limit_g != null && (
            <Field label="Safe Shake Limit (g) — higher means more tolerant">
              <input
                type="number"
                step={0.1}
                value={comp.limit_g}
                onChange={(e) =>
                  updateDesign((d) => ({
                    ...d,
                    components: d.components.map((c) =>
                      c.id === comp.id
                        ? { ...c, limit_g: Number(e.target.value) }
                        : c
                    ),
                  }))
                }
                className="w-full font-mono text-xs"
              />
            </Field>
          )}

          {/* Big Prominent Component Deletion Card */}
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-red-300">
              Remove this Part
            </span>
            <p className="mt-1 text-[11px] text-slate-300">
              Remove this {comp.kind} from your design. The simulation updates instantly.
            </p>
            <button
              onClick={() => deleteComponent(comp.id)}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-600 hover:bg-red-500 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-red-950/40 transition-all"
            >
              <Trash2 size={14} />
              <span>Delete {comp.kind} ({comp.id})</span>
            </button>
          </div>
        </div>
      );
    }

    // 2. Member Inspector
    if (selection.type === "member" && selection.id) {
      const member = design.members.find((m) => m.id === selection.id);
      if (!member) return null;
      const mat = MATERIALS[member.material] ?? MATERIALS.aluminium_6061;

      return (
        <div className="space-y-4 p-3.5 text-xs">
          <div>
            <h3 className="text-sm font-semibold text-[#e6edf3]">
              Member {member.id}
            </h3>
            <p className="font-mono text-[11px] text-[#6e7681]">
              Span: Node {member.n1} → Node {member.n2}
            </p>
          </div>

          {/* Material Selection */}
          <div>
            <Field label="Material">
              <select
                value={member.material}
                onChange={(e) => {
                  const mKey = e.target.value as MaterialKey;
                  updateDesign((d) => ({
                    ...d,
                    members: d.members.map((m) =>
                      m.id === member.id ? { ...m, material: mKey } : m
                    ),
                  }));
                }}
                className="w-full"
              >
                {Object.values(MATERIALS).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="mt-2 grid grid-cols-3 gap-1 rounded bg-[#161b22] p-2 font-mono text-[10px] text-[#8b949e]">
              <div>
                <span className="text-[#6e7681] block">E:</span>
                {(mat.E / 1e9).toFixed(0)} GPa
              </div>
              <div>
                <span className="text-[#6e7681] block">ρ:</span>
                {mat.rho} kg/m³
              </div>
              <div>
                <span className="text-[#6e7681] block">Yield:</span>
                {mat.yield_mpa} MPa
              </div>
            </div>
          </div>

          {/* Cross-Section Type & Dimensions */}
          <div className="space-y-3 rounded-lg border border-[#21262d] bg-[#111820] p-3">
            <Field label="Cross-Section Profile">
              <select
                value={member.section.type}
                onChange={(e) => {
                  const sType = e.target.value as SectionType;
                  updateDesign((d) => ({
                    ...d,
                    members: d.members.map((m) => {
                      if (m.id !== member.id) return m;
                      if (sType === "rect") {
                        return { ...m, section: { type: "rect", w: 0.016, h: 0.006 } };
                      } else if (sType === "circ") {
                        return { ...m, section: { type: "circ", d: 0.015 } };
                      } else if (sType === "tube") {
                        return { ...m, section: { type: "tube", d: 0.018, t: 0.002 } };
                      } else {
                        return { ...m, section: { type: "box", w: 0.02, h: 0.015, t: 0.002 } };
                      }
                    }),
                  }));
                }}
                className="w-full"
              >
                <option value="rect">Rectangular (Solid w × h)</option>
                <option value="circ">Circular (Solid Rod d)</option>
                <option value="tube">Hollow Tube (OD d, Wall t)</option>
                <option value="box">Hollow Box (w × h, Wall t)</option>
              </select>
            </Field>

            {member.section.type === "rect" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Width w (mm)">
                  <input
                    type="number"
                    step={0.5}
                    value={+(member.section.w * 1000).toFixed(1)}
                    onChange={(e) =>
                      updateDesign((d) => ({
                        ...d,
                        members: d.members.map((m) =>
                          m.id === member.id && m.section.type === "rect"
                            ? {
                                ...m,
                                section: { ...m.section, w: Number(e.target.value) / 1000 },
                              }
                            : m
                        ),
                      }))
                    }
                    className="w-full"
                  />
                </Field>
                <Field label="Height h (mm)">
                  <input
                    type="number"
                    step={0.5}
                    value={+(member.section.h * 1000).toFixed(1)}
                    onChange={(e) =>
                      updateDesign((d) => ({
                        ...d,
                        members: d.members.map((m) =>
                          m.id === member.id && m.section.type === "rect"
                            ? {
                                ...m,
                                section: { ...m.section, h: Number(e.target.value) / 1000 },
                              }
                            : m
                        ),
                      }))
                    }
                    className="w-full"
                  />
                </Field>
              </div>
            )}

            {member.section.type === "circ" && (
              <Field label="Diameter d (mm)">
                <input
                  type="number"
                  step={0.5}
                  value={+(member.section.d * 1000).toFixed(1)}
                  onChange={(e) =>
                    updateDesign((d) => ({
                      ...d,
                      members: d.members.map((m) =>
                        m.id === member.id && m.section.type === "circ"
                          ? {
                              ...m,
                              section: { ...m.section, d: Number(e.target.value) / 1000 },
                            }
                          : m
                      ),
                    }))
                  }
                  className="w-full"
                />
              </Field>
            )}

            {member.section.type === "tube" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Outer Dia d (mm)">
                  <input
                    type="number"
                    step={0.5}
                    value={+(member.section.d * 1000).toFixed(1)}
                    onChange={(e) =>
                      updateDesign((d) => ({
                        ...d,
                        members: d.members.map((m) =>
                          m.id === member.id && m.section.type === "tube"
                            ? {
                                ...m,
                                section: { ...m.section, d: Number(e.target.value) / 1000 },
                              }
                            : m
                        ),
                      }))
                    }
                    className="w-full"
                  />
                </Field>
                <Field label="Wall Thickness t (mm)">
                  <input
                    type="number"
                    step={0.1}
                    value={+(member.section.t * 1000).toFixed(1)}
                    onChange={(e) =>
                      updateDesign((d) => ({
                        ...d,
                        members: d.members.map((m) =>
                          m.id === member.id && m.section.type === "tube"
                            ? {
                                ...m,
                                section: { ...m.section, t: Number(e.target.value) / 1000 },
                              }
                            : m
                        ),
                      }))
                    }
                    className="w-full"
                  />
                </Field>
              </div>
            )}

            {member.section.type === "box" && (
              <div className="grid grid-cols-3 gap-1.5">
                <Field label="Width w">
                  <input
                    type="number"
                    step={0.5}
                    value={+(member.section.w * 1000).toFixed(1)}
                    onChange={(e) =>
                      updateDesign((d) => ({
                        ...d,
                        members: d.members.map((m) =>
                          m.id === member.id && m.section.type === "box"
                            ? {
                                ...m,
                                section: { ...m.section, w: Number(e.target.value) / 1000 },
                              }
                            : m
                        ),
                      }))
                    }
                    className="w-full"
                  />
                </Field>
                <Field label="Height h">
                  <input
                    type="number"
                    step={0.5}
                    value={+(member.section.h * 1000).toFixed(1)}
                    onChange={(e) =>
                      updateDesign((d) => ({
                        ...d,
                        members: d.members.map((m) =>
                          m.id === member.id && m.section.type === "box"
                            ? {
                                ...m,
                                section: { ...m.section, h: Number(e.target.value) / 1000 },
                              }
                            : m
                        ),
                      }))
                    }
                    className="w-full"
                  />
                </Field>
                <Field label="Wall t">
                  <input
                    type="number"
                    step={0.1}
                    value={+(member.section.t * 1000).toFixed(1)}
                    onChange={(e) =>
                      updateDesign((d) => ({
                        ...d,
                        members: d.members.map((m) =>
                          m.id === member.id && m.section.type === "box"
                            ? {
                                ...m,
                                section: { ...m.section, t: Number(e.target.value) / 1000 },
                              }
                            : m
                        ),
                      }))
                    }
                    className="w-full"
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 3. Support Inspector
    if (selection.type === "support" && selection.id) {
      const support = design.supports.find((s) => s.node === selection.id);
      if (!support) return null;

      return (
        <div className="space-y-4 p-3.5 text-xs">
          <div>
            <h3 className="text-sm font-semibold text-[#e6edf3]">
              Support on Node {support.node}
            </h3>
            <p className="font-mono text-[11px] text-[#6e7681]">
              Boundary Condition Configuration
            </p>
          </div>

          <Field label="Support Type">
            <select
              value={support.type}
              onChange={(e) => {
                const sType = e.target.value as SupportType;
                updateDesign((d) => ({
                  ...d,
                  supports: d.supports.map((s) =>
                    s.node === support.node ? { ...s, type: sType } : s
                  ),
                }));
              }}
              className="w-full"
            >
              <option value="fixed">Fixed (Encastre u, v, θ = 0)</option>
              <option value="pinned">Pinned Hinge (u, v = 0)</option>
              <option value="roller">Roller (v = 0)</option>
              <option value="spring">Elastic Spring Mount (kx, ky, kr)</option>
              <option value="free">Free Boundary</option>
            </select>
          </Field>

          {support.type === "spring" && (
            <div className="space-y-2 rounded-lg border border-[#21262d] bg-[#111820] p-3">
              <Field label="Vertical Stiffness ky (N/m)">
                <input
                  type="number"
                  step={500}
                  value={support.ky ?? 2000}
                  onChange={(e) =>
                    updateDesign((d) => ({
                      ...d,
                      supports: d.supports.map((s) =>
                        s.node === support.node
                          ? { ...s, ky: Number(e.target.value) }
                          : s
                      ),
                    }))
                  }
                  className="w-full"
                />
              </Field>
              <Field label="Horizontal Stiffness kx (N/m)">
                <input
                  type="number"
                  step={500}
                  value={support.kx ?? 2000}
                  onChange={(e) =>
                    updateDesign((d) => ({
                      ...d,
                      supports: d.supports.map((s) =>
                        s.node === support.node
                          ? { ...s, kx: Number(e.target.value) }
                          : s
                      ),
                    }))
                  }
                  className="w-full"
                />
              </Field>
            </div>
          )}
        </div>
      );
    }

    // Default: Structure Overview
    return (
      <div className="space-y-4 p-3.5 text-xs">
        <div>
          <h3 className="text-sm font-semibold text-[#e6edf3]">{design.name}</h3>
          <p className="text-[11px] text-[#6e7681]">Plane: XY Line-Body Model</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Nodes" value={design.nodes.length} icon={Layers} />
          <Stat label="Members" value={design.members.length} icon={Box} />
          <Stat label="Components" value={design.components.length} icon={Sliders} />
          <Stat label="Supports" value={design.supports.length} icon={Layers} />
        </div>

        {analysis && (
          <div className="space-y-2 rounded-lg border border-[#30363d] bg-[#161b22] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6e7681]">
              Solver Diagnostics
            </p>
            <div className="flex items-center justify-between font-mono">
              <span className="text-[#8b949e]">Solve Time:</span>
              <span className="font-semibold text-cyan-400">
                {analysis.meta.solve_ms.toFixed(1)} ms ({analysis.meta.method.toUpperCase()})
              </span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-[#8b949e]">System DOFs:</span>
              <span className="text-[#e6edf3]">{analysis.meta.n_dof} DOFs</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-[#8b949e]">Modes Kept:</span>
              <span className="text-[#e6edf3]">{analysis.meta.n_modes_kept} Modes</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0f15]">
      <div className="flex-1 overflow-y-auto">{renderContent()}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#6e7681]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-[#21262d] bg-[#161b22] p-2.5">
      <Icon size={14} className="text-blue-400 shrink-0" />
      <div>
        <p className="text-[10px] text-[#6e7681]">{label}</p>
        <p className="font-mono text-sm font-semibold text-[#e6edf3]">{value}</p>
      </div>
    </div>
  );
}
