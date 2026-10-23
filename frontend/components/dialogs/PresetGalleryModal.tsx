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
    showToast(`📂 Loaded ${preset.name}!`, "success");

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-[#30363d] bg-[#0d1117] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#21262d] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Compass size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#e6edf3]">
                Structural Presets & Templates
              </h2>
              <p className="text-xs text-[#8b949e]">
                Select a benchmark structure or verified template to simulate and optimize
              </p>
            </div>
          </div>
          <button
            onClick={() => setUi({ presetPickerOpen: false })}
            className="rounded-lg p-1.5 text-[#6e7681] hover:bg-[#161b22] hover:text-[#e6edf3]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Gallery Grid */}
        <div className="grid flex-1 grid-cols-1 gap-3.5 overflow-y-auto p-6 md:grid-cols-2">
          {STRUCTURE_PRESETS.map((preset) => {
            const isCurrent = currentDesignName === preset.design.name;
            const isHero = preset.id === "quad_diagonal";
            const isValidation = preset.id.includes("simply") || preset.id.includes("cantilever") || preset.id.includes("fixed");

            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`group relative flex cursor-pointer flex-col justify-between rounded-lg border p-4 transition-all hover:scale-[1.01] hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-950/20 ${
                  isCurrent
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-[#21262d] bg-[#111820] hover:bg-[#161b22]"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#e6edf3] group-hover:text-blue-300">
                      {preset.name}
                    </h3>
                    <div className="flex shrink-0 gap-1.5">
                      {isHero && (
                        <span className="flex items-center gap-1 rounded bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                          <Sparkles size={11} /> Hero Demo
                        </span>
                      )}
                      {isValidation && (
                        <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          <ShieldCheck size={11} /> Validation
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-[#8b949e]">
                    {preset.description}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#21262d] pt-3 text-[11px] text-[#6e7681]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Layers size={12} /> {preset.design.members.length} members
                    </span>
                    <span>{preset.design.components.length} components</span>
                  </div>

                  <div className="flex items-center gap-1 font-medium text-blue-400 group-hover:translate-x-0.5 transition-transform">
                    {isCurrent ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={13} /> Active
                      </span>
                    ) : (
                      <>
                        Load <ArrowRight size={13} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#21262d] bg-[#090d13] px-6 py-3 text-xs text-[#6e7681]">
          <span>
            Every template is verified against analytical Euler-Bernoulli solutions
          </span>
          <button
            onClick={() => setUi({ presetPickerOpen: false })}
            className="btn btn-ghost"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
