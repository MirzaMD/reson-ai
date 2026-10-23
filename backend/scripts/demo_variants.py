"""Evaluate drone structural demo variants across materials and operating bands.

Prints detailed modal, vibration triage, and optimization comparisons for:
(a) CFRP arms (baseline)
(b) Aluminium 6061 arms
(c) Aluminium 6061 arms with motor rpm_max 9000
"""

import copy
from pathlib import Path
import sys
import time

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.presets import get_demo_design
from app.optimizer.optimize import optimize_design
from app.solver.pipeline import solve_design
from app.solver.post import build_response


def analyze_variant(label: str, design: dict):
    print("=" * 80)
    print(f"VARIANT: {label}")
    print("=" * 80)

    # 1. Pipeline analysis
    sol = solve_design(design, method="rom")
    resp = build_response(design, sol)

    # Lowest non-rigid modes
    non_rigid = [m for m in resp["modes"] if m["f_hz"] > 1.0][:5]
    print("\n--- Lowest Non-Rigid Modes ---")
    for idx, m in enumerate(non_rigid):
        m_idx = m.get("i", idx + 1)
        m_label = m.get("note", f"Mode {m_idx}")
        print(f"  Mode {m_idx}: {m['f_hz']:.2f} Hz ({m_label})")

    # Findings
    print("\n--- Simulation Findings ---")
    for f in resp["findings"]:
        rpm_str = f"at {f['rpm']:.0f} RPM" if f.get("rpm") else "mount freq"
        print(f"  [{f['severity'].upper():<8}] {f['type']:<20} | {f['component']:<24} {rpm_str:<16} | {f['detail']}")

    # Camera performance
    cam = next((c for c in resp["components"] if c["id"] == "camera"), None)
    if cam:
        print(f"\n--- Camera Vibration Metric ---")
        print(f"  Peak Accel : {cam['peak_accel_g']:.3f} g RMS at {cam['at_rpm']:.0f} RPM (Limit: {cam['limit_g']:.2f} g RMS)")
        print(f"  Status     : {cam['status'].upper()}")

    # 2. Optimization
    print("\n--- Mount Optimization ---")
    t0 = time.perf_counter()
    opt = optimize_design(design, objective="min_sensor_accel", seed=1)
    dur = (time.perf_counter() - t0) * 1000.0

    if opt.candidates:
        best = opt.candidates[0]
        print(f"  Best Candidate : {best.label} (Verified Reduction: {best.reduction_pct:.2f}%, Elapsed: {dur:.1f} ms)")
        print(f"  Recommended Changes:")
        for ch in best.changes:
            print(f"    - {ch.label}")
        cand_cam_after = best.metrics_after.components.get("camera")
        if cand_cam_after:
            cand_peak = cand_cam_after.peak_accel_g
            cand_status = cand_cam_after.status.upper()
            print(f"  Camera Accel After: {cand_peak:.3f} g RMS (Status: {cand_status})")
    else:
        print(f"  No candidates found: {opt.note}")

    print("\n")


def main():
    drone_cfrp = get_demo_design("drone")

    # Variant (b): Aluminium arms
    drone_al = copy.deepcopy(drone_cfrp)
    drone_al["name"] = "Drone_Aluminium_Arms"
    for m in drone_al["members"]:
        m["material"] = "aluminium_6061"

    # Variant (c): Aluminium arms with rpm_max 9000
    drone_al_9000 = copy.deepcopy(drone_al)
    drone_al_9000["name"] = "Drone_Aluminium_9000RPM"
    drone_al_9000["analysis"]["rpm_max"] = 9000.0
    for comp in drone_al_9000["components"]:
        if comp.get("excitation") and comp["excitation"].get("rpm_max"):
            comp["excitation"]["rpm_max"] = 9000.0

    analyze_variant("(a) CFRP Arms (Baseline)", drone_cfrp)
    analyze_variant("(b) Aluminium 6061 Arms", drone_al)
    analyze_variant("(c) Aluminium 6061 Arms (rpm_max = 9000)", drone_al_9000)


if __name__ == "__main__":
    main()
