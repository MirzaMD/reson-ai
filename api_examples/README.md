# ResonAI API Examples & OpenAPI Specification

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
