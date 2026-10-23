"""Contract and schema tests for Milestone M0."""

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import AnalyzeResponse, DesignModel

client = TestClient(app)

EXAMPLE_DESIGN = {
    "name": "Quad diagonal arm",
    "plane": "xy",
    "nodes": [
        {"id": "n1", "x": -0.15, "y": 0.0},
        {"id": "n2", "x": 0.0, "y": 0.0},
        {"id": "n3", "x": 0.15, "y": 0.0},
    ],
    "members": [
        {
            "id": "m1",
            "n1": "n1",
            "n2": "n2",
            "material": "cfrp",
            "section": {"type": "rect", "w": 0.016, "h": 0.004},
        },
        {
            "id": "m2",
            "n1": "n2",
            "n2": "n3",
            "material": "cfrp",
            "section": {"type": "rect", "w": 0.016, "h": 0.004},
        },
    ],
    "supports": [{"node": "n2", "type": "spring", "ky": 2000, "kx": 2000, "kr": 0}],
    "components": [
        {
            "id": "c1",
            "kind": "motor",
            "member": "m1",
            "s": 0.0,
            "mass": 0.055,
            "mount": {"preset": "rubber_medium", "kv": 100000, "zeta": 0.08},
            "excitation": {
                "type": "unbalance",
                "rpm_min": 1000,
                "rpm_max": 12000,
                "me": 2e-6,
                "orders": [1],
                "blades": 2,
            },
        },
        {
            "id": "c2",
            "kind": "camera",
            "member": "m1",
            "s": 0.9,
            "mass": 0.15,
            "mount": {"preset": "silicone_gel", "kv": 50000, "zeta": 0.15},
            "limit_g": 0.5,
        },
    ],
    "analysis": {
        "rpm_min": 500,
        "rpm_max": 12000,
        "n_points": 400,
        "beam_zeta": 0.02,
        "n_elements_per_member": 20,
    },
}


def test_design_schema_validates_example():
    design = DesignModel.model_validate(EXAMPLE_DESIGN)
    assert design.name == "Quad diagonal arm"
    assert len(design.nodes) == 3
    assert len(design.members) == 2
    assert len(design.components) == 2


def test_design_schema_rejects_invalid_references():
    invalid_design = dict(EXAMPLE_DESIGN)
    invalid_design["members"] = [
        {
            "id": "m1",
            "n1": "n1",
            "n2": "n_nonexistent",
            "material": "cfrp",
            "section": {"type": "rect", "w": 0.016, "h": 0.004},
        }
    ]
    with pytest.raises(Exception):
        DesignModel.model_validate(invalid_design)


def test_design_schema_rejects_negative_mass():
    invalid_design = dict(EXAMPLE_DESIGN)
    invalid_design["components"] = [
        {
            "id": "c1",
            "kind": "motor",
            "member": "m1",
            "s": 0.0,
            "mass": -0.05,
        }
    ]
    with pytest.raises(Exception):
        DesignModel.model_validate(invalid_design)


def test_design_schema_rejects_invalid_s():
    invalid_design = dict(EXAMPLE_DESIGN)
    invalid_design["components"] = [
        {
            "id": "c1",
            "kind": "motor",
            "member": "m1",
            "s": 1.5,
            "mass": 0.05,
        }
    ]
    with pytest.raises(Exception):
        DesignModel.model_validate(invalid_design)


def test_mock_json_matches_contract():
    backend_mock = Path(__file__).resolve().parent.parent / "app" / "mock_analyze.json"
    root_mock = Path(__file__).resolve().parent.parent.parent / "mock_analyze.json"

    assert backend_mock.exists(), f"Backend mock missing at {backend_mock}"
    assert root_mock.exists(), f"Root mock missing at {root_mock}"

    with open(backend_mock, "r", encoding="utf-8") as f:
        data = json.load(f)

    resp = AnalyzeResponse.model_validate(data)
    assert len(resp.mesh_nodes) >= 30, f"Expected ~40 mesh nodes, got {len(resp.mesh_nodes)}"
    assert len(resp.sweep.rpm) == 120, f"Expected 120 RPM points, got {len(resp.sweep.rpm)}"
    assert len(resp.modes) == 2, f"Expected 2 modes, got {len(resp.modes)}"
    assert len(resp.components) == 2, f"Expected 2 components, got {len(resp.components)}"

    # Camera critical finding check
    critical_findings = [f for f in resp.findings if f.severity == "critical"]
    assert len(critical_findings) >= 1
    assert critical_findings[0].component == "c2"

    # Campbell diagram
    assert len(resp.campbell.lines) >= 1


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_presets_endpoint():
    response = client.get("/presets")
    assert response.status_code == 200
    data = response.json()
    assert "materials" in data
    assert "mounts" in data
    assert "components" in data
    assert "structures" in data
    assert "cfrp" in data["materials"]
    assert "rubber_medium" in data["mounts"]


def test_analyze_endpoint_post():
    response = client.post("/analyze", json=EXAMPLE_DESIGN)
    assert response.status_code == 200
    data = response.json()
    resp = AnalyzeResponse.model_validate(data)
    assert resp.meta.method == "rom"
    assert len(resp.mesh_nodes) > 0
    assert "c1" in resp.sweep.component_accel_g
    assert "c2" in resp.sweep.component_accel_g
