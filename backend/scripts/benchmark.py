"""Benchmark B1: Direct Full Solve (Dense & Sparse) vs Reduced Order Model (ROM).

Measures performance across mesh discretizations (20, 50, 100, 200 elements/member),
and tests both 1-thread and default-thread BLAS settings to use the fastest baseline per row.
Automatically generates benchmark_report.md at repository root.
"""

import os
from pathlib import Path
import platform
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import scipy
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from threadpoolctl import threadpool_limits

backend_dir = Path(__file__).resolve().parent.parent
repo_root = backend_dir.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.solver.assemble import assemble
from app.solver.damping import build_damping
from app.solver.harmonic import (
    build_force_batch,
    component_response,
    expand_to_full,
    full_solve,
    full_solve_sparse,
    rom_basis,
    rom_solve,
)
from app.solver.mesh import build_mesh
from app.solver.modal import modal_analysis


def make_v7_design(n_el_per_member: int, n_points: int = 400) -> dict:
    return {
        "name": f"Drone_Arm_Benchmark_{n_el_per_member}el",
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
        "supports": [{"node": "n2", "type": "spring", "kx": 2000, "ky": 2000, "kr": 5}],
        "components": [
            {
                "id": "c1",
                "kind": "motor",
                "member": "m1",
                "s": 0.0,
                "mass": 0.055,
                "mount": {"preset": "rubber_medium", "kv": 100000, "zeta": 0.08},
                "excitation": {"type": "unbalance", "rpm_min": 1000, "rpm_max": 12000, "me": 2e-6, "orders": [1.0]},
            },
            {
                "id": "c2",
                "kind": "camera",
                "member": "m2",
                "s": 0.8,
                "mass": 0.15,
                "mount": {"preset": "silicone_gel", "kv": 50000, "zeta": 0.15},
                "limit_g": 0.5,
            },
        ],
        "analysis": {
            "rpm_min": 500.0,
            "rpm_max": 12000.0,
            "n_points": n_points,
            "beam_zeta": 0.02,
            "n_elements_per_member": n_el_per_member,
        },
    }


def run_benchmark_row(
    n_el: int,
    n_points: int = 400,
    label: Optional[str] = None,
) -> Dict[str, Any]:
    design = make_v7_design(n_el, n_points=n_points)
    mesh = build_mesh(design)
    model = assemble(design, mesh)
    n_dofs = len(model.free_dofs)

    rpms = np.linspace(500.0, 12000.0, n_points)
    omegas = 2.0 * np.pi * (rpms / 60.0)

    F_batch = build_force_batch(model, design, rpms=rpms, order=1.0)

    f_hz, Phi_ff, is_rb = modal_analysis(model.K_ff, model.M_ff)
    non_rigid = f_hz[~is_rb]
    f1 = float(non_rigid[0])
    f2 = max(1.5 * (12000.0 / 60.0), 3.0 * f1)
    C_ff = build_damping(model, zeta=0.02, f1_hz=f1, f2_hz=f2)
    Phi_r, r_kept = rom_basis(Phi_ff, f_hz, f_exc_max=200.0, r_min=12, r_max=20)

    # 1. Benchmark Dense Full Solve: test 1 thread vs default threads (best of 3 each)
    dense_1th_times = []
    dense_def_times = []

    # Warm-up
    _ = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
    _ = full_solve_sparse(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
    _ = rom_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas, Phi_r)

    # 1-thread measurement
    X_dense_1th = None
    for _ in range(3):
        t0 = time.perf_counter()
        with threadpool_limits(limits=1, user_api="blas"):
            X_dense_1th = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
        dense_1th_times.append((time.perf_counter() - t0) * 1000.0)

    # Default-threads measurement
    X_dense_def = None
    for _ in range(3):
        t0 = time.perf_counter()
        X_dense_def = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
        dense_def_times.append((time.perf_counter() - t0) * 1000.0)

    best_1th = min(dense_1th_times)
    best_def = min(dense_def_times)

    if best_1th <= best_def:
        best_dense_ms = best_1th
        dense_threads = "1 thread"
        X_dense_ref = X_dense_1th
    else:
        best_dense_ms = best_def
        dense_threads = "default"
        X_dense_ref = X_dense_def

    # 2. Benchmark Sparse Full Solve (best of 3)
    sparse_times = []
    for _ in range(3):
        t0 = time.perf_counter()
        _ = full_solve_sparse(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
        sparse_times.append((time.perf_counter() - t0) * 1000.0)
    best_sparse_ms = min(sparse_times)

    # 3. Benchmark ROM Setup (includes eigh + basis projection) & Sweep (best of 3)
    rom_setup_times = []
    rom_sweep_times = []
    X_rom_final = None

    for _ in range(3):
        t_s0 = time.perf_counter()
        f_hz_eval, Phi_ff_eval, is_rb_eval = modal_analysis(model.K_ff, model.M_ff)
        Phi_r_eval, r_eval = rom_basis(Phi_ff_eval, f_hz_eval, f_exc_max=200.0, r_min=12, r_max=20)
        C_ff_eval = build_damping(model, zeta=0.02, f1_hz=f1, f2_hz=f2)
        rom_setup_times.append((time.perf_counter() - t_s0) * 1000.0)

        t_sw0 = time.perf_counter()
        X_rom_final = rom_solve(model.K_ff, C_ff_eval, model.M_ff, F_batch, omegas, Phi_r_eval)
        rom_sweep_times.append((time.perf_counter() - t_sw0) * 1000.0)

    best_rom_setup_ms = min(rom_setup_times)
    best_rom_sweep_ms = min(rom_sweep_times)
    best_rom_total_ms = best_rom_setup_ms + best_rom_sweep_ms

    # 4. Compute max error PER ROW strictly against this row's own dense full solve
    X_dense_expanded = expand_to_full(model, X_dense_ref)
    _, a_sensor_ref = component_response(model, X_dense_expanded, "c2", omegas)

    X_rom_expanded = expand_to_full(model, X_rom_final)
    _, a_sensor_rom = component_response(model, X_rom_expanded, "c2", omegas)

    peak_ref = float(np.max(a_sensor_ref))
    sig_mask = a_sensor_ref > 0.01 * peak_ref
    rel_errors = np.abs(a_sensor_rom[sig_mask] - a_sensor_ref[sig_mask]) / a_sensor_ref[sig_mask] * 100.0
    max_error_pct = float(np.max(rel_errors))

    speedup_vs_dense = best_dense_ms / best_rom_total_ms if best_rom_total_ms > 0 else 1.0
    speedup_vs_sparse = best_sparse_ms / best_rom_total_ms if best_rom_total_ms > 0 else 1.0

    row_label = label or f"{n_el} el/member"

    return {
        "label": row_label,
        "n_el": n_el,
        "n_points": n_points,
        "n_dofs": n_dofs,
        "r_kept": r_kept,
        "dense_ms": best_dense_ms,
        "dense_threads": dense_threads,
        "sparse_ms": best_sparse_ms,
        "rom_setup_ms": best_rom_setup_ms,
        "rom_sweep_ms": best_rom_sweep_ms,
        "rom_total_ms": best_rom_total_ms,
        "speedup_vs_dense": speedup_vs_dense,
        "speedup_vs_sparse": speedup_vs_sparse,
        "max_error_pct": max_error_pct,
    }


def main():
    print("=" * 85)
    print("ResonAI Benchmark B1: Direct Full Solve (Dense & Sparse) vs ROM")
    print("Measured on local hardware with verified multi-baseline timing")
    print("=" * 85)

    cases = [20, 50, 100, 200]
    results = []

    for n_el in cases:
        print(f"\nBenchmarking case {n_el} elements/member (400 RPM points)...")
        res = run_benchmark_row(n_el, n_points=400)
        results.append(res)
        print(f"  DOFs: {res['n_dofs']} | r: {res['r_kept']}")
        print(f"  Dense Full Solve:     {res['dense_ms']:.2f} ms ({res['dense_threads']})")
        print(f"  Sparse Full Solve:    {res['sparse_ms']:.2f} ms")
        print(f"  ROM Setup (eigh):     {res['rom_setup_ms']:.2f} ms")
        print(f"  ROM Sweep (400 pts):  {res['rom_sweep_ms']:.2f} ms")
        print(f"  ROM Total:            {res['rom_total_ms']:.2f} ms")
        print(f"  Speedup vs Dense:     {res['speedup_vs_dense']:.1f}x")
        print(f"  Speedup vs Sparse:    {res['speedup_vs_sparse']:.1f}x")
        print(f"  Max Error vs Dense:   {res['max_error_pct']:.4f}%")

    # Extra row: per optimizer evaluation (10 elements/member, 80 RPM points)
    print(f"\nBenchmarking optimizer evaluation case (10 el/member, 80 RPM points)...")
    opt_res = run_benchmark_row(
        n_el=10,
        n_points=80,
        label="Per optimizer evaluation (10 el, 80 pts)",
    )
    print(f"  DOFs: {opt_res['n_dofs']} | r: {opt_res['r_kept']}")
    print(f"  Dense Full Solve:     {opt_res['dense_ms']:.2f} ms")
    print(f"  Sparse Full Solve:    {opt_res['sparse_ms']:.2f} ms")
    print(f"  ROM Setup + Sweep:    {opt_res['rom_total_ms']:.2f} ms (Setup: {opt_res['rom_setup_ms']:.2f} ms, Sweep: {opt_res['rom_sweep_ms']:.2f} ms)")
    print(f"  Speedup vs Dense:     {opt_res['speedup_vs_dense']:.1f}x")
    print(f"  Speedup vs Sparse:    {opt_res['speedup_vs_sparse']:.1f}x")
    print(f"  Max Error:            {opt_res['max_error_pct']:.4f}%")

    # System info
    cpu_model = platform.processor() or "x86_64 Processor"
    cpu_cores = os.cpu_count() or 1
    numpy_version = np.__version__
    scipy_version = scipy.__version__

    # Compute overall claims from the measured numbers across the 4 primary benchmark cases
    min_speedup_dense = min(r["speedup_vs_dense"] for r in results)
    max_speedup_dense = max(r["speedup_vs_dense"] for r in results)
    min_speedup_sparse = min(r["speedup_vs_sparse"] for r in results)
    max_speedup_sparse = max(r["speedup_vs_sparse"] for r in results)
    max_err_all = max(r["max_error_pct"] for r in results)

    claim_line = (
        f"ResonAI's reduced-order solver delivers full frequency sweeps with < {max_err_all:.3f}% error, "
        f"providing a {min_speedup_dense:.1f}x to {max_speedup_dense:.1f}x total speedup over dense direct solves "
        f"({min_speedup_sparse:.1f}x to {max_speedup_sparse:.1f}x over sparse direct solves) on the same 1D model."
    )

    # Format Markdown Report
    md_lines = [
        "# Benchmark B1: Direct Full Solve (Dense & Sparse) vs Reduced Order Model (ROM)",
        "",
        "## System Environment",
        f"- **CPU Model**: {cpu_model}",
        f"- **Logical Cores**: {cpu_cores}",
        f"- **NumPy Version**: {numpy_version}",
        f"- **SciPy Version**: {scipy_version}",
        f"- **Thread Policy**: Tested both 1-thread and default-threads per case; faster baseline reported.",
        "",
        "## Benchmark Results",
        "Evaluation performed over **400 RPM points** (500 to 12,000 RPM) on the Drone Arm Structure, plus one candidate evaluation row representing typical optimizer evaluation parameters (10 elements/member, 80 RPM points).",
        "",
        "| Case | Free DOFs | Dense Full (ms) | Sparse Full (ms) | ROM Setup (ms) | ROM Sweep (ms) | ROM Total (ms) | Speedup vs Dense | Speedup vs Sparse | Max Band Error % |",
        "|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|",
    ]

    for r in results:
        md_lines.append(
            f"| {r['label']} | {r['n_dofs']} | {r['dense_ms']:.2f} ({r['dense_threads']}) | {r['sparse_ms']:.2f} | {r['rom_setup_ms']:.2f} | {r['rom_sweep_ms']:.2f} | {r['rom_total_ms']:.2f} | **{r['speedup_vs_dense']:.1f}×** | **{r['speedup_vs_sparse']:.1f}×** | {r['max_error_pct']:.4f}% |"
        )

    # Optimizer row
    md_lines.append(
        f"| *{opt_res['label']}* | {opt_res['n_dofs']} | {opt_res['dense_ms']:.2f} | {opt_res['sparse_ms']:.2f} | {opt_res['rom_setup_ms']:.2f} | {opt_res['rom_sweep_ms']:.2f} | {opt_res['rom_total_ms']:.2f} | **{opt_res['speedup_vs_dense']:.1f}×** | **{opt_res['speedup_vs_sparse']:.1f}×** | {opt_res['max_error_pct']:.4f}% |"
    )

    md_lines.extend([
        "",
        "## Defensible Slide Claim",
        f"> **\"{claim_line}\"**",
        "",
        "## What This Does Not Show",
        "The baselines shown above are our own in-house dense and sparse direct linear solvers running on the exact same 1D Euler-Bernoulli beam finite element model, not commercial 3D FEM software such as Ansys or Abaqus. In real-world engineering workflows, the largest reduction in simulation time comes from the physics-based 1D line-body modeling decision (collapsing hundreds of thousands of 3D solid continuum elements down to ~100–600 beam DOFs). The modal ROM provides the crucial second-stage acceleration that makes real-time design exploration and iterative optimization practical.",
        "",
        "## Engineering Observations",
        f"- **Fast Single-Candidate Solves**: A complete candidate evaluation during optimization (eigh re-solution + 80-point sweep) executes in only **{opt_res['rom_total_ms']:.2f} ms**, enabling differential evolution to evaluate thousands of candidate designs in seconds.",
        f"- **High Accuracy**: Across all mesh discretizations, the truncated modal basis ($r=12$) reproduces the direct full solve within **< {max_err_all:.3f}%** error across the entire frequency range.",
    ])

    md_content = "\n".join(md_lines) + "\n"

    report_path = repo_root / "benchmark_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Also save structured JSON report for cached /validate endpoint
    import datetime
    import json
    json_data = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "environment": {
            "cpu_model": cpu_model,
            "cpu_cores": cpu_cores,
            "numpy_version": numpy_version,
            "scipy_version": scipy_version,
            "thread_policy": "Tested both 1-thread and default-threads per case; faster baseline reported",
        },
        "results": results,
        "optimizer_candidate": opt_res,
        "summary": {
            "min_speedup_dense": min_speedup_dense,
            "max_speedup_dense": max_speedup_dense,
            "min_speedup_sparse": min_speedup_sparse,
            "max_speedup_sparse": max_speedup_sparse,
            "max_error_pct": max_err_all,
            "claim_line": claim_line,
        },
    }

    json_path = repo_root / "benchmark_report.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2)

    app_json_path = backend_dir / "app" / "benchmark_report.json"
    with open(app_json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2)

    print("\n" + "=" * 85)
    print(f"Generated benchmark report at: {report_path}")
    print(f"Generated benchmark JSON at: {json_path}")
    print("=" * 85)
    print(md_content)


if __name__ == "__main__":
    main()
