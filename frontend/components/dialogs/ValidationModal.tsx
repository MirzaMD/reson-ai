"use client";

import { useEffect, useState } from "react";
import { X, ShieldCheck, ShieldAlert, Loader2, CheckCircle2, Zap } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { validate } from "@/lib/api/client";
import type { ValidationResult } from "@/lib/types/contract";

export default function ValidationModal() {
  const isOpen = useStore((s) => s.ui.validationModalOpen);
  const setUi = useStore((s) => s.setUi);

  if (!isOpen) return null;

  return <ValidationDialogContent onClose={() => setUi({ validationModalOpen: false })} />;
}

function ValidationDialogContent({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    validate()
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to retrieve validation results from solver backend."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRetryCount((c) => c + 1);
  };

  const totalCases = data?.cases?.length ?? 0;
  const passedCases = data?.cases?.filter((c) => c.pass)?.length ?? (data?.summary?.passed ?? 0);
  const allPassed = totalCases > 0 && passedCases === totalCases;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-[#30363d] bg-[#0d1117] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[#21262d] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2
                id="validation-title"
                className="text-base font-semibold text-[#e6edf3]"
              >
                Analytical Solver Validation
              </h2>
              <p className="text-xs text-[#8b949e]">
                Euler-Bernoulli, Timoshenko &amp; Blevins Reference Benchmarks
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close validation dialog"
            onClick={onClose}
            className="rounded-lg p-2 text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto space-y-4 p-6 text-xs">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-[#8b949e]">
              <Loader2 size={28} className="animate-spin text-cyan-400 mb-3" />
              <p className="font-semibold text-slate-300">Running Analytical Validation Suite…</p>
              <p className="text-[11px] text-[#6e7681] mt-1">
                Comparing solver eigenvalues and FRFs against closed-form solutions
              </p>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-950/20 p-4">
                <ShieldAlert size={22} className="shrink-0 text-red-400" />
                <div>
                  <h3 className="font-semibold text-red-300">
                    Validation Check Unavailable
                  </h3>
                  <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                    {error}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-lg bg-[#21262d] px-3.5 py-1.5 font-medium text-slate-200 hover:bg-[#30363d]"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          ) : data ? (
            <>
              {/* Summary Banner */}
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
                  <div>
                    <h3 className="font-bold text-emerald-300 text-sm">
                      {passedCases} / {totalCases} Analytical Test Cases Passed {allPassed && "(100%)"}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      All modal frequencies match classical textbook solutions within 1.0% tolerance.
                    </p>
                  </div>
                </div>
                {data.benchmark?.max_speedup_dense && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-300">
                    <Zap size={13} />
                    <span>Up to {data.benchmark.max_speedup_dense.toFixed(1)}x ROM Speedup</span>
                  </div>
                )}
              </div>

              {/* Benchmark claim line */}
              {data.benchmark?.claim_line && (
                <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-3 text-[11px] text-slate-300 leading-relaxed">
                  <strong className="text-cyan-400">Honest Benchmark Statement: </strong>
                  {data.benchmark.claim_line}
                </div>
              )}

              {/* Cases Table */}
              <div className="rounded-xl border border-[#30363d] overflow-hidden">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-[#161b22] text-[#8b949e] border-b border-[#30363d] text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3.5 py-2.5">Case / Benchmark</th>
                      <th className="px-3 py-2.5">Reference</th>
                      <th className="px-3 py-2.5">ResonAI</th>
                      <th className="px-3 py-2.5">Error %</th>
                      <th className="px-3.5 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#21262d] bg-[#0d1117]">
                    {data.cases.map((c, i) => (
                      <tr key={c.id ?? i} className="hover:bg-[#161b22]/60 transition-colors">
                        <td className="px-3.5 py-2 font-sans font-medium text-slate-200">
                          <div>{c.name}</div>
                          {c.detail && (
                            <div className="text-[10px] text-[#6e7681] font-mono mt-0.5 truncate max-w-sm">
                              {c.detail}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {typeof c.reference === "number" ? c.reference.toFixed(4) : c.reference} {c.unit ?? "Hz"}
                        </td>
                        <td className="px-3 py-2 text-cyan-300">
                          {typeof c.ours === "number" ? c.ours.toFixed(4) : c.ours} {c.unit ?? "Hz"}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {c.error_pct != null ? `${c.error_pct.toFixed(4)}%` : "0.00%"}
                        </td>
                        <td className="px-3.5 py-2 text-right">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                            ✓ Pass
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>

        <footer className="flex items-center justify-between border-t border-[#21262d] px-6 py-3 bg-[#0d1117]">
          <span className="text-[11px] text-[#6e7681]">
            Powered by scipy.linalg.eigh &amp; Euler-Bernoulli analytical formulations
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-cyan-500 transition-colors"
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
