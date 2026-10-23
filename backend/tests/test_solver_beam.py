"""Physics and verification tests for 2D Euler-Bernoulli beam elements, assembly, and modal analysis.

Covers V1 (simply supported), V2 (cantilever), V3 (free-free & fixed-fixed), rotation invariance,
matrix symmetry, positive-definiteness, and exact mesh node insertion at component fractions.
"""

from typing import Any, Dict, List, Optional
import numpy as np
import pytest

from app.solver.assemble import assemble
from app.solver.mesh import build_mesh
from app.solver.modal import axial_fraction, modal_analysis
from app.validation.analytical import BETA_CANT, BETA_FF, beam_f, ss_beam_f


def make_beam_design(
    length: float = 1.0,
    n_el: int = 40,
    supports: Optional[List[Dict[str, Any]]] = None,
    angle_deg: float = 0.0,
    components: Optional[List[Dict[str, Any]]] = None,
    w: float = 0.02,
    h: float = 0.01,
    material: str = "aluminium_6061",
) -> Dict[str, Any]:
    """Helper creating a contract-valid beam design dictionary."""
    rad = np.radians(angle_deg)
    x2 = float(length * np.cos(rad))
    y2 = float(length * np.sin(rad))

    nodes = [
        {"id": "n1", "x": 0.0, "y": 0.0},
        {"id": "n2", "x": round(x2, 8), "y": round(y2, 8)},
    ]

    members = [
        {
            "id": "m1",
            "n1": "n1",
            "n2": "n2",
            "material": material,
            "section": {"type": "rect", "w": w, "h": h},
        }
    ]

    return {
        "name": f"Beam_{length}m_{angle_deg}deg",
        "plane": "xy",
        "nodes": nodes,
        "members": members,
        "supports": supports or [],
        "components": components or [],
        "analysis": {
            "rpm_min": 500.0,
            "rpm_max": 12000.0,
            "n_points": 400,
            "beam_zeta": 0.02,
            "n_elements_per_member": n_el,
        },
    }


def print_comparison_table(test_name: str, modes: List[int], f_comp: List[float], f_ana: List[float]):
    print(f"\n--- {test_name} ---")
    print(f"{'Mode':<6} | {'Computed (Hz)':<14} | {'Analytical (Hz)':<16} | {'Error (%)':<10}")
    print("-" * 54)
    for m, fc, fa in zip(modes, f_comp, f_ana):
        err = abs(fc - fa) / fa * 100.0
        print(f"{m:<6} | {fc:<14.4f} | {fa:<16.4f} | {err:<10.3f}%")


def test_v1_simply_supported():
    """V1: Simply supported beam (pinned at n1, roller at n2).

    First 3 bending modes within 1% of the Euler-Bernoulli analytical formula.
    Axial modes are identified and skipped via axial_fraction.
    """
    L = 1.0
    w = 0.02
    h = 0.01
    n_el = 40
    design = make_beam_design(
        length=L,
        n_el=n_el,
        supports=[
            {"node": "n1", "type": "pinned"},
            {"node": "n2", "type": "roller"},
        ],
        w=w,
        h=h,
    )

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    f_hz, Phi_ff, is_rb = modal_analysis(model.K_ff, model.M_ff)

    # Global axial DOFs are 3*i (along x). Identify free DOFs that correspond to global axial DOFs
    axial_free_indices = [
        idx for idx, global_dof in enumerate(model.free_dofs) if global_dof % 3 == 0
    ]
    ax_fracs = axial_fraction(Phi_ff, model.M_ff, axial_free_indices)

    # Filter out axial modes (axial_fraction > 0.5) and rigid-body modes
    bending_freqs: List[float] = []
    for f, ax_f, rb in zip(f_hz, ax_fracs, is_rb):
        if not rb and ax_f <= 0.5:
            bending_freqs.append(f)
        if len(bending_freqs) == 3:
            break

    assert len(bending_freqs) >= 3, "Did not find 3 transverse bending modes"

    # Analytical values
    from app.presets import MATERIALS

    E = MATERIALS["aluminium_6061"]["E"]
    rho = MATERIALS["aluminium_6061"]["rho"]
    A = w * h
    I = w * (h**3) / 12.0

    analytical_f = [ss_beam_f(n, E, I, rho, A, L) for n in [1, 2, 3]]
    computed_f = bending_freqs[:3]

    print_comparison_table("V1: Simply Supported Beam (40 Elements)", [1, 2, 3], computed_f, analytical_f)

    for i in range(3):
        error_pct = abs(computed_f[i] - analytical_f[i]) / analytical_f[i] * 100.0
        assert error_pct < 1.0, f"Mode {i+1} error {error_pct:.2f}% exceeds 1% target"


def test_v2_cantilever():
    """V2: Cantilever beam (fixed at n1).

    First 3 bending modes within 1% of the analytical values using BETA_CANT.
    """
    L = 1.0
    w = 0.02
    h = 0.01
    n_el = 40
    design = make_beam_design(
        length=L,
        n_el=n_el,
        supports=[{"node": "n1", "type": "fixed"}],
        w=w,
        h=h,
    )

    mesh = build_mesh(design)
    model = assemble(design, mesh)

    f_hz, Phi_ff, is_rb = modal_analysis(model.K_ff, model.M_ff)

    axial_free_indices = [
        idx for idx, global_dof in enumerate(model.free_dofs) if global_dof % 3 == 0
    ]
    ax_fracs = axial_fraction(Phi_ff, model.M_ff, axial_free_indices)

    bending_freqs: List[float] = []
    for f, ax_f, rb in zip(f_hz, ax_fracs, is_rb):
        if not rb and ax_f <= 0.5:
            bending_freqs.append(f)
        if len(bending_freqs) == 3:
            break

    from app.presets import MATERIALS

    E = MATERIALS["aluminium_6061"]["E"]
    rho = MATERIALS["aluminium_6061"]["rho"]
    A = w * h
    I = w * (h**3) / 12.0

    analytical_f = [beam_f(beta, E, I, rho, A, L) for beta in BETA_CANT]
    computed_f = bending_freqs[:3]

    print_comparison_table("V2: Cantilever Beam (40 Elements)", [1, 2, 3], computed_f, analytical_f)

    for i in range(3):
        error_pct = abs(computed_f[i] - analytical_f[i]) / analytical_f[i] * 100.0
        assert error_pct < 1.0, f"Mode {i+1} error {error_pct:.2f}% exceeds 1% target"


def test_v3_free_free_and_fixed_fixed():
    """V3: Free-free (no supports) and Fixed-fixed beam.

    Free-free: skip 3 rigid body modes, next 3 bending modes within 1% of BETA_FF.
    Fixed-fixed: first 3 bending modes within 1% of BETA_FF.
    """
    L = 1.0
    w = 0.02
    h = 0.01
    n_el = 40

    from app.presets import MATERIALS

    E = MATERIALS["aluminium_6061"]["E"]
    rho = MATERIALS["aluminium_6061"]["rho"]
    A = w * h
    I = w * (h**3) / 12.0

    analytical_f = [beam_f(beta, E, I, rho, A, L) for beta in BETA_FF]

    # --- Free-Free ---
    ff_design = make_beam_design(length=L, n_el=n_el, supports=[], w=w, h=h)
    mesh_ff = build_mesh(ff_design)
    model_ff = assemble(ff_design, mesh_ff)

    f_hz_ff, Phi_ff, is_rb_ff = modal_analysis(model_ff.K_ff, model_ff.M_ff)

    axial_dofs_ff = [
        idx for idx, global_dof in enumerate(model_ff.free_dofs) if global_dof % 3 == 0
    ]
    ax_fracs_ff = axial_fraction(Phi_ff, model_ff.M_ff, axial_dofs_ff)

    # First 3 should be rigid-body modes (f ~ 0 Hz)
    num_rb = np.sum(is_rb_ff[:3])
    assert num_rb == 3, f"Expected 3 rigid-body modes for free-free beam, found {num_rb}"

    bending_ff: List[float] = []
    for f, ax_f, rb in zip(f_hz_ff, ax_fracs_ff, is_rb_ff):
        if not rb and ax_f <= 0.5:
            bending_ff.append(f)
        if len(bending_ff) == 3:
            break

    print_comparison_table("V3: Free-Free Beam (40 Elements)", [1, 2, 3], bending_ff[:3], analytical_f)

    for i in range(3):
        error_pct = abs(bending_ff[i] - analytical_f[i]) / analytical_f[i] * 100.0
        assert error_pct < 1.0, f"Free-free mode {i+1} error {error_pct:.2f}% exceeds 1%"

    # --- Fixed-Fixed ---
    fix_design = make_beam_design(
        length=L,
        n_el=n_el,
        supports=[
            {"node": "n1", "type": "fixed"},
            {"node": "n2", "type": "fixed"},
        ],
        w=w,
        h=h,
    )
    mesh_fix = build_mesh(fix_design)
    model_fix = assemble(fix_design, mesh_fix)

    f_hz_fix, Phi_fix, is_rb_fix = modal_analysis(model_fix.K_ff, model_fix.M_ff)
    axial_dofs_fix = [
        idx for idx, global_dof in enumerate(model_fix.free_dofs) if global_dof % 3 == 0
    ]
    ax_fracs_fix = axial_fraction(Phi_fix, model_fix.M_ff, axial_dofs_fix)

    bending_fix: List[float] = []
    for f, ax_f, rb in zip(f_hz_fix, ax_fracs_fix, is_rb_fix):
        if not rb and ax_f <= 0.5:
            bending_fix.append(f)
        if len(bending_fix) == 3:
            break

    print_comparison_table("V3: Fixed-Fixed Beam (40 Elements)", [1, 2, 3], bending_fix[:3], analytical_f)

    for i in range(3):
        error_pct = abs(bending_fix[i] - analytical_f[i]) / analytical_f[i] * 100.0
        assert error_pct < 1.0, f"Fixed-fixed mode {i+1} error {error_pct:.2f}% exceeds 1%"


def test_rotation_invariance():
    """Rotation test: A cantilever at 30 degrees must yield identical bending frequencies (within 0.1%)."""
    L = 1.0
    w = 0.02
    h = 0.01
    n_el = 40

    design_0 = make_beam_design(
        length=L, n_el=n_el, supports=[{"node": "n1", "type": "fixed"}], angle_deg=0.0, w=w, h=h
    )
    mesh_0 = build_mesh(design_0)
    model_0 = assemble(design_0, mesh_0)
    f_0, _, _ = modal_analysis(model_0.K_ff, model_0.M_ff, n_modes=3)

    design_30 = make_beam_design(
        length=L, n_el=n_el, supports=[{"node": "n1", "type": "fixed"}], angle_deg=30.0, w=w, h=h
    )
    mesh_30 = build_mesh(design_30)
    model_30 = assemble(design_30, mesh_30)
    f_30, _, _ = modal_analysis(model_30.K_ff, model_30.M_ff, n_modes=3)

    print_comparison_table(
        "Rotation Invariance: Cantilever 0 deg vs 30 deg",
        [1, 2, 3],
        f_30.tolist(),
        f_0.tolist(),
    )

    for i in range(3):
        diff_pct = abs(f_30[i] - f_0[i]) / f_0[i] * 100.0
        assert diff_pct < 0.1, f"Mode {i+1} difference between 0 and 30 deg is {diff_pct:.4f}%"


def test_symmetry_and_positive_definiteness():
    """Matrix checks: K and M must be symmetric; M must be positive definite."""
    design = make_beam_design(length=1.0, n_el=20, supports=[])
    mesh = build_mesh(design)
    model = assemble(design, mesh)

    # 1. Symmetry
    assert np.allclose(model.K, model.K.T, rtol=1e-11, atol=1e-11), "K is not symmetric"
    assert np.allclose(model.M, model.M.T, rtol=1e-11, atol=1e-11), "M is not symmetric"

    # 2. Positive definiteness of Mass matrix
    eigvals_M = np.linalg.eigvalsh(model.M)
    min_eig_M = np.min(eigvals_M)
    assert min_eig_M > 0.0, f"M has non-positive eigenvalue: {min_eig_M}"
    print(f"\n--- Symmetry & Positive Definiteness ---")
    print(f"K symmetric: True | M symmetric: True | M min eigenvalue: {min_eig_M:.6e} > 0")


def test_mesh_component_exact_placement():
    """Mesh test: Component at s = 0.37 must produce a mesh node at exactly 0.37 * length."""
    L = 1.0
    s_target = 0.37
    design = make_beam_design(
        length=L,
        n_el=20,
        components=[
            {
                "id": "sensor_1",
                "kind": "camera",
                "member": "m1",
                "s": s_target,
                "mass": 0.1,
            }
        ],
    )

    mesh = build_mesh(design)
    assert "sensor_1" in mesh.component_node_map, "Component 'sensor_1' not mapped to mesh node"
    node_idx = mesh.component_node_map["sensor_1"]
    mesh_node = mesh.nodes[node_idx]

    expected_x = s_target * L
    print(f"\n--- Component Mesh Placement ---")
    print(f"Component 'sensor_1' placed at x = {mesh_node.x:.6f} m (Expected: {expected_x:.6f} m)")

    assert np.isclose(mesh_node.x, expected_x, atol=1e-6), (
        f"Mesh node x coordinate {mesh_node.x} does not match expected {expected_x}"
    )
    assert mesh_node.member == "m1"
    assert np.isclose(mesh_node.s, s_target, atol=1e-6)
