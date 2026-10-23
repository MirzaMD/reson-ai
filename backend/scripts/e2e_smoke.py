"""End-to-End smoke script verifying the complete demo workflow.

Supports both in-process FastAPI TestClient and remote live URL (via --url http://127.0.0.1:8000).

Execution flow:
1. GET /health
2. GET /presets
3. GET /presets/drone/design
4. POST /analyze (asserts critical limit_exceeded finding for camera)
5. POST /response_at at peak camera RPM
6. POST /optimize (asserts verified candidate with >= 50% vibration reduction)
7. POST /analyze on candidate design (asserts camera status is not critical)
8. POST /agent/chat in build mode using offline fallback
9. GET /validate (asserts summary passed == total)

Prints a formatted execution table: step | status | ms.
"""

import argparse
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Tuple

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import httpx
from starlette.testclient import TestClient
from app.main import app


class ClientAdapter:
    """Unified client wrapper supporting either TestClient or live httpx URL."""

    def __init__(self, base_url: str = None):
        self.base_url = base_url.rstrip("/") if base_url else None
        self.test_client = TestClient(app) if not self.base_url else None

    def get(self, endpoint: str):
        if self.test_client:
            return self.test_client.get(endpoint)
        with httpx.Client(timeout=60.0) as client:
            return client.get(f"{self.base_url}{endpoint}")

    def post(self, endpoint: str, json: Any = None):
        if self.test_client:
            return self.test_client.post(endpoint, json=json)
        with httpx.Client(timeout=60.0) as client:
            return client.post(f"{self.base_url}{endpoint}", json=json)


def run_e2e_smoke(base_url: str = None) -> List[Tuple[str, str, float]]:
    client = ClientAdapter(base_url)
    results = []

    def record_step(name: str, fn):
        t0 = time.perf_counter()
        status = "OK"
        try:
            res = fn()
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            if hasattr(res, "status_code") and res.status_code >= 400:
                status = f"HTTP {res.status_code}"
            return res, status, elapsed_ms
        except Exception as e:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            return None, f"FAIL: {str(e)[:30]}", elapsed_ms

    # 1. Health
    res, status, ms = record_step("1. GET /health", lambda: client.get("/health"))
    assert res.status_code == 200, f"Health check failed: {res.text}"
    results.append(("1. GET /health", status, ms))

    # 2. Presets
    res, status, ms = record_step("2. GET /presets", lambda: client.get("/presets"))
    assert res.status_code == 200
    results.append(("2. GET /presets", status, ms))

    # 3. Drone design
    res, status, ms = record_step("3. GET /presets/drone/design", lambda: client.get("/presets/drone/design"))
    assert res.status_code == 200
    drone_design = res.json()
    results.append(("3. GET /presets/drone/design", status, ms))

    # 4. Analyze baseline drone
    res, status, ms = record_step("4. POST /analyze (baseline drone)", lambda: client.post("/analyze", json=drone_design))
    assert res.status_code == 200
    analyze_data = res.json()
    # Assert critical camera limit_exceeded finding
    camera_findings = [
        f for f in analyze_data.get("findings", [])
        if f.get("type") == "limit_exceeded" and "camera" in f.get("component", "") and f.get("severity") == "critical"
    ]
    assert len(camera_findings) >= 1, "Expected critical limit_exceeded finding for camera"
    peak_camera_rpm = float(camera_findings[0].get("rpm", 3178.0))
    results.append(("4. POST /analyze (baseline drone)", status, ms))

    # 5. Response at peak camera RPM
    res, status, ms = record_step(
        f"5. POST /response_at ({peak_camera_rpm:.0f} RPM)",
        lambda: client.post("/response_at", json={"design": drone_design, "rpm": peak_camera_rpm}),
    )
    assert res.status_code == 200
    results.append((f"5. POST /response_at ({peak_camera_rpm:.0f} RPM)", status, ms))

    # 6. Optimize drone mounts
    opt_req = {
        "design": drone_design,
        "objective": "min_sensor_accel",
        "budget": {"max_evals": 600},
        "seed": 1,
    }
    res, status, ms = record_step("6. POST /optimize", lambda: client.post("/optimize", json=opt_req))
    assert res.status_code == 200
    opt_data = res.json()
    assert len(opt_data.get("candidates", [])) >= 1, "Expected at least 1 verified candidate"
    best_cand = opt_data["candidates"][0]
    reduction = best_cand.get("reduction_pct", 0.0)
    assert reduction >= 50.0, f"Expected reduction >= 50%, got {reduction}%"
    candidate_design = best_cand["design"]
    results.append(("6. POST /optimize", status, ms))

    # 7. Analyze candidate design
    res, status, ms = record_step("7. POST /analyze (candidate design)", lambda: client.post("/analyze", json=candidate_design))
    assert res.status_code == 200
    cand_analyze = res.json()
    # Assert camera is not critical
    camera_summary = next((c for c in cand_analyze.get("components", []) if c.get("id") == "camera"), {})
    assert camera_summary.get("status") != "critical", f"Camera status still critical: {camera_summary}"
    results.append(("7. POST /analyze (candidate design)", status, ms))

    # 8. Agent chat in build mode
    build_req = {
        "mode": "build",
        "design": {},
        "messages": [{"role": "user", "content": "Quadcopter with 4 aluminium arms and a camera on the center body"}],
    }
    res, status, ms = record_step("8. POST /agent/chat (build mode)", lambda: client.post("/agent/chat", json=build_req))
    assert res.status_code == 200
    agent_data = res.json()
    assert len(agent_data.get("ops", [])) >= 1 or agent_data.get("assistant_message"), "Agent returned empty response"
    results.append(("8. POST /agent/chat (build mode)", status, ms))

    # 9. Validation suite
    res, status, ms = record_step("9. GET /validate", lambda: client.get("/validate"))
    assert res.status_code == 200
    val_data = res.json()
    summary = val_data.get("summary", {})
    assert summary.get("passed") == summary.get("total"), f"Validation cases failed: {summary}"
    results.append(("9. GET /validate", status, ms))

    # Print summary table
    print("\n" + "=" * 65)
    print(f"{'Step':<40} | {'Status':<8} | {'Duration (ms)':>10}")
    print("-" * 65)
    for step_name, st, dur in results:
        print(f"{step_name:<40} | {st:<8} | {dur:>10.1f}")
    print("=" * 65)

    return results


def main():
    parser = argparse.ArgumentParser(description="Run ResonAI E2E smoke tests.")
    parser.add_argument("--url", type=str, default=None, help="Remote server URL (e.g. http://127.0.0.1:8000)")
    args = parser.parse_args()

    mode_str = f"Live server: {args.url}" if args.url else "In-process TestClient"
    print(f"Running ResonAI E2E Smoke Tests ({mode_str})...")
    run_e2e_smoke(args.url)
    print("\nAll E2E smoke checks passed successfully.")


if __name__ == "__main__":
    main()
