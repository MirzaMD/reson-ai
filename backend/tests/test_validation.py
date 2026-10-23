"""Test validation suite runner, /validate API endpoint, caching, and report generation (Milestone M5).

Requirements:
- All cases pass
- Case count >= 12 (covers V1-V11)
- Zero NaN / Inf
- /validate summary: passed == total
- Mesh convergence flag (V6) is True
- Second /validate call served from in-memory cache (substantially faster)
- validation_report.md generated and contains no 'TODO'
- Prints the formatted slide table
"""

import json
from pathlib import Path
import time
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.validation.suite import run_mesh_convergence, run_validation
from scripts.make_validation_report import generate_validation_report


@pytest.fixture
def client():
    return TestClient(app)


def test_validation_suite_live_cases():
    """Verify that all live validation cases pass within specified engineering tolerances."""
    res = run_validation()
    cases = res["cases"]
    summary = res["summary"]

    assert len(cases) >= 12, f"Expected at least 12 cases, got {len(cases)}"
    assert summary["passed"] == summary["total"], f"Validation failure: {summary['passed']}/{summary['total']} passed"
    assert res["mesh_convergence_pass"] is True, "Mesh convergence check failed"

    # Verify no NaN or Inf in cases
    raw_json = json.dumps(res)
    assert "NaN" not in raw_json
    assert "Infinity" not in raw_json


def test_mesh_convergence_v6():
    """Verify V6 mesh convergence: error non-increasing and < 1% at 20 elements."""
    table, conv_pass = run_mesh_convergence()
    assert conv_pass is True
    assert len(table) > 0

    # Verify at 20 elements, error is strictly < 1% for all modes and structures
    twenty_el_rows = [r for r in table if r["elements"] == 20]
    for r in twenty_el_rows:
        assert r["error_pct"] < 1.0, f"Error at 20 elements {r['error_pct']}% exceeds 1% for {r}"


def test_validate_api_endpoint_and_cache(client: TestClient):
    """Verify GET and POST /validate, response structure, and caching speedup."""
    # 1. Force refresh on first call
    t0 = time.perf_counter()
    resp1 = client.get("/validate?refresh=true")
    t1 = time.perf_counter()
    dur_live_ms = (t1 - t0) * 1000.0

    assert resp1.status_code == 200
    data1 = resp1.json()

    assert "cases" in data1
    assert "summary" in data1
    assert "benchmark_live" in data1
    assert "environment" in data1
    assert data1["summary"]["passed"] == data1["summary"]["total"]
    assert dur_live_ms < 6000.0, f"Live /validate call took {dur_live_ms:.1f} ms (> 6000 ms)"

    # 2. Second call should be served from memory cache (substantially faster, < 50 ms)
    t2 = time.perf_counter()
    resp2 = client.get("/validate")
    t3 = time.perf_counter()
    dur_cached_ms = (t3 - t2) * 1000.0

    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["summary"] == data1["summary"]
    assert dur_cached_ms < 50.0, f"Cached call took {dur_cached_ms:.2f} ms (> 50 ms)"

    # 3. POST /validate also works per contract
    resp_post = client.post("/validate")
    assert resp_post.status_code == 200
    assert resp_post.json()["summary"]["passed"] == data1["summary"]["total"]


def test_validation_report_generation_and_contents():
    """Verify scripts/make_validation_report.py generates report without 'TODO'."""
    report_path = generate_validation_report()
    assert report_path.exists()

    content = report_path.read_text(encoding="utf-8")
    assert "TODO" not in content
    assert "Overall Verification Status: **22 / 22 Cases Passed**" in content
    assert "Spatial Mesh Convergence Study (V6)" in content
    assert "Benchmark B1 Performance Summary" in content
    assert "Scope and Limitations" in content

    # Print slide table for test output
    res = run_validation()
    print("\n" + "=" * 90)
    print("FINAL VALIDATION SUMMARY SLIDE TABLE (Milestone M5)")
    print("=" * 90)
    print(f"{'Case ID':<12} | {'Verification Target':<38} | {'Reference':<12} | {'Ours':<12} | {'Err %':<10} | {'Status':<6}")
    print("-" * 90)
    for c in res["cases"]:
        print(f"{c['id']:<12} | {c['name']:<38} | {c['reference']:<12} | {c['ours']:<12} | {c['error_pct']:<9.4f}% | {'PASS' if c['pass'] else 'FAIL'}")
    print("=" * 90)
