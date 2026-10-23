// → replaces src/app/page.tsx  (logic unchanged; only colors, badges and copy)
"use client";

import { useMemo, useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Toolbar from "@/components/layout/Toolbar";
import ModelTree from "@/components/layout/ModelTree";
import RightDock from "@/components/layout/RightDock";
import BottomTabs from "@/components/layout/BottomTabs";
import ComparePanel from "@/components/panels/ComparePanel";
import LoadingOverlay from "@/components/ui/LoadingOverlay";
import ErrorBanner from "@/components/ui/ErrorBanner";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import PresetGalleryModal from "@/components/dialogs/PresetGalleryModal";
import AddComponentModal from "@/components/dialogs/AddComponentModal";
import ValidationModal from "@/components/dialogs/ValidationModal";
import KidFriendlyGuide from "@/components/ui/KidFriendlyGuide";
import ToastNotification from "@/components/ui/ToastNotification";
import PerfOverlay from "@/components/ui/PerfOverlay";
import { useStore } from "@/lib/store/useStore";
import { STRUCTURE_PRESETS } from "@/lib/presets/presets";
import { runClientSimulation } from "@/lib/solver/clientSolver";
import { analyze } from "@/lib/api/client";

// 3D canvas must be client-only (no SSR)
const SceneRoot = dynamic(() => import("@/components/scene/SceneRoot"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-muted">
      Loading 3D view…
    </div>
  ),
});

/** Label pinned to the corner of a viewport in compare mode. */
function ViewportBadge({
  tone,
  children,
}: {
  tone: "danger" | "ok";
  children: ReactNode;
}) {
  const palette =
    tone === "danger"
      ? "border-danger/30 bg-danger-soft text-danger"
      : "border-ok/30 bg-ok-soft text-ok";
  const dot = tone === "danger" ? "bg-danger" : "bg-ok";
  return (
    <div
      className={`absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium shadow-sm ${palette}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {children}
    </div>
  );
}

export default function HomePage() {
  const design = useStore((s) => s.design);
  const analysis = useStore((s) => s.analysis);
  const setDesign = useStore((s) => s.setDesign);
  const pushHistory = useStore((s) => s.pushHistory);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setUi = useStore((s) => s.setUi);
  const ui = useStore((s) => s.ui);
  const optimizeResult = useStore((s) => s.optimizeResult);
  const activeCandidate = useStore((s) => s.activeCandidate);

  // Initialize with Quadcopter hero preset if empty on first load
  useEffect(() => {
    if (!design) {
      const hero = STRUCTURE_PRESETS[0];
      const d = structuredClone(hero.design);
      setDesign(d);
      pushHistory(d);
      analyze(d)
        .then(setAnalysis)
        .catch((error: unknown) => {
          setUi({
            error:
              error instanceof Error
                ? error.message
                : "Initial analysis failed.",
          });
        });
    }
  }, [design, setDesign, pushHistory, setAnalysis, setUi]);

  // Compute optimized candidate simulation and shared max amplitude for Compare View
  const { candSim, sharedMaxAmp } = useMemo(() => {
    if (ui.viewMode !== "compare" || !optimizeResult) {
      return { candSim: null, sharedMaxAmp: 1 };
    }
    const cand = activeCandidate ?? optimizeResult.candidates[0];
    if (!cand) return { candSim: null, sharedMaxAmp: 1 };

    const cSim = runClientSimulation(cand.design);

    let maxOrig = 0.01;
    if (analysis?.sweep.node_amp_mm) {
      for (const row of analysis.sweep.node_amp_mm) {
        for (const v of row) maxOrig = Math.max(maxOrig, v);
      }
    }
    let maxCand = 0.01;
    if (cSim.sweep.node_amp_mm) {
      for (const row of cSim.sweep.node_amp_mm) {
        for (const v of row) maxCand = Math.max(maxCand, v);
      }
    }
    const sharedMax = Math.max(maxOrig, maxCand);
    return { candSim: cSim, sharedMaxAmp: sharedMax };
  }, [ui.viewMode, optimizeResult, activeCandidate, analysis]);

  // Keyboard shortcut: Delete or Backspace removes currently selected component
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (
          activeTag === "input" ||
          activeTag === "textarea" ||
          activeTag === "select"
        ) {
          return;
        }
        const sel = useStore.getState().selection;
        if (sel.type === "component" && sel.id) {
          e.preventDefault();
          useStore.getState().deleteComponent(sel.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <PerfOverlay>
      <div className="flex h-screen flex-col overflow-hidden bg-canvas">
        <Toolbar />
        <KidFriendlyGuide />
        <ToastNotification />
        <ErrorBanner />

        <div className="relative flex min-h-0 flex-1">
          {/* Left: Model Tree Hierarchy */}
          <ModelTree />

          {/* Center column: 3D viewport + bottom diagnostic tabs */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* 3D Viewport Area */}
            <div className="relative min-h-0 flex-1">
              {ui.viewMode === "compare" && optimizeResult ? (
                <div className="flex h-full flex-col">
                  <div className="relative flex flex-1">
                    {/* Left viewport: original design */}
                    <div className="relative flex-1 border-r border-line">
                      <ViewportBadge tone="danger">Original design</ViewportBadge>
                      <ErrorBoundary fallbackTitle="Original Viewport Recovery">
                        <SceneRoot sharedMaxAmp={sharedMaxAmp} />
                      </ErrorBoundary>
                    </div>

                    {/* Right viewport: optimized candidate */}
                    <div className="relative flex-1">
                      <ViewportBadge tone="ok">
                        Optimized candidate #{activeCandidate?.rank ?? 1}
                      </ViewportBadge>
                      <ErrorBoundary fallbackTitle="Optimized Viewport Recovery">
                        <SceneRoot
                          customDesign={
                            activeCandidate?.design ??
                            optimizeResult.candidates[0].design
                          }
                          customAnalysis={candSim}
                          isCompareSecondary={true}
                          sharedMaxAmp={sharedMaxAmp}
                        />
                      </ErrorBoundary>
                    </div>
                  </div>

                  {/* Compare metrics strip */}
                  <div className="border-t border-line bg-surface">
                    <div className="mx-auto max-w-4xl">
                      <ComparePanel />
                    </div>
                  </div>
                </div>
              ) : (
                <ErrorBoundary fallbackTitle="3D Viewport Recovery">
                  <SceneRoot />
                </ErrorBoundary>
              )}

              {(ui.isAnalyzing || ui.isOptimizing) && (
                <LoadingOverlay
                  message={
                    ui.isOptimizing
                      ? "Searching for pad stiffness and damping that reduce shaking…"
                      : "Running the vibration simulation…"
                  }
                />
              )}
            </div>

            {/* Bottom diagnostics / plots / findings tabs */}
            <BottomTabs />
          </div>

          {/* Right dock: inspector and AI assistant */}
          <RightDock />
        </div>

        {/* Dialog modals */}
        <PresetGalleryModal />
        <AddComponentModal />
        <ValidationModal />
      </div>
    </PerfOverlay>
  );
}