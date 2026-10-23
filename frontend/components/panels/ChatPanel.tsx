"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, ChevronDown, ChevronRight, Check } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { agentChat, analyze, optimize } from "@/lib/api/client";
import clsx from "clsx";

const QUICK_PROMPTS = [
  "Why is camera shaking?",
  "How do I fix the resonance?", 
  "Soften camera mounts",
];

export default function ChatPanel() {
  const design = useStore((s) => s.design);
  const analysis = useStore((s) => s.analysis);
  const chatMessages = useStore((s) => s.chatMessages);
  const isChatting = useStore((s) => s.ui.isChatting);
  const agentMode = useStore((s) => s.ui.agentMode);
  const setUi = useStore((s) => s.setUi);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const setDesign = useStore((s) => s.setDesign);
  const pushHistory = useStore((s) => s.pushHistory);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setOptimizeResult = useStore((s) => s.setOptimizeResult);
  const setActiveCandidate = useStore((s) => s.setActiveCandidate);

  const [input, setInput] = useState("");
  const [lastDescriptions, setLastDescriptions] = useState<string[]>([]);
  const [lastSource, setLastSource] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatting]);

  const send = async (text: string) => {
    if (!text.trim() || isChatting) return;
    const userMsg = { role: "user" as const, content: text.trim() };
    addChatMessage(userMsg);
    setInput("");
    setUi({ isChatting: true, error: null });

    try {
      const activeDesign = design ?? {
        name: "Custom Structure",
        plane: "xy" as const,
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
            material: "cfrp" as const,
            section: { type: "rect" as const, w: 0.016, h: 0.004 },
          },
          {
            id: "m2",
            n1: "n2",
            n2: "n3",
            material: "cfrp" as const,
            section: { type: "rect" as const, w: 0.016, h: 0.004 },
          },
        ],
        supports: [{ node: "n2", type: "spring" as const, kx: 2000, ky: 2000, kr: 0 }],
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
        mode: agentMode,
        design: activeDesign,
        analysis: analysis ? ({ findings: analysis.findings } as typeof analysis) : undefined,
        messages: [...chatMessages, userMsg],
      });

      addChatMessage({ role: "assistant", content: res.assistant_message });
      setLastSource(res.source ?? null);

      const descriptions =
        res.op_descriptions && res.op_descriptions.length > 0
          ? res.op_descriptions
          : res.ops?.map((op) => `${op.op} (${JSON.stringify(op.args)})`) ?? [];

      if (descriptions.length > 0) {
        setLastDescriptions(descriptions);
        setChangesOpen(true);
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
            setActiveCandidate(opt.candidates[opt.best_index] ?? opt.candidates[0]);
            setUi({ viewMode: "compare" });
          }
        } finally {
          setUi({ isOptimizing: false });
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Request failed";
      addChatMessage({
        role: "assistant",
        content: `Error: ${msg}`,
      });
    } finally {
      setUi({ isChatting: false });
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      {/* Messages Scroll Area */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {chatMessages.length === 0 ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Sparkles size={14} />
              </div>
              <span className="text-xs font-semibold text-ink">Engineering Copilot</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Ask questions about resonance findings or request model changes. The copilot executes validated structural modifications.
            </p>

            {/* 3 Quick-Prompt Chips */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-ink-2 uppercase tracking-wider">
                Quick Prompts:
              </div>
              <div className="flex flex-col gap-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => send(prompt)}
                    className="rounded border border-line bg-panel px-2.5 py-1.5 text-left text-xs text-ink-2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent font-medium"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          chatMessages.map((m, i) => (
            <div
              key={i}
              className={clsx(
                "flex gap-2 items-start",
                m.role === "user" ? "flex-row-reverse" : ""
              )}
            >
              <div
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5 text-xs font-semibold",
                  m.role === "user"
                    ? "bg-accent-soft text-accent"
                    : "bg-panel text-ink-2 border border-line"
                )}
              >
                {m.role === "user" ? <User size={12} /> : <Bot size={12} />}
              </div>
              <div
                className={clsx(
                  "max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed shadow-2xs",
                  m.role === "user"
                    ? "chat-user"
                    : "chat-assistant"
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}

        {/* Changes Made Collapsible List */}
        {lastDescriptions.length > 0 && (
          <div className="rounded-md border border-line bg-panel/60 overflow-hidden text-xs">
            <button
              type="button"
              className="flex w-full items-center justify-between p-2 font-medium text-ink-2 hover:bg-panel transition-colors"
              onClick={() => setChangesOpen(!changesOpen)}
            >
              <div className="flex items-center gap-1.5">
                {changesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Check size={13} className="text-ok stroke-[2.5]" />
                <span className="font-semibold text-ink">Changes made ({lastDescriptions.length})</span>
              </div>
            </button>
            {changesOpen && (
              <div className="p-2 pt-0 space-y-1 border-t border-line-subtle bg-surface">
                {lastDescriptions.map((desc, idx) => (
                  <div key={idx} className="font-mono text-[11px] text-ink-2 flex items-center gap-1.5">
                    <span className="text-ok">›</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Offline Fallback Badge */}
        {lastSource === "fallback" && (
          <div className="flex items-center justify-center pt-1">
            <span className="rounded bg-panel border border-line-subtle px-2 py-0.5 text-[10px] text-muted font-mono">
              AI unavailable, offline rules used
            </span>
          </div>
        )}

        {isChatting && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 size={13} className="animate-spin text-accent" />
            <span>Analyzing structure & verifying operations...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Fixed at Bottom */}
      <div className="border-t border-line p-2.5 bg-surface">
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
            placeholder="Ask question or describe change..."
            className="flex-1 text-xs"
            disabled={isChatting}
          />
          <button
            type="submit"
            className="btn btn-primary h-8 px-3 text-xs"
            disabled={!input.trim() || isChatting}
            title="Send request"
            aria-label="Send"
          >
            <Send size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
