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
  Box,
  Layers,
  Trash2,
  Anchor,
  Cpu,
} from "lucide-react";

export default function DetailsPanel() {
  const design = useStore((s) => s.design);
  const analysis = useStore((s) => s.analysis);
  const selection = useStore((s) => s.selection);
  const updateDesign = useStore((s) => s.updateDesign);
  const deleteComponent = useStore((s) => s.deleteComponent);

  if (!design) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-xs text-muted">
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
        <div className="space-y-4 p-3 text-xs">
          {/* Header with Title and Fast Delete Button */}
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                Part Inspector
              </span>
              <h3 className="text-sm font-semibold text-ink capitalize">
                {comp.kind}{" "}
                <span className="text-muted font-mono text-xs">({comp.id})</span>
              </h3>
              <p className="font-mono text-[11px] text-muted">
                Mounted on {comp.member} @ {(comp.s * 100).toFixed(0)}%
              </p>
            </div>

            <button
              type="button"
              onClick={() => deleteComponent(comp.id)}
              className="flex items-center gap-1.5 rounded border border-danger/30 bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger hover:bg-danger hover:text-white transition-colors"
              title="Delete this component"
            >
              <Trash2 size={12} />
              <span>Delete</span>
            </button>
          </div>

          {/* Health Status Card */}
          {result && (
            <div
              className={`rounded-md border p-2.5 ${
                result.status === "critical"
                  ? "border-danger/40 bg-danger-soft text-danger"
                  : result.status === "warning"
                  ? "border-warn/40 bg-warn-soft text-warn"
                  : "border-ok/40 bg-ok-soft text-ok"
              }`}
            >
              <div className="flex items-center justify-between">
                <StatusChip status={result.status} />
                <span className="font-mono text-xs font-bold">
                  {result.peak_accel_g.toFixed(2)} g RMS
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed">
                {result.status === "critical"
                  ? `Critical: Exceeds safe limit (${comp.limit_g ?? 0.5} g RMS) at ${result.at_rpm.toLocaleString()} RPM. Soften mounts to attenuate.`
                  : result.status === "warning"
                  ? `Warning: Elevated vibration at ${result.at_rpm.toLocaleString()} RPM.`
                  : `Safe: Vibration levels remain comfortably below limit across operating speeds.`}
              </p>
            </div>
          )}

          {/* Position Along Arm */}
          <Field label={`Span Position: ${(comp.s * 100).toFixed(0)}%`}>
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
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted font-mono mt-0.5">
              <span>Root (0%)</span>
              <span>Mid (50%)</span>
              <span>Tip (100%)</span>
            </div>
          </Field>

          {/* Weight */}
          <Field label={`Mass: ${(comp.mass * 1000).toFixed(0)} g (${comp.mass} kg)`}>
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

          {/* Mount Isolator Presets */}
          <div className="rounded-md border border-line bg-panel p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-accent text-[10px]">
                Mount Isolator
              </span>
              <span className="text-[10px] text-muted">Vibration cushion</span>
            </div>

            <div>
              <label className="text-[10px] text-muted block mb-0.5">Mount Preset</label>
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
              <Field label="Stiffness kv (N/m)">
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

              <Field label="Damping Ratio (ζ)">
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
            <Field label="Acceleration Limit (g RMS)">
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
        </div>
      );
    }

    // 2. Member Inspector
    if (selection.type === "member" && selection.id) {
      const member = design.members.find((m) => m.id === selection.id);
      if (!member) return null;
      const mat = MATERIALS[member.material] ?? MATERIALS.aluminium_6061;

      return (
        <div className="space-y-4 p-3 text-xs">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Member {member.id}
            </h3>
            <p className="font-mono text-[11px] text-muted">
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

            <div className="mt-2 grid grid-cols-3 gap-1 rounded bg-panel p-2 font-mono text-[10px] text-muted border border-line-subtle">
              <div>
                <span className="text-ink-2 font-semibold block">E:</span>
                {(mat.E / 1e9).toFixed(0)} GPa
              </div>
              <div>
                <span className="text-ink-2 font-semibold block">Density:</span>
                {mat.rho} kg/m³
              </div>
              <div>
                <span className="text-ink-2 font-semibold block">Yield:</span>
                {mat.yield_mpa} MPa
              </div>
            </div>
          </div>

          {/* Cross-Section Type & Dimensions */}
          <div className="space-y-3 rounded-md border border-line bg-panel p-2.5">
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
                <Field label="Width w (mm)">
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
                <Field label="Height h (mm)">
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
                <Field label="Wall t (mm)">
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
        <div className="space-y-4 p-3 text-xs">
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Support on Node {support.node}
            </h3>
            <p className="font-mono text-[11px] text-muted">
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
            <div className="space-y-2 rounded-md border border-line bg-panel p-2.5">
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
      <div className="space-y-4 p-3 text-xs">
        <div>
          <h3 className="text-sm font-semibold text-ink">{design.name}</h3>
          <p className="text-[11px] text-muted">XY Line-Body 2D Finite Element Model</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Nodes" value={design.nodes.length} icon={Layers} />
          <Stat label="Members" value={design.members.length} icon={Box} />
          <Stat label="Components" value={design.components.length} icon={Cpu} />
          <Stat label="Supports" value={design.supports.length} icon={Anchor} />
        </div>

        {analysis && (
          <div className="space-y-1.5 rounded-md border border-line bg-panel p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Solver Diagnostics
            </p>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-muted">Solve Time:</span>
              <span className="font-semibold text-accent">
                {analysis.meta.solve_ms.toFixed(1)} ms ({analysis.meta.method.toUpperCase()})
              </span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-muted">System DOFs:</span>
              <span className="text-ink">{analysis.meta.n_dof} DOFs</span>
            </div>
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-muted">Modes Kept:</span>
              <span className="text-ink">{analysis.meta.n_modes_kept} Modes</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface">
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
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
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
    <div className="flex items-center gap-2 rounded border border-line bg-panel p-2">
      <Icon size={14} className="text-accent shrink-0" />
      <div>
        <p className="text-[10px] text-muted">{label}</p>
        <p className="font-mono text-xs font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
