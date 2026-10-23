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
  Trash2,
  Camera,
  Fan,
  Navigation,
  Battery,
} from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import clsx from "clsx";
import type { ComponentKind } from "@/lib/types/contract";

function getComponentIcon(kind: ComponentKind) {
  switch (kind) {
    case "camera":
      return Camera;
    case "motor":
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

function getComponentLabel(kind: ComponentKind) {
  switch (kind) {
    case "motor":
      return "Motor";
    case "camera":
      return "Camera";
    case "gyro":
      return "Gyro Sensor";
    case "fc":
      return "Flight Controller";
    case "fan":
      return "Fan";
    case "battery":
      return "Battery";
    default:
      return "Component";
  }
}

function Section({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line-subtle">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-panel transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-1.5 truncate">
          {open ? (
            <ChevronDown size={12} className="text-muted shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-muted shrink-0" />
          )}
          <Icon size={13} className="text-accent shrink-0" />
          <span className="text-xs font-semibold text-ink-2 truncate">{title}</span>
        </div>
        {count != null && (
          <span className="rounded bg-panel px-1.5 py-0.2 text-[10px] font-mono text-muted">
            {count}
          </span>
        )}
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

export default function ModelTree() {
  const design = useStore((s) => s.design);
  const analysis = useStore((s) => s.analysis);
  const selection = useStore((s) => s.selection);
  const leftSidebarOpen = useStore((s) => s.ui.leftSidebarOpen);
  const setSelection = useStore((s) => s.setSelection);
  const setUi = useStore((s) => s.setUi);
  const deleteComponent = useStore((s) => s.deleteComponent);

  // Collapsed 48 px icon rail
  if (!leftSidebarOpen) {
    return (
      <aside className="relative flex h-full w-12 shrink-0 flex-col items-center border-r border-line bg-surface py-2 z-10 transition-all duration-150">
        <button
          type="button"
          onClick={() => setUi({ leftSidebarOpen: true })}
          className="btn-ghost flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-ink hover:bg-panel transition-colors"
          title="Expand Model Panel"
          aria-label="Expand Model"
        >
          <ChevronRight size={15} />
        </button>

        <div className="my-2 h-px w-6 bg-line-subtle" />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setUi({ leftSidebarOpen: true })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-accent hover:bg-panel transition-colors relative"
            title="Components"
            aria-label="Components"
          >
            <Cpu size={15} />
            {design?.components.length ? (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setUi({ leftSidebarOpen: true })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-accent hover:bg-panel transition-colors"
            title="Frame Members"
            aria-label="Frame Members"
          >
            <Box size={15} />
          </button>

          <button
            type="button"
            onClick={() => setUi({ leftSidebarOpen: true })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-accent hover:bg-panel transition-colors"
            title="Supports"
            aria-label="Supports"
          >
            <Anchor size={15} />
          </button>

          <button
            type="button"
            onClick={() => setUi({ leftSidebarOpen: true, addComponentModalOpen: true })}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-ok hover:bg-ok-soft transition-colors mt-2"
            title="Add Component"
            aria-label="Add Component"
          >
            <Plus size={15} />
          </button>
        </div>
      </aside>
    );
  }

  // Expanded 260 px Model Tree
  return (
    <aside className="relative flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-surface z-10 transition-all duration-150">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3 bg-panel/50">
        <div className="flex items-center gap-1.5">
          <Layers size={13} className="text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">Model</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setUi({ addComponentModalOpen: true })}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-accent hover:bg-accent-soft transition-colors"
            title="Add new component"
          >
            <Plus size={12} />
            <span>Add</span>
          </button>
          <button
            type="button"
            onClick={() => setUi({ leftSidebarOpen: false })}
            className="p-1 rounded text-muted hover:text-ink hover:bg-panel transition-colors"
            title="Collapse rail"
            aria-label="Collapse rail"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Model Tree List */}
      <div className="flex-1 overflow-y-auto">
        {!design ? (
          <div className="p-4 text-center text-xs text-muted">
            No design loaded. Load a preset to inspect components.
          </div>
        ) : (
          <>
            {/* 1. Components Section */}
            <Section title="Components" icon={Cpu} count={design.components.length} defaultOpen={true}>
              {design.components.map((c) => {
                const Icon = getComponentIcon(c.kind);
                const isSelected = selection.type === "component" && selection.id === c.id;
                const compFinding = analysis?.components?.find((item) => item.id === c.id);
                const status = compFinding?.status ?? (c.limit_g ? "ok" : undefined);

                return (
                  <div
                    key={c.id}
                    className={clsx(
                      "group flex items-center justify-between px-2.5 py-1.5 transition-colors cursor-pointer border-l-2",
                      isSelected
                        ? "bg-accent-soft/60 border-accent"
                        : "border-transparent hover:bg-panel"
                    )}
                    onClick={() => setSelection({ type: "component", id: c.id })}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                      <Icon size={13} className={isSelected ? "text-accent" : "text-muted"} />
                      <div className="min-w-0 flex-1 truncate">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-xs font-medium text-ink truncate">
                            {getComponentLabel(c.kind)}
                          </span>
                          <span className="font-mono text-[10px] text-muted truncate">
                            {c.id}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted truncate font-mono">
                          {(c.mass * 1000).toFixed(0)}g on {c.member} ({Math.round(c.s * 100)}%)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {status && (
                        <span
                          className={clsx(
                            "rounded px-1.5 py-0.2 text-[9px] font-semibold tracking-wide uppercase font-mono",
                            status === "ok" && "bg-ok-soft text-ok",
                            status === "warning" && "bg-warn-soft text-warn",
                            status === "critical" && "bg-danger-soft text-danger"
                          )}
                        >
                          {status}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteComponent(c.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-danger rounded transition-opacity"
                        title={`Delete ${c.id}`}
                        aria-label={`Delete ${c.id}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </Section>

            {/* 2. Structure Frame Members */}
            <Section title="Frame Members" icon={Box} count={design.members.length} defaultOpen={true}>
              {design.members.map((m) => {
                const isSelected = selection.type === "member" && selection.id === m.id;
                return (
                  <button
                    type="button"
                    key={m.id}
                    className={clsx(
                      "flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors border-l-2",
                      isSelected
                        ? "bg-accent-soft/60 border-accent"
                        : "border-transparent hover:bg-panel"
                    )}
                    onClick={() => setSelection({ type: "member", id: m.id })}
                  >
                    <div className="truncate">
                      <span className="text-xs font-medium text-ink">Arm {m.id}</span>
                      <span className="ml-1.5 font-mono text-[10px] text-muted">
                        {m.material}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted shrink-0">
                      {m.n1} → {m.n2}
                    </span>
                  </button>
                );
              })}
            </Section>

            {/* 3. Supports & Anchors */}
            <Section title="Supports" icon={Anchor} count={design.supports.length} defaultOpen={false}>
              {design.supports.map((s) => (
                <button
                  type="button"
                  key={s.node}
                  className={clsx(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors border-l-2",
                    selection.type === "support" && selection.id === s.node
                      ? "bg-accent-soft/60 border-accent"
                      : "border-transparent hover:bg-panel"
                  )}
                  onClick={() => setSelection({ type: "support", id: s.node })}
                >
                  <span className="text-xs font-medium text-ink">Anchor {s.node}</span>
                  <span className="font-mono text-[10px] text-muted uppercase">
                    {s.type}
                  </span>
                </button>
              ))}
            </Section>

            {/* 4. Joint Points (Nodes) */}
            <Section title="Joints" icon={Layers} count={design.nodes.length} defaultOpen={false}>
              {design.nodes.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  className={clsx(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors border-l-2",
                    selection.type === "node" && selection.id === n.id
                      ? "bg-accent-soft/60 border-accent"
                      : "border-transparent hover:bg-panel"
                  )}
                  onClick={() => setSelection({ type: "node", id: n.id })}
                >
                  <span className="text-xs font-medium text-ink">{n.id}</span>
                  <span className="font-mono text-[10px] text-muted">
                    ({(n.x * 1000).toFixed(0)}, {(n.y * 1000).toFixed(0)}) mm
                  </span>
                </button>
              ))}
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
