"""Demo script running M6 component mount optimization on the drone preset.

Prints:
- Per candidate: changes, camera and IMU peak before/after, reduction %,
  robust worst case, stress ratio, findings after.
- Total solve time, evaluations, and single evaluation cost.
"""

from pathlib import Path
import sys
import time

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.presets import get_demo_design
from app.schemas import LocksModel
from app.optimizer.optimize import optimize_design


def main():
    print("=" * 80)
    print("RESONAI OPTIMIZER DEMO (M6-lite): Drone Payload Vibration Triage")
    print("=" * 80)

    drone = get_demo_design("drone")
    locks = LocksModel(positions=False, mounts=False, damping=False)

    print("Running differential evolution optimization on sensitive mounts...")
    t0 = time.perf_counter()
    resp = optimize_design(
        design=drone,
        locks=locks,
        objective="min_sensor_accel",
        seed=1,
    )
    total_time = (time.perf_counter() - t0) * 1000.0

    print(f"\nExecution Summary:")
    print(f"  Total Solve Time: {resp.solve_ms:.1f} ms ({total_time / 1000.0:.2f} s)")
    print(f"  Total Evaluations: {resp.evaluations}")
    cost_per_eval = resp.solve_ms / max(1, resp.evaluations)
    print(f"  Single Evaluation Cost: {cost_per_eval:.2f} ms")
    print(f"  Optimizer Note: {resp.note}")

    print("\n" + "=" * 80)
    print(f"RETURNED CANDIDATE DESIGNS ({len(resp.candidates)} candidates)")
    print("=" * 80)

    for cand in resp.candidates:
        print(f"\nCandidate {cand.rank}: [{cand.label}]")
        print(f"  Overall Reduction: {cand.reduction_pct:.1f}%")
        print(f"  Robust Worst Case (kv x 0.8 & 1.2): {cand.robust_worst_case_after:.3f} g RMS")
        print(f"  Max Stress Ratio: {cand.metrics_after.max_stress_ratio * 100.0:.1f}%")

        print("  Proposed Changes:")
        for ch in cand.changes:
            print(f"    - {ch.label}")

        print("  Sensor Metrics (Before -> After):")
        for cid in ["camera", "imu"]:
            if cid in cand.metrics_before.components and cid in cand.metrics_after.components:
                mb = cand.metrics_before.components[cid]
                ma = cand.metrics_after.components[cid]
                print(
                    f"    {cid.upper():<7}: {mb.peak_accel_g:.3f} g ({mb.status.upper()}) at {mb.at_rpm:.0f} RPM "
                    f"-> {ma.peak_accel_g:.3f} g ({ma.status.upper()}) at {ma.at_rpm:.0f} RPM (Limit: {ma.limit_g} g)"
                )

        if cand.findings:
            print("  Residual Engineering Findings After Fix:")
            for f in cand.findings:
                # Finding can be dict or Finding model
                sev = f.severity if hasattr(f, "severity") else f.get("severity")
                ftype = f.type if hasattr(f, "type") else f.get("type")
                det = f.detail if hasattr(f, "detail") else f.get("detail")
                print(f"    [{sev.upper():8s}] {ftype}: {det}")
        else:
            print("  No residual engineering findings!")


if __name__ == "__main__":
    main()
