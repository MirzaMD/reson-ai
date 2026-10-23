"""Generate mock_analyze.json conforming to the frozen contract in 00_MASTER_CONTEXT.md section 6.2.

Generates:
1. backend/app/mock_analyze.json
2. mock_analyze.json (repo root)
"""

import json
from pathlib import Path
import sys

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent
repo_root = backend_dir.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.schemas import AnalyzeResponse


def generate_mock_data() -> dict:
    # 1. Mesh nodes: 41 nodes from x = -0.15 to x = +0.15 m along 0.3 m beam
    n_nodes = 41
    mesh_nodes = []
    x_coords = []
    for i in range(n_nodes):
        x = -0.15 + (0.30 / (n_nodes - 1)) * i
        x = round(x, 4)
        x_coords.append(x)
        if x <= 0.0:
            member = "m1"
            s = round((x - (-0.15)) / 0.15, 3)
        else:
            member = "m2"
            s = round(x / 0.15, 3)
        mesh_nodes.append({
            "id": f"node_{i}",
            "x": x,
            "y": 0.0,
            "member": member,
            "s": s,
        })

    # 2. Modes
    # Mode 1: 42.7 Hz (support bounce / pitch)
    # Mode 2: 70.1 Hz (first arm bending, resonates near 4200 RPM = 70 Hz)
    mode1_shape = []
    mode2_shape = []
    import math

    for i, x in enumerate(x_coords):
        # Rigid tilt/bounce
        uy1 = round(0.01 + 0.05 * (x / 0.15), 4)
        mode1_shape.append([0.0, uy1])
        # Bending shape peaking towards ends
        uy2 = round(0.20 * math.cos(math.pi * x / 0.30), 4)
        mode2_shape.append([0.0, uy2])

    modes = [
        {
            "i": 1,
            "f_hz": 42.7,
            "shape": mode1_shape,
            "note": "rigid-body-like on supports",
        },
        {
            "i": 2,
            "f_hz": 70.1,
            "shape": mode2_shape,
            "note": "1st symmetric beam bending mode",
        },
    ]

    # 3. Sweep: 120 coarse RPM points from 500 to 12000 RPM
    n_rpm = 120
    rpm_list = []
    freq_list = []
    node_amp_mm = []
    c1_accel_g = []
    c2_accel_g = []
    c1_disp_mm = []
    c2_disp_mm = []
    transmitted_force_n = []

    for i in range(n_rpm):
        rpm = round(500.0 + (12000.0 - 500.0) / (n_rpm - 1) * i, 1)
        freq = round(rpm / 60.0, 2)
        rpm_list.append(rpm)
        freq_list.append(freq)

        # Resonance peak factor near 4200 RPM (Lorentzian curve)
        delta_rpm = rpm - 4200.0
        resonance_factor = 1.0 / (1.0 + (delta_rpm / 350.0) ** 2)
        high_rpm_growth = (rpm / 12000.0) ** 1.8

        # c1 (motor at tip): unbalance grows with rpm^2, moderate damping
        a_c1 = round(0.05 + 0.80 * high_rpm_growth + 0.15 * resonance_factor, 3)
        d_c1 = round(0.02 + 0.08 * resonance_factor + 0.04 * (rpm / 12000.0), 3)
        f_trans = round(1.2 + 11.5 * high_rpm_growth + 3.5 * resonance_factor, 2)

        # c2 (camera at s=0.9): sensitive, peaks to 1.8 g at 4200 RPM!
        a_c2 = round(0.04 + 0.12 * high_rpm_growth + 1.64 * resonance_factor, 3)
        d_c2 = round(0.01 + 0.27 * resonance_factor + 0.02 * high_rpm_growth, 3)

        c1_accel_g.append(a_c1)
        c2_accel_g.append(a_c2)
        c1_disp_mm.append(d_c1)
        c2_disp_mm.append(d_c2)
        transmitted_force_n.append(f_trans)

        # Node amplitudes for heatmap [n_rpm][n_nodes]
        row_amps = []
        for x in x_coords:
            spatial_factor = abs(math.cos(math.pi * x / 0.30))
            amp = round(
                (0.01 + 0.32 * resonance_factor * spatial_factor + 0.03 * high_rpm_growth),
                4,
            )
            row_amps.append(amp)
        node_amp_mm.append(row_amps)

    sweep = {
        "rpm": rpm_list,
        "freq_hz": freq_list,
        "node_amp_mm": node_amp_mm,
        "component_accel_g": {"c1": c1_accel_g, "c2": c2_accel_g},
        "component_disp_mm": {"c1": c1_disp_mm, "c2": c2_disp_mm},
        "transmitted_force_n": {"c1": transmitted_force_n},
    }

    # 4. Campbell diagram
    campbell = {
        "mode_freqs_hz": [42.7, 70.1],
        "lines": [
            {"label": "1x motor unbalance", "order": 1.0},
            {"label": "2x blade pass", "order": 2.0},
        ],
    }

    # 5. Component summaries
    components = [
        {
            "id": "c1",
            "peak_accel_g": max(c1_accel_g),
            "at_rpm": 12000.0,
            "limit_g": None,
            "status": "ok",
        },
        {
            "id": "c2",
            "peak_accel_g": 1.8,
            "at_rpm": 4200.0,
            "limit_g": 0.5,
            "status": "critical",
        },
    ]

    # 6. Findings
    findings = [
        {
            "id": "f1",
            "severity": "critical",
            "type": "limit_exceeded",
            "component": "c2",
            "rpm": 4200.0,
            "value": 1.8,
            "limit": 0.5,
            "mode": 2,
            "mode_f_hz": 70.1,
            "position": {"member": "m1", "s": 0.9},
            "detail": "1x excitation at 4200 RPM (70.0 Hz) is within 0.1% of mode 2 (70.1 Hz); camera exceeds 0.5g limit.",
        }
    ]

    # 7. Max stress
    max_stress = {
        "value": 41.0,
        "member": "m1",
        "at_rpm": 4200.0,
        "yield_mpa": 240.0,
        "ratio": 0.17,
    }

    # 8. Meta
    meta = {
        "n_dof": 125,
        "n_modes_kept": 2,
        "solve_ms": 14.2,
        "method": "rom",
    }

    data = {
        "meta": meta,
        "mesh_nodes": mesh_nodes,
        "modes": modes,
        "sweep": sweep,
        "campbell": campbell,
        "components": components,
        "findings": findings,
        "max_stress_mpa": max_stress,
    }

    # Contract verification using pydantic
    AnalyzeResponse.model_validate(data)
    return data


def main():
    data = generate_mock_data()
    backend_out = backend_dir / "app" / "mock_analyze.json"
    root_out = repo_root / "mock_analyze.json"

    with open(backend_out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote mock data to: {backend_out}")

    with open(root_out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote mock data to: {root_out}")


if __name__ == "__main__":
    main()
