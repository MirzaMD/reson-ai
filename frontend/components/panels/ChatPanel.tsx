"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { agentChat, analyze, optimize } from "@/lib/api/client";
import type { AgentMode, AgentOp } from "@/lib/types/contract";
import clsx from "clsx";

const QUICK_PROMPTS = [
  "Why is my camera shaking so much?",
  "Auto-fix the shaking for me",
  "Delete the camera",
  "Make the arms carbon fiber",
];

const MODE_LABELS: Record<AgentMode, string> = {
  build: "Build for me",
  continue: "Continue",
  fix: "Fix",
  explain: "Explain",
};

export default function ChatPanel() {
  const design = useStore((s) => s.design);
  const analysis = useStore((s) => s.analysis);
  const chatMessages = useStore((s) => s.chatMessages);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const setDesign = useStore((s) => s.setDesign);
  const pushHistory = useStore((s) => s.pushHistory);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setOptimizeResult = useStore((s) => s.setOptimizeResult);
  const setActiveCandidate = useStore((s) => s.setActiveCandidate);

  const [input, setInput] = useState("");
  const [lastOps, setLastOps] = useState<AgentOp[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-select agent mode based on context
  useEffect(() => {
    if (!design) setUi({ agentMode: "build" });
    else if (analysis?.findings.some((f) => f.severity === "critical"))
      setUi({ agentMode: "fix" });
    else setUi({ agentMode: "continue" });
  }, [design, analysis, setUi]);

  const send = async (text: string) => {
    if (!text.trim() || ui.isChatting) return;
    const userMsg = { role: "user" as const, content: text.trim() };
    addChatMessage(userMsg);
    setInput("");
    setUi({ isChatting: true, error: null });

    try {
      const fallbackDesign = design ?? {
        name: "Custom Structure",
        plane: "xy",
        nodes: [
          { id: "n1", x: -0.15, y: 0.0 },
          { id: "n2", x: 0.0, y: 0.0 },
          { id: "n3", x: 0.15, y: 0.0 },
        ],
        members: [
          {
            id: "m1",
            n1: "n1",
            n2: "n2",
            material: "aluminium_6061",
            section: { type: "rect", w: 0.016, h: 0.004 },
          },
          {
            id: "m2",
            n1: "n2",
            n2: "n3",
            material: "aluminium_6061",
            section: { type: "rect", w: 0.016, h: 0.004 },
          },
        ],
        supports: [{ node: "n2", type: "spring", kx: 2000, ky: 2000, kr: 0 }],
        components: [],
        analysis: {
          rpm_min: 500,
          rpm_max: 12000,
          n_points: 400,
          beam_zeta: 0.02,
          n_elements_per_member: 20,
        },
      };

      const res = await agentChat({
        mode: ui.agentMode,
        design: fallbackDesign,
        analysis: analysis ?? undefined,
        messages: [...chatMessages, userMsg],
      });

      addChatMessage({ role: "assistant", content: res.assistant_message });

      if (res.ops && res.ops.length > 0) {
        setLastOps(res.ops);
      }

      if (res.design) {
        setDesign(res.design);
        pushHistory(res.design);
      }

      if (res.action === "run_analysis" && res.design) {
        setUi({ isAnalyzing: true });
        try {
          const a = await analyze(res.design);
          setAnalysis(a);
        } finally {
          setUi({ isAnalyzing: false });
        }
      } else if (res.action === "run_optimization" && res.design) {
        setUi({ isOptimizing: true });
        try {
          const opt = await optimize(res.design);
          setOptimizeResult(opt);
          if (opt.candidates.length > 0) {
            setActiveCandidate(opt.candidates[opt.best_index]);
            setUi({ viewMode: "compare" });
          }
        } finally {
          setUi({ isOptimizing: false });
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      addChatMessage({
        role: "assistant",
        content: `Error: ${msg}`,
      });
    } finally {
      setUi({ isChatting: false });
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0f15]">
      {/* Header with Mode Selector */}
      <div className="flex items-center justify-between border-b border-[#21262d] px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-cyan-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b949e]">
            ResonAI Copilot
          </span>
        </div>
        <div className="flex gap-1">
          {(Object.keys(MODE_LABELS) as AgentMode[]).map((m) => (
            <button
              key={m}
              className={clsx(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                ui.agentMode === m
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-[#6e7681] hover:text-[#8b949e]"
              )}
              onClick={() => setUi({ agentMode: m })}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {chatMessages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Describe a structure or request modifications. The AI copilot translates your requests into validated line-body operations and physics checks.
            </p>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6e7681]">
                Quick Starters:
              </span>
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  className="rounded-md border border-[#30363d] bg-[#161b22] px-2.5 py-1.5 text-left text-[11px] text-[#cbd5e1] transition-colors hover:border-cyan-500/50 hover:bg-[#1f2937]"
                  onClick={() => send(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((m, i) => (
          <div
            key={i}
            className={clsx(
              "flex gap-2 animate-fade-in",
              m.role === "user" ? "flex-row-reverse" : ""
            )}
          >
            <div
              className={clsx(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-blue-500/20" : "bg-[#21262d]"
              )}
            >
              {m.role === "user" ? (
                <User size={12} className="text-blue-400" />
              ) : (
                <Bot size={12} className="text-cyan-400" />
              )}
            </div>
            <div
              className={clsx(
                "max-w-[85%] rounded-lg px-3 py-2 text-[12px] leading-relaxed",
                m.role === "user"
                  ? "chat-user text-[#e6edf3]"
                  : "chat-assistant text-[#c9d1d9]"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {/* Collapsible Changes Executed Strip */}
        {lastOps.length > 0 && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 text-[11px]">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-400 mb-1">
              <CheckCircle2 size={13} />
              <span>Operations Executed:</span>
            </div>
            <div className="space-y-1 font-mono text-[10px] text-[#cbd5e1]">
              {lastOps.map((op, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-emerald-500">›</span>
                  <span>{op.op}</span>
                  <span className="text-[#6e7681]">({JSON.stringify(op.args)})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {ui.isChatting && (
          <div className="flex items-center gap-2 text-xs text-[#8b949e]">
            <Loader2 size={13} className="animate-spin text-cyan-400" />
            Generating design operations & verifying physics…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#21262d] p-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question or say 'delete camera'…"
            className="flex-1 text-[13px]"
            disabled={ui.isChatting}
          />
          <button
            type="submit"
            className="btn btn-primary px-3"
            disabled={!input.trim() || ui.isChatting}
          >
            <Send size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
