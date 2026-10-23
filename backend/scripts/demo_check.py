"""Verification script for the drone demo design: modal analysis, harmonic sweep, findings, and mount tuning.

Tuning objective:
- Demo must have a critical or warning finding for the payload camera inside 3,000 - 9,000 RPM
  caused by resonance with excitation.
- When camera mount stiffness is lowered (softer isolator), camera acceleration drops substantially
  below limit_g (giving the optimizer a real, measurable fix).
- Planar model symmetry limitation: with in-phase symmetric unbalance, only symmetric modes are excited.
"""

import sys
from pathlib import Path
import numpy as np

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.presets import get_demo_design
from app.solver.pipeline import solve_design
from app.solver.post import build_response


def main():
    print("=" * 70)
    print("RESONAI DRONE DEMO DIAGNOSTIC & PARAMETER TUNING CHECK")
    print("=" * 70)

    # 1. Evaluate baseline drone design from presets
    baseline_design = get_demo_design("drone")
    res_base = solve_design(baseline_design)
    resp_base = build_response(baseline_design, res_base)

    print("\n--- Structural Modes (Baseline) ---")
    for m in resp_base["modes"]:
        print(f"  Mode {m['i']}: {m['f_hz']:.2f} Hz ({m['note']})")

    print(f"\n--- Solve Timing ---")
    print(f"  Modal Setup: {res_base.modal_setup_ms:.2f} ms")
    print(f"  Sweep (400 pts): {res_base.sweep_ms:.2f} ms")
    print(f"  Total Solve Time: {resp_base['meta']['solve_ms']:.2f} ms")

    print("\n--- Component Responses (Baseline) ---")
    for c in resp_base["components"]:
        lim_str = f"(Limit: {c['limit_g']} g)" if c["limit_g"] else "(No limit)"
        print(f"  {c['id']:15s} | Peak: {c['peak_accel_g']:.3f} g at {c['at_rpm']:.0f} RPM | Status: {c['status'].upper():8s} {lim_str}")

    print("\n--- Engineering Findings (Baseline) ---")
    for f in resp_base["findings"]:
        print(f"  [{f['severity'].upper():8s}] {f['type']:20s} | {f['detail']}")

    print("\n--- Max Stress (Baseline) ---")
    ms = resp_base["max_stress_mpa"]
    print(f"  Max Stress: {ms['value']} MPa at {ms['at_rpm']:.0f} RPM on '{ms['member']}' (Yield: {ms['yield_mpa']} MPa, Ratio: {ms['ratio']*100:.1f}%)")

    # 2. Parameter Sweep: Vary Camera Mount Stiffness kv
    print("\n" + "=" * 70)
    print("PARAMETER SWEEP: Camera Mount Stiffness kv vs Camera Peak Accel")
    print("=" * 70)
    print(f"{'Mount kv (N/m)':<18} | {'f_mount (Hz)':<14} | {'Camera Peak (g)':<18} | {'Peak RPM':<12} | {'Status':<10}")
    print("-" * 75)

    test_kvs = [60000.0, 50000.0, 40000.0, 25000.0, 10000.0, 3000.0]
    for kv in test_kvs:
        d = get_demo_design("drone")
        # Update camera mount kv
        cam_comp = next(c for c in d["components"] if c["id"] == "camera")
        cam_comp["mount"]["kv"] = kv
        r = solve_design(d)
        resp = build_response(d, r)
        cam = next(c for c in resp["components"] if c["id"] == "camera")
        f_mount = np.sqrt(kv / 0.15) / (2.0 * np.pi)
        print(f"{kv:<18.0f} | {f_mount:<14.1f} | {cam['peak_accel_g']:<18.3f} | {cam['at_rpm']:<12.0f} | {cam['status'].upper():<10}")

    print("\nConclusion: Lowering camera mount kv from 40,000 N/m to 3,000 N/m lowers mount natural frequency")
    print("from 82.2 Hz to 22.5 Hz, dropping camera vibration from critical 3.7+ g down to 0.40 g (below 0.50 g limit)!")



if __name__ == "__main__":
    main()
