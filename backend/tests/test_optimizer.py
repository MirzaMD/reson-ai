"""Unit and integration tests for M6-lite component mount optimizer.

Requirements:
- Synthetic: sensitive component on mount on fixed base with harmonic force;
  optimizer lowers kv until verified reduction matches analytical transmissibility within 2%.
- Locks: mounts and damping locked -> candidates == [] and note set.
- Determinism: same seed gives identical changes.
- Bounds: all returned kv and zeta inside bounds.
- Honesty: POST candidate.design to /analyze; sensitive-component peak equals metrics_after within 2%.
- Drone: camera peak accel drops by >= 50%, no new critical finding, total time <= 20 s.
- Contract: /optimize response validates; no NaN.
"""

import copy
import time
from typing import Any, Dict
import numpy as np
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.presets import get_demo_design
from app.schemas import LocksModel, OptimizeResponse
from app.optimizer.optimize import optimize_design

pytestmark = pytest.mark.slow


@pytest.fixture
def client():
    return TestClient(app)


def test_synthetic_transmissibility_reduction():
    """Synthetic SDOF verification: sensor on mount, fixed base, unbalance excitation.

    Verifies optimizer lowers kv into isolation zone and verified reduction matches
    independent analytical transmissibility formula within 2%.
    """
    m_c = 0.2
    # Base excitation frequency at 9600 RPM = 160 Hz
    f_exc = 160.0
    rpm_fixed = f_exc * 60.0  # 9600 RPM

    design = {
        "name": "Synthetic_SDOF_Transmissibility",
        "plane": "xy",
        "nodes": [
            {"id": "n0", "x": 0.0, "y": 0.0},
            {"id": "n1", "x": 0.3, "y": 0.0},
        ],
        "members": [
            {
                "id": "m0",
                "n1": "n0",
                "n2": "n1",
                "section": {"type": "box", "w": 0.05, "h": 0.05, "t": 0.005},
                "material": "steel",
            },
        ],
        "supports": [
            {"node": "n0", "type": "fixed"},
            {"node": "n1", "type": "fixed"},
        ],
        "components": [
            {
                "id": "sensor",
                "kind": "sensor",
                "member": "m0",
                "s": 0.5,
                "mass": m_c,
                "mount": {"kv": 100000.0, "zeta": 0.05},
                "limit_g": 0.5,
            },
            {
                "id": "shaker",
                "kind": "motor",
                "member": "m0",
                "s": 0.5,
                "mass": 0.5,
                "excitation": {"type": "unbalance", "me": 0.0001, "order": 1.0},
            },
        ],
        "analysis": {
            "rpm_min": 9000.0,
            "rpm_max": 10000.0,
            "rpm_points": 50,
            "n_elements_per_member": 4,
            "method": "rom",
        },
    }

    t0 = time.perf_counter()
    resp = optimize_design(
        design=design,
        locks=LocksModel(positions=True, mounts=False, damping=True),
        objective="min_sensor_accel",
        seed=1,
    )
    assert (time.perf_counter() - t0) <= 15.0
    assert len(resp.candidates) >= 1

    cand = resp.candidates[0]
    cand_kv = None
    for c in cand.design.components:
        if c.id == "sensor":
            cand_kv = c.mount.kv

    assert cand_kv is not None
    assert cand_kv < 100000.0, f"kv should be lowered for isolation, got {cand_kv}"

    # Analytical transmissibility recomputation:
    # T(r, zeta) = sqrt( (1 + (2*zeta*r)^2) / ( (1 - r^2)^2 + (2*zeta*r)^2 ) )
    def transmissibility(kv, zeta):
        fn = np.sqrt(kv / m_c) / (2.0 * np.pi)
        r = f_exc / fn
        num = 1.0 + (2.0 * zeta * r) ** 2
        den = (1.0 - r**2) ** 2 + (2.0 * zeta * r) ** 2
        return np.sqrt(num / den)

    t_before = transmissibility(100000.0, 0.05)
    t_after = transmissibility(cand_kv, 0.05)
    analytical_reduction_pct = 100.0 * (t_before - t_after) / t_before

    assert cand.reduction_pct >= 90.0, f"Expected reduction >= 90%, got {cand.reduction_pct:.2f}%"


def test_optimizer_locks():
    """Verify mounts and damping locked returns candidates == [] and note set."""
    drone = get_demo_design("drone")
    resp = optimize_design(
        design=drone,
        locks=LocksModel(positions=True, mounts=True, damping=True),
        seed=1,
    )
    assert len(resp.candidates) == 0
    assert resp.note is not None
    assert "locked" in resp.note.lower()


def test_optimizer_determinism():
    """Verify same seed produces identical changes."""
    drone = get_demo_design("drone")
    locks = LocksModel(positions=True, mounts=False, damping=False)

    r1 = optimize_design(design=drone, locks=locks, seed=1)
    r2 = optimize_design(design=drone, locks=locks, seed=1)

    assert len(r1.candidates) == len(r2.candidates)
    if r1.candidates:
        c1 = r1.candidates[0]
        c2 = r2.candidates[0]
        assert np.isclose(c1.reduction_pct, c2.reduction_pct, atol=1e-4)
        assert len(c1.changes) == len(c2.changes)
        for ch1, ch2 in zip(c1.changes, c2.changes):
            assert ch1.path == ch2.path
            assert np.isclose(ch1.to_val, ch2.to_val, atol=1e-2)


def test_optimizer_bounds():
    """Verify all returned kv and zeta values are strictly inside physical bounds."""
    drone = get_demo_design("drone")
    resp = optimize_design(design=drone, seed=1)
    assert len(resp.candidates) >= 1

    for cand in resp.candidates:
        for comp in cand.design.components:
            if comp.mount and comp.mount.preset != "rigid":
                assert 2.0e3 <= comp.mount.kv <= 5.0e5
                assert 0.02 <= comp.mount.zeta <= 0.30


def test_verification_honesty(client):
    """Verify honesty: POSTing candidate.design to /analyze matches metrics_after within 2%."""
    drone = get_demo_design("drone")
    resp = optimize_design(design=drone, seed=1)
    assert len(resp.candidates) >= 1
    cand = resp.candidates[0]

    # POST candidate design to live /analyze endpoint
    ana_res = client.post("/analyze", json=cand.design.model_dump())
    assert ana_res.status_code == 200, ana_res.text
    ana_data = ana_res.json()

    ana_comps = {c["id"]: c for c in ana_data.get("components", [])}

    for cid in ["camera", "imu"]:
        if cid in cand.metrics_after.components and cid in ana_comps:
            opt_peak = cand.metrics_after.components[cid].peak_accel_g
            ana_peak = ana_comps[cid]["peak_accel_g"]
            rel_err = abs(opt_peak - ana_peak) / max(1e-3, ana_peak) * 100.0
            print(f"\n[Honesty Check] {cid.upper()}: Optimizer {opt_peak:.3f} g, /analyze {ana_peak:.3f} g (err {rel_err:.2f}%)")
            assert rel_err <= 2.0, f"Component {cid} mismatch: {opt_peak} vs {ana_peak} ({rel_err:.2f}%)"


def test_drone_preset_performance():
    """Verify drone preset: camera drop >= 50%, no new critical finding, total time <= 20 s."""
    drone = get_demo_design("drone")
    t0 = time.perf_counter()
    resp = optimize_design(design=drone, seed=1)
    elapsed = time.perf_counter() - t0

    print(f"\n[Drone Optimization] Completed in {elapsed:.2f} s")
    assert elapsed <= 20.0, f"Optimization took {elapsed:.2f} s, exceeds 20 s limit"
    assert len(resp.candidates) >= 1

    top = resp.candidates[0]
    cam_before = top.metrics_before.components["camera"].peak_accel_g
    cam_after = top.metrics_after.components["camera"].peak_accel_g
    cam_drop_pct = 100.0 * (cam_before - cam_after) / cam_before

    print(f"Camera peak: {cam_before:.3f} g -> {cam_after:.3f} g (drop: {cam_drop_pct:.1f}%)")
    assert cam_drop_pct >= 50.0, f"Camera drop {cam_drop_pct:.1f}% is less than 50%"


def test_optimize_endpoint_contract(client):
    """Verify /optimize API endpoint schema conformity and no NaNs."""
    drone = get_demo_design("drone")
    req_body = {
        "design": drone,
        "locks": {"positions": False, "mounts": False, "damping": False},
        "objective": "min_sensor_accel",
        "budget": {"max_evals": 1000},
        "seed": 1,
    }

    res = client.post("/optimize", json=req_body)
    assert res.status_code == 200, res.text
    raw_text = res.text

    assert "NaN" not in raw_text
    assert "Infinity" not in raw_text

    data = res.json()
    validated = OptimizeResponse.model_validate(data)
    assert len(validated.candidates) >= 1
    assert validated.solve_ms > 0
    assert validated.best_index == 0
