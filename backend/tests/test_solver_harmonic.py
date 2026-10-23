"""Harmonic response verification tests (Milestone M3).

Covers:
- SDOF forced response with unbalance vs analytical formula (< 0.01%) and resonance peak check.
- Transmissibility vs analytical sdof_transmissibility (< 0.01%).
- Low-frequency static limit of cantilever vs P*L^3 / (3*E*I) (< 0.1%).
- Resonance peak location for coupled body + component within 2% of natural frequency.
- Unbalance force quadratic scaling F(2*rpm) = 4 * F(rpm).
- Full solve chunking invariance (chunk = 1, 7, 400).
- V7 ROM vs Full accuracy benchmark across modal basis sizes r.
"""

from typing import Any, List
import numpy as np
import pytest

from app.presets import MATERIALS
from app.solver.assemble import assemble
from app.solver.damping import build_damping
from app.solver.harmonic import (
    build_force,
    component_response,
    expand_to_full,
    full_solve,
    full_solve_sparse,
    rom_basis,
    rom_solve,
    transmitted_force,
)
from app.solver.mesh import build_mesh
from app.solver.modal import modal_analysis
from app.solver.pipeline import solve_design
from app.validation.analytical import sdof_transmissibility


def print_table(title: str, headers: List[str], rows: List[List[Any]]):
    print(f"\n--- {title} ---")
    widths = [max(len(str(val)) for val in [h] + [r[i] for r in rows]) + 3 for i, h in enumerate(headers)]
    header_line = " | ".join(f"{h:<{w}}" for h, w in zip(headers, widths))
    print(header_line)
    print("-" * len(header_line))
    for r in rows:
        print(" | ".join(f"{str(v):<{w}}" for v, w in zip(r, widths)))


def test_sdof_forced_response_unbalance():
    """SDOF unbalance forced response: m = 1 kg, k = 1e5 N/m, zeta = 0.1, me = 1e-3 kg*m.

    Compare |X| to me*w^2 / |k - m*w^2 + i*w*c| at 10 frequencies from 0.2*fn to 3*fn.
    Check error < 0.01% and check peak at w = wn equals me*wn/c.
    """
    m = 1.0
    k = 1e5
    zeta = 0.10
    me = 1e-3
    c = 2.0 * zeta * np.sqrt(k * m)
    wn = np.sqrt(k / m)
    fn = wn / (2.0 * np.pi)

    # Base cantilever with fixed support so beam node is rigid
    design = {
        "name": "SDOF_Unbalance",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": 0.2, "y": 0.0}],
        "members": [{"id": "m1", "n1": "n1", "n2": "n2", "material": "steel", "section": {"type": "rect", "w": 0.05, "h": 0.05}}],
        "supports": [{"node": "n1", "type": "fixed"}],
        "components": [
            {
                "id": "c1",
                "kind": "motor",
                "member": "m1",
                "s": 0.0,
                "mass": m,
                "mount": {"kv": k, "zeta": zeta},
                "excitation": {"type": "unbalance", "me": me, "orders": [1.0]},
            }
        ],
        "analysis": {"n_elements_per_member": 10},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    # Test 10 frequencies from 0.2*fn to 3.0*fn
    freq_ratios = np.linspace(0.2, 3.0, 10)
    freqs = freq_ratios * fn
    omegas = 2.0 * np.pi * freqs
    rpms = freqs * 60.0

    F_batch = np.array([build_force(model, design, rpm=r_val, order=1.0) for r_val in rpms], dtype=complex)
    C_ff = model.C[np.ix_(model.free_dofs, model.free_dofs)]
    X_free = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
    X_full = expand_to_full(model, X_free)

    d_comp_m, _ = component_response(model, X_full, "c1", omegas)

    # Analytical values
    d_analytical = (me * omegas**2) / np.abs((k - m * omegas**2) + 1j * omegas * c)

    table_rows = []
    for r, fc, fa in zip(freq_ratios, d_comp_m, d_analytical):
        err = abs(fc - fa) / fa * 100.0
        table_rows.append([f"{r:.2f} fn", f"{fc*1e3:.5f} mm", f"{fa*1e3:.5f} mm", f"{err:.4f}%"])
        assert err < 0.01, f"SDOF error {err:.4f}% exceeds 0.01%"

    print_table("SDOF Unbalance Response Verification", ["Freq Ratio", "Computed |X|", "Analytical |X|", "Error %"], table_rows)

    # Check resonance peak at w = wn: |X(wn)| = me * wn / c
    rpm_res = fn * 60.0
    F_res = build_force(model, design, rpm=rpm_res, order=1.0)[np.newaxis, :]
    X_res = full_solve(model.K_ff, C_ff, model.M_ff, F_res, [wn])
    X_res_full = expand_to_full(model, X_res)
    d_res_comp, _ = component_response(model, X_res_full, "c1", [wn])

    expected_peak = (me * wn) / c
    peak_err = abs(d_res_comp[0] - expected_peak) / expected_peak * 100.0
    print(f"\nResonance Peak at w=wn: Computed {d_res_comp[0]*1e3:.6f} mm | Expected {expected_peak*1e3:.6f} mm | Error: {peak_err:.5f}%")
    assert peak_err < 0.01


def test_sdof_transmissibility():
    """SDOF transmissibility with generic unit force vs analytical.sdof_transmissibility."""
    m = 1.0
    k = 1e5
    zeta = 0.08
    wn = np.sqrt(k / m)
    fn = wn / (2.0 * np.pi)

    design = {
        "name": "SDOF_Trans",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": 0.2, "y": 0.0}],
        "members": [{"id": "m1", "n1": "n1", "n2": "n2", "material": "steel", "section": {"type": "rect", "w": 0.05, "h": 0.05}}],
        "supports": [{"node": "n1", "type": "fixed"}],
        "components": [{"id": "c1", "kind": "sensor", "member": "m1", "s": 0.0, "mass": m, "mount": {"kv": k, "zeta": zeta}}],
        "analysis": {"n_elements_per_member": 10},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)
    C_ff = model.C[np.ix_(model.free_dofs, model.free_dofs)]

    # Unit force F0 = 1.0 N on component DOF
    comp_free_idx = [idx for idx, dof in enumerate(model.free_dofs) if dof == model.comp_dof["c1"]][0]
    F_unit = np.zeros(len(model.free_dofs), dtype=complex)
    F_unit[comp_free_idx] = 1.0

    r_values = [0.5, 1.0, 2.0, 3.0]
    omegas = [r * wn for r in r_values]

    F_batch = np.tile(F_unit, (len(omegas), 1))
    X_free = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
    X_full = expand_to_full(model, X_free)

    F_trans = transmitted_force(model, X_full, "c1", omegas, kv=k, zeta=zeta, m_c=m)
    # T = F_trans / F0 (since F0 = 1.0 N)
    T_computed = F_trans

    table_rows = []
    for r, T_c in zip(r_values, T_computed):
        T_ana = sdof_transmissibility(r, zeta)
        err = abs(T_c - T_ana) / T_ana * 100.0
        table_rows.append([f"r = {r:.1f}", f"{T_c:.5f}", f"{T_ana:.5f}", f"{err:.4f}%"])
        assert err < 0.01, f"Transmissibility error {err:.4f}% exceeds 0.01% target at r={r}"

    print_table("Transmissibility Verification", ["Ratio r", "Computed T", "Analytical T", "Error %"], table_rows)


def test_cantilever_static_limit():
    """Static limit check: tip force P = 1 N on cantilever beam at w -> 0, zeta = 0.

    Tip deflection delta must match P*L^3 / (3*E*I) within 0.1%.
    """
    L = 1.0
    w = 0.02
    h = 0.01
    E = MATERIALS["aluminium_6061"]["E"]
    I = w * (h**3) / 12.0
    P = 1.0
    expected_delta = (P * (L**3)) / (3.0 * E * I)

    design = {
        "name": "Cantilever_Static",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": L, "y": 0.0}],
        "members": [{"id": "m1", "n1": "n1", "n2": "n2", "material": "aluminium_6061", "section": {"type": "rect", "w": w, "h": h}}],
        "supports": [{"node": "n1", "type": "fixed"}],
        "analysis": {"n_elements_per_member": 40},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    # Force P = 1 N at tip node n2 transverse DOF (v2)
    n2_mesh_idx = mesh.node_map["n2"]
    v2_dof = 3 * n2_mesh_idx + 1

    v2_free_idx = [idx for idx, dof in enumerate(model.free_dofs) if dof == v2_dof][0]
    F_free = np.zeros(len(model.free_dofs), dtype=complex)
    F_free[v2_free_idx] = P

    w_tiny = 1e-4
    # Zero damping for pure static elastic response
    C_zero = np.zeros_like(model.K_ff)
    X_free = full_solve(model.K_ff, C_zero, model.M_ff, F_free[np.newaxis, :], [w_tiny])

    computed_delta = float(np.abs(X_free[0, v2_free_idx]))
    err_pct = abs(computed_delta - expected_delta) / expected_delta * 100.0

    print(f"\n--- Cantilever Static Limit Check ---")
    print(f"Computed Tip Deflection:  {computed_delta*1e3:.6f} mm")
    print(f"Analytical P*L^3/(3*E*I): {expected_delta*1e3:.6f} mm")
    print(f"Error: {err_pct:.4f}% (< 0.1%)")

    assert err_pct < 0.1


def test_resonance_peak_location():
    """Resonance location: V5 setup (free-free beam + 2 kg midspan component) under unbalance.

    Acceleration peak occurs at an RPM whose excitation frequency is within 2% of the mount mode frequency.
    """
    L = 0.2
    w = 0.05
    h = 0.05
    m_comp = 2.0
    k_mount = 2e5

    design = {
        "name": "Resonance_Location_V5",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": L, "y": 0.0}],
        "members": [{"id": "m1", "n1": "n1", "n2": "n2", "material": "steel", "section": {"type": "rect", "w": w, "h": h}}],
        "supports": [],
        "components": [
            {
                "id": "c1",
                "kind": "motor",
                "member": "m1",
                "s": 0.5,
                "mass": m_comp,
                "mount": {"kv": k_mount, "zeta": 0.02},
                "excitation": {"type": "unbalance", "me": 1e-4, "orders": [1.0]},
            }
        ],
        "analysis": {"n_elements_per_member": 30, "beam_zeta": 0.02},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)
    f_hz, _, is_rb = modal_analysis(model.K_ff, model.M_ff)

    # Mount mode is mode 4 (first 3 are rigid body)
    fn_mount = float(f_hz[3])

    # Sweep finely around the mount frequency (50 Hz to 75 Hz)
    freqs = np.linspace(50.0, 75.0, 251)
    rpms = freqs * 60.0

    res = solve_design(design, rpm_array=rpms, method="rom")
    accel = res.component_accel_g["c1"]
    peak_idx = int(np.argmax(accel))

    f_peak = float(res.freq_hz[peak_idx])
    rpm_peak = float(res.rpm[peak_idx])

    err_pct = abs(f_peak - fn_mount) / fn_mount * 100.0

    print(f"\n--- Resonance Peak Location Check ---")
    print(f"Computed Mount Natural Frequency: {fn_mount:.4f} Hz")
    print(f"Observed Acceleration Peak:       {f_peak:.4f} Hz at {rpm_peak:.1f} RPM")
    print(f"Frequency Difference:             {err_pct:.3f}% (< 2%)")

    assert err_pct < 2.0


def test_unbalance_scaling():
    """Unbalance scaling: Assembled force at 2*rpm must be exactly 4x the force at rpm."""
    design = {
        "name": "Unbalance_Scaling",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": 0.3, "y": 0.0}],
        "members": [{"id": "m1", "n1": "n1", "n2": "n2", "material": "cfrp", "section": {"type": "rect", "w": 0.02, "h": 0.01}}],
        "supports": [{"node": "n1", "type": "pinned"}],
        "components": [
            {
                "id": "c1",
                "kind": "motor",
                "member": "m1",
                "s": 0.8,
                "mass": 0.1,
                "mount": {"kv": 5e4, "zeta": 0.05},
                "excitation": {"type": "unbalance", "me": 2e-6, "orders": [1.0]},
            }
        ],
        "analysis": {"n_elements_per_member": 10},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    rpm1 = 3000.0
    rpm2 = 6000.0

    F1 = build_force(model, design, rpm=rpm1, order=1.0)
    F2 = build_force(model, design, rpm=rpm2, order=1.0)

    ratio = np.max(np.abs(F2)) / np.max(np.abs(F1))
    print(f"\n--- Unbalance Scaling Check ---")
    print(f"Max Force at 3000 RPM: {np.max(np.abs(F1)):.6e} N")
    print(f"Max Force at 6000 RPM: {np.max(np.abs(F2)):.6e} N")
    print(f"Ratio F(2*rpm)/F(rpm): {ratio:.6f} (Expected: 4.000000)")

    assert np.isclose(ratio, 4.0, rtol=1e-8)


def test_chunking_invariance():
    """Chunking test: full_solve gives identical results for chunk = 1, 7, and 50."""
    design = {
        "name": "Chunk_Test",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": 0.3, "y": 0.0}],
        "members": [{"id": "m1", "n1": "n1", "n2": "n2", "material": "steel", "section": {"type": "rect", "w": 0.02, "h": 0.01}}],
        "supports": [{"node": "n1", "type": "fixed"}],
        "components": [
            {
                "id": "c1",
                "kind": "motor",
                "member": "m1",
                "s": 1.0,
                "mass": 0.2,
                "mount": {"kv": 5e4, "zeta": 0.08},
                "excitation": {"type": "unbalance", "me": 1e-4, "orders": [1.0]},
            }
        ],
        "analysis": {"n_elements_per_member": 10},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)
    C_ff = model.C[np.ix_(model.free_dofs, model.free_dofs)]

    rpms = np.linspace(1000.0, 6000.0, 35)
    omegas = 2.0 * np.pi * (rpms / 60.0)
    F_batch = np.array([build_force(model, design, rpm=r_val, order=1.0) for r_val in rpms], dtype=complex)

    X_chunk1 = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas, chunk=1)
    X_chunk7 = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas, chunk=7)
    X_chunk50 = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas, chunk=50)

    diff_1_7 = float(np.max(np.abs(X_chunk1 - X_chunk7)))
    diff_1_50 = float(np.max(np.abs(X_chunk1 - X_chunk50)))

    print(f"\n--- Chunking Invariance ---")
    print(f"Max difference (chunk 1 vs chunk 7):  {diff_1_7:.2e}")
    print(f"Max difference (chunk 1 vs chunk 50): {diff_1_50:.2e}")

    assert np.allclose(X_chunk1, X_chunk7, atol=1e-12)
    assert np.allclose(X_chunk1, X_chunk50, atol=1e-12)


def test_v7_rom_vs_full():
    """V7: ROM vs Full direct harmonic solve over 400 RPM points (500-12000 RPM).

    Evaluates error across r = 6, 8, 12, 16, 20.
    With default r, peak sensor acceleration error must be < 2%.
    """
    design = {
        "name": "Drone_Arm_V7",
        "plane": "xy",
        "nodes": [
            {"id": "n1", "x": -0.15, "y": 0.0},
            {"id": "n2", "x": 0.0, "y": 0.0},
            {"id": "n3", "x": 0.15, "y": 0.0},
        ],
        "members": [
            {"id": "m1", "n1": "n1", "n2": "n2", "material": "cfrp", "section": {"type": "rect", "w": 0.016, "h": 0.004}},
            {"id": "m2", "n1": "n2", "n2": "n3", "material": "cfrp", "section": {"type": "rect", "w": 0.016, "h": 0.004}},
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
        "analysis": {"rpm_min": 500.0, "rpm_max": 12000.0, "n_points": 400, "beam_zeta": 0.02, "n_elements_per_member": 20},
    }

    rpms = np.linspace(500.0, 12000.0, 400)
    omegas = 2.0 * np.pi * (rpms / 60.0)

    mesh = build_mesh(design)
    model = assemble(design, mesh)
    f_hz, Phi_ff, is_rb = modal_analysis(model.K_ff, model.M_ff)

    non_rigid = f_hz[~is_rb]
    f1 = float(non_rigid[0])
    f2 = max(1.5 * (12000.0 / 60.0), 3.0 * f1)
    C_ff = build_damping(model, zeta=0.02, f1_hz=f1, f2_hz=f2)

    F_batch = np.array([build_force(model, design, rpm=r_val, order=1.0) for r_val in rpms], dtype=complex)

    # 1. Full reference solve
    X_full_free = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
    X_ref = expand_to_full(model, X_full_free)
    _, a_sensor_ref = component_response(model, X_ref, "c2", omegas)
    peak_ref = float(np.max(a_sensor_ref))

    # 2. Test ROM for r in [6, 8, 12, 16, 20]
    table_rows = []
    r_candidates = [6, 8, 12, 16, 20]

    for r in r_candidates:
        Phi_r = Phi_ff[:, :r]
        X_rom_free = rom_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas, Phi_r)
        X_rom_full = expand_to_full(model, X_rom_free)
        _, a_sensor_rom = component_response(model, X_rom_full, "c2", omegas)

        peak_rom = float(np.max(a_sensor_rom))
        peak_err_pct = abs(peak_rom - peak_ref) / peak_ref * 100.0

        # Max relative error over the sweep where ref is significant (> 1% of peak)
        sig_mask = a_sensor_ref > 0.01 * peak_ref
        rel_errors = np.abs(a_sensor_rom[sig_mask] - a_sensor_ref[sig_mask]) / a_sensor_ref[sig_mask] * 100.0
        max_rel_err_pct = float(np.max(rel_errors))

        table_rows.append([f"r = {r}", f"{peak_rom:.4f} g", f"{peak_ref:.4f} g", f"{peak_err_pct:.3f}%", f"{max_rel_err_pct:.3f}%"])

    print_table(
        "V7: ROM Convergence vs Full Direct Solve (400 RPM Points)",
        ["Basis Size", "ROM Peak (g)", "Full Peak (g)", "Peak Error %", "Max Band Error %"],
        table_rows,
    )

    # Default pipeline solve
    res_pipeline = solve_design(design, rpm_array=rpms, method="rom")
    default_peak = float(np.max(res_pipeline.component_accel_g["c2"]))
    default_err = abs(default_peak - peak_ref) / peak_ref * 100.0

    print(f"\nDefault Pipeline: r = {res_pipeline.r_modes_kept} | Peak Error = {default_err:.3f}% (< 2.0%)")
    assert default_err < 2.0, f"V7 default ROM peak error {default_err:.3f}% exceeds 2.0%"


def test_sparse_vs_dense_solve():
    """Verify sparse direct solver full_solve_sparse matches full_solve on V7 drone arm structure."""
    design = {
        "name": "Drone_Arm_V7_Sparse_Check",
        "plane": "xy",
        "nodes": [
            {"id": "n1", "x": -0.15, "y": 0.0},
            {"id": "n2", "x": 0.0, "y": 0.0},
            {"id": "n3", "x": 0.15, "y": 0.0},
        ],
        "members": [
            {"id": "m1", "n1": "n1", "n2": "n2", "material": "cfrp", "section": {"type": "rect", "w": 0.016, "h": 0.004}},
            {"id": "m2", "n1": "n2", "n2": "n3", "material": "cfrp", "section": {"type": "rect", "w": 0.016, "h": 0.004}},
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
        "analysis": {"rpm_min": 500.0, "rpm_max": 12000.0, "n_points": 50, "beam_zeta": 0.02, "n_elements_per_member": 20},
    }

    rpms = np.linspace(500.0, 12000.0, 50)
    omegas = 2.0 * np.pi * (rpms / 60.0)

    mesh = build_mesh(design)
    model = assemble(design, mesh)
    f_hz, _, is_rb = modal_analysis(model.K_ff, model.M_ff)
    non_rigid = f_hz[~is_rb]
    f1 = float(non_rigid[0])
    f2 = max(1.5 * (12000.0 / 60.0), 3.0 * f1)
    C_ff = build_damping(model, zeta=0.02, f1_hz=f1, f2_hz=f2)

    from app.solver.harmonic import build_force_batch
    F_batch = build_force_batch(model, design, rpms=rpms, order=1.0)

    X_dense = full_solve(model.K_ff, C_ff, model.M_ff, F_batch, omegas)
    X_sparse = full_solve_sparse(model.K_ff, C_ff, model.M_ff, F_batch, omegas)

    max_diff = float(np.max(np.abs(X_dense - X_sparse)))
    print(f"\n--- Sparse vs Dense Solver Verification ---")
    print(f"Max absolute difference: {max_diff:.3e}")
    assert np.allclose(X_dense, X_sparse, rtol=1e-8, atol=1e-12), f"Sparse vs dense solve mismatch, max diff = {max_diff}"

