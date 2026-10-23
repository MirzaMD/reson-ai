"""Unit and integration tests for Milestone M8 hardening:
- CORS preflight on /analyze, /optimize, /agent/chat
- Request body 1 MB limit (413)
- Global exception handler (500 without traceback)
- Physical & mathematical guard rails (422)
- /optimize concurrent lock (409 busy)
- /analyze and /response_at in-memory LRU caching with X-Cache headers
"""

import copy
import threading
import time
from typing import Any, Dict
import pytest
from starlette.testclient import TestClient

from app.cache import canonical_design_hash
from app.main import _ANALYZE_CACHE, _OPTIMIZE_LOCK, _RESPONSE_AT_CACHE, app
from app.presets import get_demo_design


@pytest.fixture
def client():
    return TestClient(app)


def test_cors_preflight_endpoints(client: TestClient):
    """Browser-style preflight OPTIONS checks for allowed origins."""
    headers = {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    for endpoint in ["/analyze", "/optimize", "/agent/chat"]:
        res = client.options(endpoint, headers=headers)
        assert res.status_code == 200, f"OPTIONS {endpoint} failed: {res.status_code}"
        assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_allowed_origins_127(client: TestClient):
    """Test 127.0.0.1:3000 origin is allowed."""
    headers = {
        "Origin": "http://127.0.0.1:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    res = client.options("/analyze", headers=headers)
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://127.0.0.1:3000"


def test_request_size_limit_1mb(client: TestClient):
    """Payloads exceeding 1 MB return HTTP 413 Payload Too Large."""
    large_payload = "x" * (1024 * 1024 + 100)
    res = client.post(
        "/analyze",
        content=large_payload,
        headers={"Content-Type": "application/json", "Content-Length": str(len(large_payload))},
    )
    assert res.status_code == 413
    data = res.json()
    assert data.get("error") == "payload_too_large"


def test_guard_rails_member_count(client: TestClient):
    """Designs with > 60 members return 422."""
    drone = get_demo_design("drone")
    # Add 62 members
    nodes = [{"id": f"n{i}", "x": float(i) * 0.01, "y": 0.0} for i in range(70)]
    members = [
        {"id": f"m{i}", "n1": f"n{i}", "n2": f"n{i+1}", "material": "cfrp", "section": {"type": "rect", "w": 0.01, "h": 0.01}}
        for i in range(65)
    ]
    design = {
        "name": "TooManyMembers",
        "plane": "xy",
        "nodes": nodes,
        "members": members,
        "supports": [{"node": "n0", "type": "fixed"}],
        "components": [],
    }
    res = client.post("/analyze", json=design)
    assert res.status_code == 422
    assert "exceeds maximum allowed members" in res.json().get("detail", "")


def test_guard_rails_component_count(client: TestClient):
    """Designs with > 25 components return 422."""
    drone = get_demo_design("drone")
    comps = [
        {
            "id": f"c{i}",
            "kind": "generic_mass",
            "member": "m1",
            "s": 0.5,
            "mass": 0.01,
            "mount": {"preset": "rigid", "kv": 1e8, "zeta": 0.01},
        }
        for i in range(26)
    ]
    drone["components"] = comps
    res = client.post("/analyze", json=drone)
    assert res.status_code == 422
    assert "exceeds maximum allowed components" in res.json().get("detail", "")


def test_guard_rails_zero_length_member(client: TestClient):
    """Member connecting identical coordinates returns 422."""
    drone = get_demo_design("drone")
    # Set n2 to equal n1
    for n in drone["nodes"]:
        if n["id"] == "n2":
            n["x"] = -0.15
            n["y"] = 0.0
    res = client.post("/analyze", json=drone)
    assert res.status_code == 422
    assert "zero length" in res.json().get("detail", "")


def test_guard_rails_unsupported_structure(client: TestClient):
    """Structure with no supports returns 422 unstable or under-constrained."""
    drone = get_demo_design("drone")
    drone["supports"] = []
    res = client.post("/analyze", json=drone)
    assert res.status_code == 422
    assert "unstable or under-constrained" in res.json().get("detail", "")


def test_guard_rails_analysis_bounds(client: TestClient):
    """Analysis with rpm_points out of bounds or rpm_max > 60000 returns 422."""
    drone = get_demo_design("drone")
    drone["analysis"] = {"rpm_min": 1000.0, "rpm_max": 70000.0, "rpm_points": 50}
    res = client.post("/analyze", json=drone)
    assert res.status_code == 422
    assert "60000 RPM" in res.json().get("detail", "")

    drone["analysis"] = {"rpm_min": 1000.0, "rpm_max": 10000.0, "rpm_points": 5}
    res = client.post("/analyze", json=drone)
    assert res.status_code == 422
    assert "between 10 and 2000" in res.json().get("detail", "")


def test_optimize_concurrency_lock_409(client: TestClient):
    """Concurrent call to /optimize returns 409 busy."""
    drone = get_demo_design("drone")
    req_body = {
        "design": drone,
        "objective": "min_sensor_accel",
        "seed": 1,
    }

    # Simulate active lock
    with _OPTIMIZE_LOCK:
        res = client.post("/optimize", json=req_body)
        assert res.status_code == 409
        data = res.json()
        assert data.get("error") == "busy"
        assert "an optimisation is already running" in data.get("detail", "")


def test_analyze_lru_caching(client: TestClient):
    """Verify /analyze caching, identical responses, and X-Cache header."""
    _ANALYZE_CACHE.clear()
    drone = get_demo_design("drone")

    # 1. First call -> MISS
    res1 = client.post("/analyze", json=drone)
    assert res1.status_code == 200
    assert res1.headers.get("X-Cache") == "MISS"
    data1 = res1.json()

    # 2. Second identical call -> HIT
    res2 = client.post("/analyze", json=drone)
    assert res2.status_code == 200
    assert res2.headers.get("X-Cache") == "HIT"
    data2 = res2.json()

    # Identical content
    assert data1["modes"] == data2["modes"]
    assert data1["components"] == data2["components"]
    assert "solve_ms" in data2["meta"]


def test_response_at_lru_caching(client: TestClient):
    """Verify /response_at caching, identical responses, and X-Cache header."""
    _RESPONSE_AT_CACHE.clear()
    drone = get_demo_design("drone")
    req_body = {"design": drone, "rpm": 3180.0}

    # 1. First call -> MISS
    res1 = client.post("/response_at", json=req_body)
    assert res1.status_code == 200
    assert res1.headers.get("X-Cache") == "MISS"
    data1 = res1.json()

    # 2. Second call -> HIT
    res2 = client.post("/response_at", json=req_body)
    assert res2.status_code == 200
    assert res2.headers.get("X-Cache") == "HIT"
    data2 = res2.json()

    assert data1 == data2
