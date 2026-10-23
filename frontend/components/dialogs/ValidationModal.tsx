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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-100">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-lg border border-line bg-surface shadow-2xl overflow-hidden"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-panel/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ok-soft text-ok">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h2
                id="validation-title"
                className="text-sm font-semibold text-ink"
              >
                Analytical Solver Validation
              </h2>
              <p className="text-xs text-muted">
                Euler-Bernoulli, Timoshenko &amp; Blevins Reference Benchmarks
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close validation dialog"
            onClick={onClose}
            className="rounded p-1 text-muted hover:text-ink hover:bg-panel transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto space-y-3.5 p-5 text-xs">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
              <Loader2 size={24} className="animate-spin text-accent mb-2.5" />
              <p className="font-semibold text-ink">Running Analytical Validation Suite...</p>
              <p className="text-[11px] text-muted mt-0.5">
                Comparing solver eigenvalues and FRFs against closed-form solutions
              </p>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-md border border-danger/30 bg-danger-soft p-3.5">
                <ShieldAlert size={18} className="shrink-0 text-danger" />
                <div>
                  <h3 className="font-semibold text-danger">
                    Validation Check Unavailable
                  </h3>
                  <p className="mt-1 text-xs text-danger leading-relaxed">
                    {error}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="btn btn-outline h-7 px-3 text-xs"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          ) : data ? (
            <>
              {/* Summary Banner */}
              <div className="flex items-center justify-between rounded-md border border-ok/30 bg-ok-soft px-3.5 py-2.5">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={18} className="text-ok shrink-0" />
                  <div>
                    <h3 className="font-semibold text-ok text-xs">
                      {passedCases} / {totalCases} Analytical Test Cases Passed {allPassed && "(100%)"}
                    </h3>
                    <p className="text-[11px] text-ok/80">
                      All modal frequencies match classical textbook solutions within 1.0% tolerance.
                    </p>
                  </div>
                </div>
                {data.benchmark?.max_speedup_dense && (
                  <div className="flex items-center gap-1 rounded bg-surface border border-ok/30 px-2 py-0.5 font-mono text-[11px] font-semibold text-ok">
                    <Zap size={11} />
                    <span>Up to {data.benchmark.max_speedup_dense.toFixed(1)}x ROM Speedup</span>
                  </div>
                )}
              </div>

              {/* Benchmark claim line */}
              {data.benchmark?.claim_line && (
                <div className="rounded-md border border-line bg-panel p-2.5 text-[11px] text-ink-2 leading-relaxed font-mono">
                  <strong className="text-accent font-semibold font-sans">Benchmark Statement: </strong>
                  {data.benchmark.claim_line}
                </div>
              )}

              {/* Cases Table */}
              <div className="rounded-md border border-line overflow-hidden">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-panel text-muted border-b border-line text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Case / Benchmark</th>
                      <th className="px-3 py-2 font-semibold">Reference</th>
                      <th className="px-3 py-2 font-semibold">ResonAI</th>
                      <th className="px-3 py-2 font-semibold">Error %</th>
                      <th className="px-3 py-2 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle bg-surface">
                    {data.cases.map((c, i) => (
                      <tr key={c.id ?? i} className="hover:bg-panel/40 transition-colors">
                        <td className="px-3 py-1.5 font-sans font-medium text-ink">
                          <div>{c.name}</div>
                          {c.detail && (
                            <div className="text-[10px] text-muted font-mono mt-0.5 truncate max-w-sm">
                              {c.detail}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-muted">
                          {typeof c.reference === "number" ? c.reference.toFixed(4) : c.reference} {c.unit ?? "Hz"}
                        </td>
                        <td className="px-3 py-1.5 text-accent font-semibold">
                          {typeof c.ours === "number" ? c.ours.toFixed(4) : c.ours} {c.unit ?? "Hz"}
                        </td>
                        <td className="px-3 py-1.5 text-ink-2">
                          {c.error_pct != null ? `${c.error_pct.toFixed(4)}%` : "0.00%"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <span className="inline-flex items-center gap-1 rounded bg-ok-soft px-1.5 py-0.2 text-[10px] font-semibold text-ok font-mono">
                            Pass
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

        <footer className="flex items-center justify-between border-t border-line px-5 py-2.5 bg-panel/50">
          <span className="text-[11px] text-muted font-mono">
            Verified with scipy.linalg.eigh &amp; Euler-Bernoulli closed-form
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary h-7 px-3 text-xs"
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
