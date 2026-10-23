"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Box,
  Layers,
  Anchor,
  Cpu,
  Plus,
  LayoutGrid,
  Trash2,
  Camera,
  Fan,
  Navigation,
  Battery,
} from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import clsx from "clsx";
import type { ComponentKind, ComponentStatus } from "@/lib/types/contract";

function getComponentIcon(kind: ComponentKind) {
  switch (kind) {
    case "camera":
      return Camera;
    case "motor":
      return Fan;
    case "fan":
      return Fan;
    case "gyro":
    case "fc":
      return Navigation;
    case "battery":
      return Battery;
    default:
      return Cpu;
  }
}

function getComponentFriendlyName(kind: ComponentKind) {
  switch (kind) {
    case "motor":
      return "Motor & Propeller";
    case "camera":
      return "4K Gimbal Camera";
    case "gyro":
      return "Flight Gyro Sensor";
    case "fc":
      return "Flight Controller";
    case "fan":
      return "Cooling Fan";
    case "battery":
      return "Battery Pack";
    default:
      return "Attached Payload";
  }
}

function TreeSection({
  title,
  icon: Icon,
  badge,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  icon: React.ElementType;
  badge?: string | number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#21262d]">
      <div className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#161b22] transition-colors">
        <button
          className="flex flex-1 items-center gap-2"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown size={13} className="text-[#6e7681]" />
          ) : (
            <ChevronRight size={13} className="text-[#6e7681]" />
          )}
          <Icon size={14} className="text-cyan-400" />
          <span className="text-[11px] font-bold tracking-wider text-[#cbd5e1] uppercase">
            {title}
          </span>
          {badge != null && (
            <span className="rounded-full bg-slate-800 px-1.5 py-0.2 text-[10px] font-mono text-[#8b949e]">
              {badge}
            </span>
          )}
        </button>
        {action}
      </div>
      {open && <div className="pb-1.5">{children}</div>}
    </div>
  );
}

export default function ModelTree() {
  const design = useStore((s) => s.design);
  const analysis = useStore((s) => s.analysis);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const leftSidebarOpen = useStore((s) => s.ui.leftSidebarOpen);
  const setUi = useStore((s) => s.setUi);
  const deleteComponent = useStore((s) => s.deleteComponent);

  const statusMap = new Map<string, ComponentStatus>(
    analysis?.components.map((c) => [c.id, c.status]) ?? []
  );

  if (!leftSidebarOpen) {
    return (
      <button
        onClick={() => setUi({ leftSidebarOpen: true })}
        className="absolute left-3 top-14 z-20 flex items-center gap-2 rounded-xl border border-white/[0.1] bg-[#0d1117]/90 px-3 py-2 text-xs font-semibold text-[#cbd5e1] shadow-2xl backdrop-blur-md transition-all hover:bg-[#161b22] hover:text-white hover:border-cyan-500/40"
        title="Open Machine Parts List"
      >
        <Layers size={14} className="text-cyan-400" />
        <span>Parts List</span>
        <ChevronRight size={13} className="text-[#6e7681]" />
      </button>
    );
  }

  return (
    <aside className="relative flex h-full w-72 shrink-0 flex-col border-r border-[#21262d] bg-[#0b0f15] shadow-2xl transition-all">
      {/* Title & Quick Actions */}
      <div className="flex flex-col border-b border-[#21262d] bg-[#0d1117] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-cyan-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Machine Parts 🛠️
            </h2>
          </div>
          <button
            onClick={() => setUi({ leftSidebarOpen: false })}
            className="rounded-lg p-1 text-[#6e7681] hover:bg-[#161b22] hover:text-[#e6edf3] transition-colors"
            title="Minimize Panel"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[#8b949e]">
          Click any part to change it, or click 🗑️ to delete it.
        </p>

        {/* Action Buttons */}
        <div className="mt-2.5 flex items-center gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-700/20 transition-all disabled:opacity-50"
            onClick={() => setUi({ addComponentModalOpen: true })}
            title="Add motor, camera, or sensor"
            disabled={!design}
          >
            <Plus size={14} />
            <span>Add New Part</span>
          </button>

          <button
            className="flex items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#161b22] hover:bg-[#21262d] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors"
            onClick={() => setUi({ presetPickerOpen: true })}
            title="Browse pre-made drones and templates"
          >
            <LayoutGrid size={13} className="text-cyan-400" />
            <span>Presets</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!design ? (
          <div className="p-6 text-center text-xs text-[#8b949e]">
            Load an example drone or machine to see its parts.
          </div>
        ) : (
          <>
            {/* 1. Components / Payloads Section (Most important for users!) */}
            <TreeSection
              title="Attached Parts"
              badge={design.components.length}
              icon={Cpu}
              defaultOpen={true}
              action={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUi({ addComponentModalOpen: true });
                  }}
                  className="flex items-center gap-1 rounded bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
                  title="Add a new component"
                >
                  <Plus size={11} />
                  <span>Add</span>
                </button>
              }
            >
              {design.components.length === 0 ? (
                <div className="px-4 py-3 text-center text-[11px] text-[#6e7681]">
                  No parts attached yet. Click &quot;Add&quot; above to attach a motor or camera!
                </div>
              ) : (
                design.components.map((c) => {
                  const CompIcon = getComponentIcon(c.kind);
                  const isSelected =
                    selection.type === "component" && selection.id === c.id;
                  const status = statusMap.get(c.id);

                  return (
                    <div
                      key={c.id}
                      className={clsx(
                        "group relative flex items-center justify-between px-3 py-1.5 transition-colors",
                        isSelected
                          ? "bg-blue-500/20 text-blue-200 border-l-2 border-l-blue-400"
                          : "text-[#cbd5e1] hover:bg-[#161b22]"
                      )}
                    >
                      <button
                        className="flex flex-1 min-w-0 items-center gap-2 text-left"
                        onClick={() => setSelection({ type: "component", id: c.id })}
                      >
                        <div
                          className={clsx(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                            isSelected
                              ? "border-blue-400/50 bg-blue-500/30 text-white"
                              : "border-[#30363d] bg-[#161b22] text-slate-300"
                          )}
                        >
                          <CompIcon size={12} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-white">
                              {getComponentFriendlyName(c.kind)}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              ({c.id})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-[#8b949e]">
                            <span>{(c.mass * 1000).toFixed(0)}g</span>
                            <span>•</span>
                            <span>{(c.s * 100).toFixed(0)}% on {c.member}</span>
                          </div>
                        </div>
                      </button>

                      {/* Status indicator pill */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-1">
                        {status && (
                          <span
                            className={clsx(
                              "rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase",
                              status === "ok" && "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
                              status === "warning" && "bg-amber-500/15 text-amber-300 border border-amber-500/30",
                              status === "critical" && "bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse"
                            )}
                            title={
                              status === "ok"
                                ? "Safe & Smooth"
                                : status === "warning"
                                ? "Wobbly"
                                : "Violent shaking! Click to inspect"
                            }
                          >
                            {status === "ok" ? "Safe" : status === "warning" ? "Wobbly" : "Danger"}
                          </span>
                        )}

                        {/* EXPLICIT DELETE BUTTON ON EVERY COMPONENT ROW */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteComponent(c.id);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-slate-400 hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                          title={`Delete ${c.kind} (${c.id})`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </TreeSection>

            {/* 2. Structural Beams / Arms */}
            <TreeSection
              title="Frame & Arms"
              badge={design.members.length}
              icon={Box}
              defaultOpen={true}
            >
              {design.members.map((m) => {
                const isSelected =
                  selection.type === "member" && selection.id === m.id;
                return (
                  <button
                    key={m.id}
                    className={clsx(
                      "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-blue-500/20 text-blue-200 border-l-2 border-l-blue-400"
                        : "text-[#cbd5e1] hover:bg-[#161b22]"
                    )}
                    onClick={() => setSelection({ type: "member", id: m.id })}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">Arm {m.id}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-[#8b949e] uppercase">
                        {m.material === "cfrp" ? "Carbon Fiber" : m.material.replace("_", " ")}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">
                      {m.n1} → {m.n2}
                    </span>
                  </button>
                );
              })}
            </TreeSection>

            {/* 3. Supports / Anchors */}
            <TreeSection
              title="Mount Supports"
              badge={design.supports.length}
              icon={Anchor}
              defaultOpen={false}
            >
              {design.supports.map((s) => (
                <button
                  key={s.node}
                  className={clsx(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors",
                    selection.type === "support" && selection.id === s.node
                      ? "bg-blue-500/20 text-blue-200 border-l-2 border-l-blue-400"
                      : "text-[#cbd5e1] hover:bg-[#161b22]"
                  )}
                  onClick={() => setSelection({ type: "support", id: s.node })}
                >
                  <span className="font-medium text-slate-300">
                    Anchor at {s.node}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 uppercase">
                    {s.type}
                  </span>
                </button>
              ))}
            </TreeSection>

            {/* 4. Frame Joints (Nodes) */}
            <TreeSection
              title="Joint Points"
              badge={design.nodes.length}
              icon={Layers}
              defaultOpen={false}
            >
              {design.nodes.map((n) => (
                <button
                  key={n.id}
                  className={clsx(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors",
                    selection.type === "node" && selection.id === n.id
                      ? "bg-blue-500/20 text-blue-200 border-l-2 border-l-blue-400"
                      : "text-[#cbd5e1] hover:bg-[#161b22]"
                  )}
                  onClick={() => setSelection({ type: "node", id: n.id })}
                >
                  <span className="font-medium text-slate-300">{n.id}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    ({(n.x * 1000).toFixed(0)}, {(n.y * 1000).toFixed(0)}) mm
                  </span>
                </button>
              ))}
            </TreeSection>
          </>
        )}
      </div>

      {/* Helpful keyboard shortcut tip */}
      <div className="border-t border-[#21262d] bg-[#0d1117] p-2.5 text-center text-[10px] text-[#6e7681]">
        💡 Press <kbd className="rounded border border-slate-700 bg-slate-800 px-1 text-slate-300">Del</kbd> on your keyboard to delete selected part!
      </div>
    </aside>
  );
}
