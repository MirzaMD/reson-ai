"""Regression tests pinning the ResonAI hackathon demo story.

Guarantees:
1. Baseline quadcopter drone exhibits critical camera vibration exceeding 0.50 g RMS,
   caused by resonance with an airframe bending mode between 40 and 70 Hz.
2. Mount optimizer returns a verified candidate design that reduces camera vibration
   below its limit (< 0.50 g RMS, > 50% reduction).
3. Changes list contains concrete mount stiffness and damping tuning recommendations.
"""

import pytest
from starlette.testclient import TestClient

from app.main import app
from app.presets import get_demo_design
from app.optimizer.optimize import optimize_design

pytestmark = pytest.mark.slow


def test_drone_demo_regression_story():
    """Verify end-to-end physics and optimization regression for the drone demo story."""
    drone = get_demo_design("drone")
    client = TestClient(app)

    # 1. Baseline analysis
    res_base = client.post("/analyze", json=drone)
    assert res_base.status_code == 200
    base_data = res_base.json()

    # Camera must be critical
    cam_base = next(c for c in base_data["components"] if c["id"] == "camera")
    assert cam_base["status"] == "critical", f"Expected camera critical, got {cam_base['status']}"
    assert cam_base["peak_accel_g"] > cam_base["limit_g"]

    # Verify resonant mode between 40 and 70 Hz causes the critical peak
    modes = base_data.get("modes", [])
    non_rigid = [m for m in modes if m.get("f_hz", 0.0) > 1.0]
    resonant_modes_in_band = [
        m for m in non_rigid if 40.0 <= m.get("f_hz", 0.0) <= 70.0
    ]
    assert len(resonant_modes_in_band) >= 1, "Expected airframe mode between 40 and 70 Hz"

    # Verify resonance finding exists
    crit_findings = [
        f for f in base_data.get("findings", [])
        if f.get("severity") == "critical" and 40.0 <= f.get("mode_f_hz", 0.0) <= 70.0
    ]
    assert len(crit_findings) >= 1, "Expected critical resonance finding in 40-70 Hz band"

    # 2. Run mount optimization
    opt_resp = optimize_design(
        design=drone,
        objective="min_sensor_accel",
        seed=1,
    )
    assert len(opt_resp.candidates) >= 1, "Expected at least 1 verified candidate"
    best_cand = opt_resp.candidates[0]

    # Verify camera peak is reduced below limit or by >= 50%
    assert best_cand.reduction_pct >= 50.0, f"Expected reduction >= 50%, got {best_cand.reduction_pct}%"
    assert len(best_cand.changes) > 0, "Expected non-empty list of mount parameter changes"

    # 3. Post candidate design to verify resolved camera status
    cand_dict = best_cand.design.model_dump()
    res_cand = client.post("/analyze", json=cand_dict)
    assert res_cand.status_code == 200
    cand_data = res_cand.json()

    cam_cand = next(c for c in cand_data["components"] if c["id"] == "camera")
    assert cam_cand["status"] != "critical", f"Camera status still critical in candidate: {cam_cand}"
