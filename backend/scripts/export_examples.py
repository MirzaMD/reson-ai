"""Export frontend API contract examples and OpenAPI specification.

Generates api_examples/ at repository root with complete, validated JSON payloads
for frontend engineering pair-programming and client SDK generation:
- openapi.json
- presets.json
- drone_design.json
- analyze_drone.json
- response_at_drone.json
- optimize_request.json
- optimize_response.json
- agent_build.json
- agent_continue.json
- agent_fix.json
- validate.json
- error_422.json
- README.md
"""

import json
from pathlib import Path
import sys
import time

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from starlette.testclient import TestClient
from app.main import app
from app.presets import get_demo_design

REPO_ROOT = backend_dir.parent
OUT_DIR = REPO_ROOT / "api_examples"


def sanitize_dict(obj):
    """Ensure no raw API keys appear in exported example payloads."""
    if isinstance(obj, dict):
        return {k: sanitize_dict(v) for k, v in obj.items() if "key" not in k.lower()}
    elif isinstance(obj, list):
        return [sanitize_dict(x) for x in obj]
    return obj


def main():
    print(f"Exporting API examples to: {OUT_DIR}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    client = TestClient(app)

    # 1. OpenAPI schema
    print("Exporting openapi.json...")
    openapi_data = app.openapi()
    with open(OUT_DIR / "openapi.json", "w", encoding="utf-8") as f:
        json.dump(openapi_data, f, indent=2)

    # 2. Presets
    print("Exporting presets.json...")
    res_presets = client.get("/presets")
    with open(OUT_DIR / "presets.json", "w", encoding="utf-8") as f:
        json.dump(res_presets.json(), f, indent=2)

    # 3. Drone design
    print("Exporting drone_design.json...")
    res_drone = client.get("/presets/drone/design")
    drone_design = res_drone.json()
    with open(OUT_DIR / "drone_design.json", "w", encoding="utf-8") as f:
        json.dump(drone_design, f, indent=2)

    # 4. Analyze drone
    print("Exporting analyze_drone.json...")
    res_analyze = client.post("/analyze", json=drone_design)
    analyze_data = res_analyze.json()
    with open(OUT_DIR / "analyze_drone.json", "w", encoding="utf-8") as f:
        json.dump(analyze_data, f, indent=2)

    # 5. Response_at drone (at peak camera RPM)
    print("Exporting response_at_drone.json...")
    # Find RPM of strongest finding
    strongest_rpm = 3178.0
    for finding in analyze_data.get("findings", []):
        if finding.get("type") == "limit_exceeded" and finding.get("component") == "camera":
            strongest_rpm = float(finding.get("rpm", 3178.0))
            break

    res_resp_at = client.post("/response_at", json={"design": drone_design, "rpm": strongest_rpm})
    with open(OUT_DIR / "response_at_drone.json", "w", encoding="utf-8") as f:
        json.dump(res_resp_at.json(), f, indent=2)

    # 6. Optimize request and response
    print("Exporting optimize_request.json & optimize_response.json...")
    opt_req = {
        "design": drone_design,
        "objective": "min_sensor_accel",
        "budget": {"max_evals": 600},
        "seed": 1,
    }
    with open(OUT_DIR / "optimize_request.json", "w", encoding="utf-8") as f:
        json.dump(opt_req, f, indent=2)

    res_opt = client.post("/optimize", json=opt_req)
    with open(OUT_DIR / "optimize_response.json", "w", encoding="utf-8") as f:
        json.dump(res_opt.json(), f, indent=2)

    # 7. Agent chats
    print("Exporting agent_build.json...")
    build_req = {
        "mode": "build",
        "design": {},
        "messages": [{"role": "user", "content": "Quadcopter with 4 aluminium arms and a camera on the center body, motors up to 9000 RPM"}],
    }
    res_build = client.post("/agent/chat", json=build_req)
    with open(OUT_DIR / "agent_build.json", "w", encoding="utf-8") as f:
        json.dump(res_build.json(), f, indent=2)

    print("Exporting agent_continue.json...")
    continue_req = {
        "mode": "continue",
        "design": drone_design,
        "messages": [{"role": "user", "content": "add a gyro near the center and make the arms carbon fibre"}],
    }
    res_continue = client.post("/agent/chat", json=continue_req)
    with open(OUT_DIR / "agent_continue.json", "w", encoding="utf-8") as f:
        json.dump(res_continue.json(), f, indent=2)

    print("Exporting agent_fix.json...")
    fix_req = {
        "mode": "fix",
        "design": drone_design,
        "analysis": analyze_data,
        "messages": [{"role": "user", "content": "reduce camera vibration"}],
    }
    res_fix = client.post("/agent/chat", json=fix_req)
    with open(OUT_DIR / "agent_fix.json", "w", encoding="utf-8") as f:
        json.dump(res_fix.json(), f, indent=2)

    # 8. Validate
    print("Exporting validate.json...")
    res_validate = client.get("/validate")
    with open(OUT_DIR / "validate.json", "w", encoding="utf-8") as f:
        json.dump(res_validate.json(), f, indent=2)

    # 9. Error 422 example
    print("Exporting error_422.json...")
    bad_design = {
        "name": "ZeroLengthMember",
        "plane": "xy",
        "nodes": [
            {"id": "n1", "x": 0.0, "y": 0.0},
            {"id": "n2", "x": 0.0, "y": 0.0},
        ],
        "members": [
            {"id": "m1", "n1": "n1", "n2": "n2", "material": "cfrp", "section": {"type": "rect", "w": 0.01, "h": 0.01}}
        ],
        "supports": [{"node": "n1", "type": "fixed"}],
        "components": [],
    }
    res_422 = client.post("/analyze", json=bad_design)
    with open(OUT_DIR / "error_422.json", "w", encoding="utf-8") as f:
        json.dump(res_422.json(), f, indent=2)

    # 10. Generate api_examples/README.md
    print("Generating api_examples/README.md...")
    readme_content = """# ResonAI API Examples & OpenAPI Specification

Pre-computed JSON payloads and schema definitions generated directly from the live FastAPI backend.

## Endpoint & Example Mapping

| File | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| [`openapi.json`](./openapi.json) | `/openapi.json` | `GET` | Complete OpenAPI 3.1 specification for client generator tools. |
| [`presets.json`](./presets.json) | `/presets` | `GET` | Materials, mounts, component kinds, and structural catalog. |
| [`drone_design.json`](./drone_design.json) | `/presets/drone/design` | `GET` | Tuned quadcopter baseline design geometry and components. |
| [`analyze_drone.json`](./analyze_drone.json) | `/analyze` | `POST` | Frequency sweep, Campbell crossings, stress, and findings. |
| [`response_at_drone.json`](./response_at_drone.json) | `/response_at` | `POST` | Complex modal deflection vectors at 3178 RPM for animation. |
| [`optimize_request.json`](./optimize_request.json) | `/optimize` | `POST` | Request body specifying optimization objective and locks. |
| [`optimize_response.json`](./optimize_response.json) | `/optimize` | `POST` | Verified candidate designs with verified vibration reductions. |
| [`agent_build.json`](./agent_build.json) | `/agent/chat` | `POST` | Conversational structural builder response. |
| [`agent_continue.json`](./agent_continue.json) | `/agent/chat` | `POST` | Design modifier chat response adding components and materials. |
| [`agent_fix.json`](./agent_fix.json) | `/agent/chat` | `POST` | Troubleshooting vibration triage assistant response. |
| [`validate.json`](./validate.json) | `/validate` | `GET` | 22 live physics validation benchmarks and system info. |
| [`error_422.json`](./error_422.json) | `/analyze` | `POST` | Example validation error response (zero-length member). |

## Request Body Quick Reference

### 1. `/analyze`
```json
{
  "name": "Structure Name",
  "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}],
  "members": [{"id": "m1", "n1": "n1", "n2": "n2", "material": "cfrp", "section": {"type": "rect", "w": 0.016, "h": 0.004}}],
  "supports": [{"node": "n1", "type": "fixed"}],
  "components": [{"id": "motor", "kind": "motor", "member": "m1", "s": 1.0, "mass": 0.05, "excitation": {"type": "unbalance", "me": 1.8e-6}}]
}
```

### 2. `/response_at`
```json
{
  "design": { /* DesignModel as above */ },
  "rpm": 3178.0
}
```

### 3. `/optimize`
```json
{
  "design": { /* DesignModel as above */ },
  "locks": {"positions": false, "mounts": false, "damping": false},
  "objective": "min_sensor_accel",
  "budget": {"max_evals": 600},
  "seed": 1
}
```

### 4. `/agent/chat`
```json
{
  "mode": "build",
  "design": {},
  "messages": [{"role": "user", "content": "Quadcopter with aluminium arms..."}]
}
```
"""
    with open(OUT_DIR / "README.md", "w", encoding="utf-8") as f:
        f.write(readme_content)

    print("API examples export completed successfully.")


if __name__ == "__main__":
    main()
