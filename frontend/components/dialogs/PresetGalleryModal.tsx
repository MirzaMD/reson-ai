"use client";

import { useStore } from "@/lib/store/useStore";
import { STRUCTURE_PRESETS } from "@/lib/presets/presets";
import { analyze } from "@/lib/api/client";
import {
  X,
  Compass,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import type { StructurePreset } from "@/lib/types/contract";

export default function PresetGalleryModal() {
  const isOpen = useStore((s) => s.ui.presetPickerOpen);
  const setUi = useStore((s) => s.setUi);
  const setDesign = useStore((s) => s.setDesign);
  const pushHistory = useStore((s) => s.pushHistory);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const currentDesignName = useStore((s) => s.design?.name);
  const showToast = useStore((s) => s.showToast);

  if (!isOpen) return null;

  const handleSelectPreset = async (preset: StructurePreset) => {
    const d = structuredClone(preset.design);
    setDesign(d);
    pushHistory(d);
    setUi({ presetPickerOpen: false, isAnalyzing: true, error: null });
    showToast(`Loaded ${preset.name}.`, "success");

    try {
      const res = await analyze(d);
      setAnalysis(res);
    } catch {
      // Handled gracefully
    } finally {
      setUi({ isAnalyzing: false });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-line bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-panel/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Compass size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">
                Structural Presets & Templates
              </h2>
              <p className="text-xs text-muted">
                Select a benchmark structure or verified template to simulate and optimize
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUi({ presetPickerOpen: false })}
            className="rounded p-1 text-muted hover:text-ink hover:bg-panel transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Gallery Grid */}
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-5 md:grid-cols-2">
          {STRUCTURE_PRESETS.map((preset) => {
            const isCurrent = currentDesignName === preset.design.name;
            const isHero = preset.id === "quad_diagonal";
            const isValidation =
              preset.id.includes("simply") ||
              preset.id.includes("cantilever") ||
              preset.id.includes("fixed");

            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`group relative flex cursor-pointer flex-col justify-between rounded-md border p-3.5 transition-all hover:border-accent-line hover:shadow-xs ${
                  isCurrent
                    ? "border-accent bg-accent-soft/40"
                    : "border-line bg-surface hover:bg-panel/40"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-semibold text-ink group-hover:text-accent">
                      {preset.name}
                    </h3>
                    <div className="flex shrink-0 gap-1.5">
                      {isHero && (
                        <span className="flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.2 text-[10px] font-semibold text-accent">
                          <Sparkles size={10} /> Hero Demo
                        </span>
                      )}
                      {isValidation && (
                        <span className="flex items-center gap-1 rounded bg-ok-soft px-1.5 py-0.2 text-[10px] font-semibold text-ok">
                          <ShieldCheck size={10} /> Verified
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    {preset.description}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line-subtle pt-2.5 text-[11px] text-muted">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Layers size={11} /> {preset.design.members.length} members
                    </span>
                    <span>{preset.design.components.length} components</span>
                  </div>

                  <div className="flex items-center gap-1 font-medium text-accent">
                    {isCurrent ? (
                      <span className="flex items-center gap-1 text-ok font-semibold">
                        <CheckCircle2 size={12} /> Active
                      </span>
                    ) : (
                      <>
                        Load <ArrowRight size={12} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-panel/50 px-5 py-2.5 text-xs text-muted">
          <span>
            Analytical verification against Euler-Bernoulli beam theory
          </span>
          <button
            type="button"
            onClick={() => setUi({ presetPickerOpen: false })}
            className="btn btn-outline h-7 px-3 text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
