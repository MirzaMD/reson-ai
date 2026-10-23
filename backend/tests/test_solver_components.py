"""Physics and verification tests for components on spring-damper mounts (Milestone M2).

Covers:
- V4: SDOF component on rigid/fixed base vs analytical sqrt(k/m)/(2*pi) and dashpot c.
- V5: Coupled free-free body + component mode vs relative analytical formula.
- Decoupled multi-component mount modes on stiff beam.
- Rayleigh damping coefficients and curve behavior.
- Conditioning with rigid mount (k = 1e8 N/m).
- Symmetry and mass matrix positive definiteness with components.
"""

from typing import Any, Dict, List, Optional
import numpy as np
import pytest

from app.solver.assemble import assemble
from app.solver.damping import build_damping, rayleigh_coefficients
from app.solver.mesh import build_mesh
from app.solver.modal import axial_fraction, component_energy_fraction, mode_labels, modal_analysis


def print_comparison_table(test_name: str, labels: List[str], f_comp: List[float], f_ana: List[float]):
    print(f"\n--- {test_name} ---")
    print(f"{'Label':<16} | {'Computed (Hz)':<14} | {'Analytical (Hz)':<16} | {'Error (%)':<10}")
    print("-" * 62)
    for lbl, fc, fa in zip(labels, f_comp, f_ana):
        err = abs(fc - fa) / fa * 100.0 if fa > 0 else 0.0
        print(f"{lbl:<16} | {fc:<14.4f} | {fa:<16.4f} | {err:<10.4f}%")


def test_v4_sdof_mount():
    """V4: Component m = 1 kg, k = 1e5 N/m on fixed support (SDOF limit).

    Mount frequency must equal sqrt(k/m)/(2*pi) within 0.01%.
    Dashpot c = 2*zeta*sqrt(k*m) checked numerically.
    """
    m_val = 1.0
    k_val = 1e5
    zeta_val = 0.08
    expected_f = float(np.sqrt(k_val / m_val) / (2.0 * np.pi))
    expected_c = float(2.0 * zeta_val * np.sqrt(k_val * m_val))

    # Design with cantilever fixed at node 1 (s = 0.0)
    design = {
        "name": "SDOF_Test",
        "plane": "xy",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": 0.3, "y": 0.0}],
        "members": [
            {
                "id": "m1",
                "n1": "n1",
                "n2": "n2",
                "material": "steel",
                "section": {"type": "rect", "w": 0.05, "h": 0.05},
            }
        ],
        "supports": [{"node": "n1", "type": "fixed"}],
        "components": [
            {
                "id": "c1",
                "kind": "camera",
                "member": "m1",
                "s": 0.0,
                "mass": m_val,
                "mount": {"kv": k_val, "zeta": zeta_val},
            }
        ],
        "analysis": {"n_elements_per_member": 20},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    # 1. Check dashpot in damping matrix C
    # c1 DOF is model.comp_dof["c1"]
    yc = model.comp_dof["c1"]
    computed_c = float(model.C[yc, yc])
    print(f"\n--- V4 Dashpot Check ---")
    print(f"Computed c: {computed_c:.4f} N*s/m | Expected c: {expected_c:.4f} N*s/m")
    assert np.isclose(computed_c, expected_c, rtol=1e-5), f"Dashpot mismatch: {computed_c} vs {expected_c}"

    # 2. Modal analysis
    f_hz, Phi_ff, is_rb = modal_analysis(model.K_ff, model.M_ff)

    # Find component DOF in free DOFs
    comp_free_idx = [idx for idx, dof in enumerate(model.free_dofs) if dof == yc]
    comp_fracs = component_energy_fraction(Phi_ff, model.M_ff, comp_free_idx)

    # Mount mode is the mode dominated by component DOF
    mount_mode_idx = int(np.argmax(comp_fracs))
    computed_f = float(f_hz[mount_mode_idx])

    print_comparison_table(
        "V4: SDOF Component on Fixed Support",
        ["SDOF Mount Mode"],
        [computed_f],
        [expected_f],
    )

    err_pct = abs(computed_f - expected_f) / expected_f * 100.0
    assert err_pct < 0.01, f"V4 mount frequency error {err_pct:.4f}% exceeds 0.01% target"


def test_v5_coupled_body_and_component():
    """V5: Steel free-free beam with component at midspan (s = 0.5).

    L = 0.2 m, w = h = 0.05 m, 40 elements, component m = 2 kg, k = 2e5 N/m.
    Analytical relative mode: omega^2 = k*(M_b + m)/(m*M_b) where M_b = rho*A*L.
    Assert exactly 3 rigid-body modes and relative mode within 0.5%.
    """
    L = 0.2
    w = 0.05
    h = 0.05
    n_el = 40
    m_comp = 2.0
    k_mount = 2e5

    # Steel properties
    from app.presets import MATERIALS
    rho = MATERIALS["steel"]["rho"]
    M_b = rho * (w * h) * L  # 7850 * 0.0025 * 0.2 = 3.925 kg

    # Analytical formula for 2-body spring relative mode
    w2_analytical = k_mount * (M_b + m_comp) / (m_comp * M_b)
    f_analytical = float(np.sqrt(w2_analytical) / (2.0 * np.pi))

    design = {
        "name": "Coupled_V5_Test",
        "plane": "xy",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": L, "y": 0.0}],
        "members": [
            {
                "id": "m1",
                "n1": "n1",
                "n2": "n2",
                "material": "steel",
                "section": {"type": "rect", "w": w, "h": h},
            }
        ],
        "supports": [],  # Free-free
        "components": [
            {
                "id": "c1",
                "kind": "payload",
                "member": "m1",
                "s": 0.5,
                "mass": m_comp,
                "mount": {"kv": k_mount, "zeta": 0.05},
            }
        ],
        "analysis": {"n_elements_per_member": n_el},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    f_hz, Phi_ff, is_rb = modal_analysis(model.K_ff, model.M_ff)

    # 1. Assert exactly 3 rigid-body modes
    n_rb = int(np.sum(is_rb[:4]))
    assert n_rb == 3, f"Expected 3 rigid body modes, got {n_rb}"

    # 2. Identify mount mode using component_energy_fraction and mode_labels
    comp_free_idx = [idx for idx, dof in enumerate(model.free_dofs) if dof == model.comp_dof["c1"]]
    axial_free_idx = [idx for idx, dof in enumerate(model.free_dofs) if dof < mesh.n_dofs and dof % 3 == 0]

    labels = mode_labels(f_hz, Phi_ff, model.M_ff, is_rb, axial_free_idx, comp_free_idx)

    # Find the mount mode
    mount_indices = [idx for idx, lbl in enumerate(labels) if lbl == "mount mode"]
    assert len(mount_indices) >= 1, "Did not identify any mount mode"

    mount_idx = mount_indices[0]
    computed_f = float(f_hz[mount_idx])

    print_comparison_table(
        "V5: Coupled Free-Free Beam + Midspan Component",
        [labels[mount_idx]],
        [computed_f],
        [f_analytical],
    )

    err_pct = abs(computed_f - f_analytical) / f_analytical * 100.0
    print(f"Beam mass M_b = {M_b:.4f} kg | Comp mass = {m_comp:.4f} kg | Mount f = {computed_f:.4f} Hz")
    assert err_pct < 0.5, f"V5 coupled frequency error {err_pct:.3f}% exceeds 0.5% target"


def test_two_components_on_stiff_beam():
    """Two components at s = 0.25 and s = 0.75 on a very stiff fixed-fixed beam.

    Each component mode should match its decoupled sqrt(k/m)/(2*pi) within 0.5%.
    """
    m1 = 0.5
    k1 = 5e4
    f1_expected = float(np.sqrt(k1 / m1) / (2.0 * np.pi))

    m2 = 1.2
    k2 = 1.2e5
    f2_expected = float(np.sqrt(k2 / m2) / (2.0 * np.pi))

    design = {
        "name": "Two_Components_Stiff",
        "plane": "xy",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": 0.3, "y": 0.0}],
        "members": [
            {
                "id": "m1",
                "n1": "n1",
                "n2": "n2",
                "material": "steel",
                "section": {"type": "rect", "w": 0.08, "h": 0.08},
            }
        ],
        "supports": [
            {"node": "n1", "type": "fixed"},
            {"node": "n2", "type": "fixed"},
        ],
        "components": [
            {
                "id": "c1",
                "kind": "sensor1",
                "member": "m1",
                "s": 0.25,
                "mass": m1,
                "mount": {"kv": k1, "zeta": 0.05},
            },
            {
                "id": "c2",
                "kind": "sensor2",
                "member": "m1",
                "s": 0.75,
                "mass": m2,
                "mount": {"kv": k2, "zeta": 0.05},
            },
        ],
        "analysis": {"n_elements_per_member": 20},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    f_hz, Phi_ff, is_rb = modal_analysis(model.K_ff, model.M_ff)

    # First two modes should be the two decoupled component modes (since beam modes > 1000 Hz)
    f_comp_1 = float(f_hz[0])
    f_comp_2 = float(f_hz[1])

    # Sort matching
    computed_sorted = sorted([f_comp_1, f_comp_2])
    expected_sorted = sorted([f1_expected, f2_expected])

    print_comparison_table(
        "Two Decoupled Components on Stiff Base",
        ["Mount 1", "Mount 2"],
        computed_sorted,
        expected_sorted,
    )

    for fc, fe in zip(computed_sorted, expected_sorted):
        err = abs(fc - fe) / fe * 100.0
        assert err < 0.5, f"Component error {err:.3f}% exceeds 0.5%"


def test_rayleigh_damping():
    """Rayleigh damping: zeta(w) = alpha/(2w) + beta*w/2 matches target at f1 and f2, and is lower between them."""
    zeta_target = 0.03
    f1 = 20.0
    f2 = 180.0
    alpha, beta = rayleigh_coefficients(zeta_target, f1, f2)

    w1 = 2.0 * np.pi * f1
    w2 = 2.0 * np.pi * f2

    zeta_at_w1 = alpha / (2.0 * w1) + beta * w1 / 2.0
    zeta_at_w2 = alpha / (2.0 * w2) + beta * w2 / 2.0

    print(f"\n--- Rayleigh Damping Check ---")
    print(f"Target zeta: {zeta_target} | alpha: {alpha:.5f} | beta: {beta:.5e}")
    print(f"zeta(w1): {zeta_at_w1:.9f} (diff: {abs(zeta_at_w1 - zeta_target):.2e})")
    print(f"zeta(w2): {zeta_at_w2:.9f} (diff: {abs(zeta_at_w2 - zeta_target):.2e})")

    assert np.isclose(zeta_at_w1, zeta_target, atol=1e-9)
    assert np.isclose(zeta_at_w2, zeta_target, atol=1e-9)

    # Intermediate frequency check (geometric mean)
    w_mid = np.sqrt(w1 * w2)
    zeta_mid = alpha / (2.0 * w_mid) + beta * w_mid / 2.0
    print(f"zeta(mid): {zeta_mid:.6f} < target {zeta_target}")
    assert zeta_mid < zeta_target


def test_rigid_mount_conditioning():
    """Conditioning: rigid mount k = 1e8 N/m solves cleanly without error."""
    design = {
        "name": "Rigid_Mount_Conditioning",
        "plane": "xy",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": 0.5, "y": 0.0}],
        "members": [
            {
                "id": "m1",
                "n1": "n1",
                "n2": "n2",
                "material": "aluminium_6061",
                "section": {"type": "rect", "w": 0.02, "h": 0.02},
            }
        ],
        "supports": [{"node": "n1", "type": "fixed"}],
        "components": [
            {
                "id": "rigid_comp",
                "kind": "heavy_motor",
                "member": "m1",
                "s": 0.5,
                "mass": 0.5,
                "mount": {"kv": 1e8, "zeta": 0.01},
            }
        ],
        "analysis": {"n_elements_per_member": 20},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    cond_K = float(np.linalg.cond(model.K_ff))
    f_hz, Phi_ff, is_rb = modal_analysis(model.K_ff, model.M_ff)

    assert not np.any(np.isnan(f_hz)), "Eigenvalues contain NaN"
    assert not np.any(np.isinf(f_hz)), "Eigenvalues contain Inf"
    assert np.all(f_hz >= 0.0), "Found negative frequencies"

    print(f"\n--- Rigid Mount Conditioning ---")
    print(f"K_ff condition number: {cond_K:.2e} | Lowest 3 frequencies: {f_hz[:3].round(2)} Hz")


def test_symmetry_and_positive_definiteness_with_components():
    """Verify symmetry and positive definiteness of matrices when components are coupled."""
    design = {
        "name": "Symm_Check",
        "plane": "xy",
        "nodes": [{"id": "n1", "x": 0.0, "y": 0.0}, {"id": "n2", "x": 0.4, "y": 0.0}],
        "members": [
            {
                "id": "m1",
                "n1": "n1",
                "n2": "n2",
                "material": "cfrp",
                "section": {"type": "rect", "w": 0.016, "h": 0.004},
            }
        ],
        "supports": [{"node": "n1", "type": "spring", "kx": 1000, "ky": 1000, "kr": 10}],
        "components": [
            {"id": "c1", "kind": "motor", "member": "m1", "s": 0.2, "mass": 0.05, "mount": {"kv": 5e4, "zeta": 0.08}},
            {"id": "c2", "kind": "camera", "member": "m1", "s": 0.8, "mass": 0.15, "mount": {"kv": 3e4, "zeta": 0.15}},
        ],
        "analysis": {"n_elements_per_member": 20},
    }

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    # Symmetry
    assert np.allclose(model.K, model.K.T, rtol=1e-10, atol=1e-10)
    assert np.allclose(model.M, model.M.T, rtol=1e-10, atol=1e-10)
    assert np.allclose(model.C, model.C.T, rtol=1e-10, atol=1e-10)

    # Positive definiteness of mass matrix
    eigvals_M = np.linalg.eigvalsh(model.M_ff)
    min_eig_M = np.min(eigvals_M)
    assert min_eig_M > 0.0, f"Mass matrix has non-positive eigenvalue: {min_eig_M}"

    print(f"\n--- Matrix Sanity with Components ---")
    print(f"K symmetric: True | M symmetric: True | C symmetric: True | Min M eigenvalue: {min_eig_M:.6e}")
