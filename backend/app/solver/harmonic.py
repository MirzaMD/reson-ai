"""Harmonic response solver: direct full solve (dense & sparse) and modal Reduced Order Model (ROM) solve.

Conventions and Physics:
- Sign convention: u(t) = Re(X * e^{+i*w*t})
- System equation solved: (K + i*w*C - w^2*M) * X = F
- X: Complex displacement amplitude vector (peak basis).
- Acceleration amplitude: a_peak = w^2 * |X| (in m/s^2), or in g (divide by 9.80665).
- Acceleration basis: internal arrays stay peak amplitude; helper converts to RMS (RMS = peak / sqrt(2)).
"""

from typing import Any, Callable, Dict, List, Optional, Tuple, Union
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from threadpoolctl import threadpool_limits

from app.solver.assemble import Model

# Global physical acceleration of gravity in m/s^2
GRAVITY = 9.80665

# Acceleration reporting basis: "rms" or "peak"
ACCEL_BASIS = "rms"

# Configurable order weighting for higher motor harmonics (order > 1)
ORDER_WEIGHT_HIGHER = 0.2


def to_accel_basis(a_peak: Union[float, np.ndarray], basis: str = ACCEL_BASIS) -> Union[float, np.ndarray]:
    """Convert peak acceleration to the configured reporting basis ('rms' or 'peak')."""
    if basis == "rms":
        return a_peak / np.sqrt(2.0)
    return a_peak


def build_unit_force(
    model: Model,
    design: Union[Dict[str, Any], Any],
    order: float = 1.0,
) -> np.ndarray:
    """Precompute the static unit unbalance force vector pattern F_unit in free-DOF space.

    For component j:
        F_unit[yc] = weight * (m * e)
    Then at any frequency w:
        F(w) = w^2 * F_unit
    """
    if hasattr(design, "model_dump"):
        d = design.model_dump()
    elif isinstance(design, dict):
        d = design
    else:
        d = vars(design)

    n_total = model.K.shape[0]
    F_full = np.zeros(n_total, dtype=complex)

    order_weight = 1.0 if np.isclose(order, 1.0) else ORDER_WEIGHT_HIGHER

    components = d.get("components", [])
    for comp in components:
        if hasattr(comp, "model_dump"):
            c_dict = comp.model_dump()
        else:
            c_dict = comp

        cid = c_dict["id"]
        excitation = c_dict.get("excitation")
        if not excitation:
            continue

        if hasattr(excitation, "model_dump"):
            exc_dict = excitation.model_dump()
        elif isinstance(excitation, dict):
            exc_dict = excitation
        else:
            exc_dict = vars(excitation)

        etype = exc_dict.get("type", "unbalance")
        if etype == "unbalance":
            me = float(exc_dict.get("me", 0.0))
            if me > 0.0:
                yc = model.comp_dof[cid]
                f_unit = order_weight * me
                F_full[yc] += f_unit

    return F_full[model.free_dofs]


def build_force_batch(
    model: Model,
    design: Union[Dict[str, Any], Any],
    rpms: Union[List[float], np.ndarray],
    order: float = 1.0,
) -> np.ndarray:
    """Vectorized force matrix calculation of shape (n_freq, n_free) across all RPMs."""
    rpms_arr = np.asarray(rpms, dtype=float)
    omegas = 2.0 * np.pi * float(order) * (rpms_arr / 60.0)
    F_unit = build_unit_force(model, design, order=order)
    return (omegas**2)[:, np.newaxis] * F_unit[np.newaxis, :]


def build_force(
    model: Model,
    design: Union[Dict[str, Any], Any],
    rpm: float,
    order: float = 1.0,
) -> np.ndarray:
    """Build the complex external force vector F(w) in free-DOF space for a single RPM and harmonic order."""
    w_exc = 2.0 * np.pi * float(order) * (float(rpm) / 60.0)
    F_unit = build_unit_force(model, design, order=order)
    return (w_exc**2) * F_unit


def full_solve(
    K: np.ndarray,
    C: np.ndarray,
    M: np.ndarray,
    force_fn: Union[Callable[[float], np.ndarray], np.ndarray],
    omegas: Union[List[float], np.ndarray],
    chunk: Optional[int] = None,
) -> np.ndarray:
    """Direct dense full solve: (K + i*w*C - w^2*M) * X = F(w).

    Solves frequency response in chunks bounded to ~200 MB memory using stacked broadcasting.
    Uses threadpool_limits(limits=1) only when n_free <= 300 to avoid OpenBLAS thread thrashing.

    Returns:
        X: complex ndarray of shape (n_freq, n_free)
    """
    omegas_arr = np.asarray(omegas, dtype=float)
    n_freq = len(omegas_arr)
    n_free = K.shape[0]

    X = np.empty((n_freq, n_free), dtype=complex)
    if n_freq == 0 or n_free == 0:
        return X

    if callable(force_fn):
        F_all = np.array([force_fn(w) for w in omegas_arr], dtype=complex)
    else:
        F_all = np.asarray(force_fn, dtype=complex)

    # Calculate optimal chunk size to keep batch memory under ~200 MB
    bytes_per_matrix = 16 * n_free * n_free
    max_chunk_for_200mb = max(1, int(200_000_000 / max(1, bytes_per_matrix)))
    chunk_size = min(chunk, max_chunk_for_200mb) if chunk is not None else max_chunk_for_200mb

    # Limit BLAS threads to 1 only for small matrices (<= 300 DOFs)
    limit_threads = n_free <= 300

    for start_idx in range(0, n_freq, chunk_size):
        end_idx = min(start_idx + chunk_size, n_freq)
        batch_w = omegas_arr[start_idx:end_idx]

        # Vectorized 3D system construction via NumPy broadcasting (no Python inner loop)
        w_col = batch_w[:, np.newaxis, np.newaxis]
        A_batch = K[np.newaxis, :, :] + (1j * w_col) * C[np.newaxis, :, :] - (w_col**2) * M[np.newaxis, :, :]

        B_batch = F_all[start_idx:end_idx]
        if limit_threads:
            with threadpool_limits(limits=1, user_api="blas"):
                sol = np.linalg.solve(A_batch, B_batch[..., np.newaxis])
        else:
            sol = np.linalg.solve(A_batch, B_batch[..., np.newaxis])

        X[start_idx:end_idx] = sol.squeeze(-1)

    return X


def full_solve_sparse(
    K: Union[np.ndarray, sp.spmatrix],
    C: Union[np.ndarray, sp.spmatrix],
    M: Union[np.ndarray, sp.spmatrix],
    force_fn: Union[Callable[[float], np.ndarray], np.ndarray],
    omegas: Union[List[float], np.ndarray],
) -> np.ndarray:
    """Direct sparse full solve: (K + i*w*C - w^2*M) * X = F(w).

    Builds dynamic stiffness matrices in CSC sparse format and solves per frequency using SuperLU.
    Returns:
        X: complex ndarray of shape (n_freq, n_free)
    """
    omegas_arr = np.asarray(omegas, dtype=float)
    n_freq = len(omegas_arr)
    n_free = K.shape[0]

    X = np.empty((n_freq, n_free), dtype=complex)
    if n_freq == 0 or n_free == 0:
        return X

    if callable(force_fn):
        F_all = np.array([force_fn(w) for w in omegas_arr], dtype=complex)
    else:
        F_all = np.asarray(force_fn, dtype=complex)

    K_csc = sp.csc_matrix(K)
    C_csc = sp.csc_matrix(C)
    M_csc = sp.csc_matrix(M)

    for i, w in enumerate(omegas_arr):
        A_w = K_csc + (1j * w) * C_csc - (w**2) * M_csc
        X[i] = spla.spsolve(A_w, F_all[i])

    return X


def rom_basis(
    Phi: np.ndarray,
    f_hz: np.ndarray,
    f_exc_max: float,
    r_min: int = 12,
    r_max: int = 20,
) -> Tuple[np.ndarray, int]:
    """Select the reduced modal basis Phi_r from mode shapes.

    Keeps all rigid-body modes plus structural modes up to 1.5 * f_exc_max,
    bounded between r_min (default 12) and r_max (default 20).

    Returns:
        Phi_r: ndarray of shape (n_free, r)
        r: integer number of kept modes
    """
    n_total_modes = Phi.shape[1]
    if n_total_modes == 0:
        return np.empty((Phi.shape[0], 0), dtype=float), 0

    f_cutoff = 1.5 * max(f_exc_max, 1.0)

    # Count modes below cutoff
    idx_cutoff = int(np.searchsorted(f_hz, f_cutoff, side="right"))
    r = max(r_min, idx_cutoff)
    r = min(r, r_max, n_total_modes)

    Phi_r = Phi[:, :r]
    return Phi_r, r


def rom_solve(
    K: np.ndarray,
    C: np.ndarray,
    M: np.ndarray,
    force_fn: Union[Callable[[float], np.ndarray], np.ndarray],
    omegas: Union[List[float], np.ndarray],
    Phi_r: np.ndarray,
) -> np.ndarray:
    """Reduced Order Model (ROM) modal solve.

    Projects K, C, M, and F onto Phi_r:
        K_r = Phi_r.T @ K @ Phi_r
        C_r = Phi_r.T @ C @ Phi_r  (projected directly, not assumed diagonal)
        M_r = Phi_r.T @ M @ Phi_r
    Solves (K_r + i*w*C_r - w^2*M_r) * Q = F_r vectorised over all frequencies,
    then expands back to the full free-DOF space: X_free = Q @ Phi_r.T.

    Returns:
        X_free: complex ndarray of shape (n_freq, n_free)
    """
    omegas_arr = np.asarray(omegas, dtype=float)
    n_freq = len(omegas_arr)
    n_free, r = Phi_r.shape

    if r == 0 or n_free == 0 or n_freq == 0:
        return np.zeros((n_freq, n_free), dtype=complex)

    # 1. Project system matrices (r x r)
    Kr = Phi_r.T @ K @ Phi_r
    Cr = Phi_r.T @ C @ Phi_r
    Mr = Phi_r.T @ M @ Phi_r

    # 2. Build vectorized 3D reduced system: shape (n_freq, r, r)
    w_col = omegas_arr[:, np.newaxis, np.newaxis]
    A_r = Kr[np.newaxis, :, :] + (1j * w_col) * Cr[np.newaxis, :, :] - (w_col**2) * Mr[np.newaxis, :, :]

    # 3. Project forces: shape (n_freq, r)
    if callable(force_fn):
        F_list = [force_fn(w) for w in omegas_arr]
        F_full_batch = np.array(F_list, dtype=complex)  # (n_freq, n_free)
    else:
        F_full_batch = np.asarray(force_fn, dtype=complex)

    Fr = F_full_batch @ Phi_r  # (n_freq, r)

    # 4. Vectorised solve for modal coordinates Q (r <= 20, runs in < 0.5 ms)
    sol_q = np.linalg.solve(A_r, Fr[..., np.newaxis])
    Q = sol_q.squeeze(-1)  # (n_freq, r)

    # 5. Expand back to full free-DOF displacements: X = Q @ Phi_r.T
    X_free = Q @ Phi_r.T  # (n_freq, n_free)
    return X_free


def expand_to_full(model: Model, X_free: np.ndarray) -> np.ndarray:
    """Expand displacements from free DOFs to all global DOFs using model.expand().

    Returns:
        X_full: shape (n_freq, n_total)
    """
    return model.expand(X_free)


def component_response(
    model: Model,
    X_full: np.ndarray,
    comp_id: str,
    omegas: Union[List[float], np.ndarray],
    basis: str = ACCEL_BASIS,
) -> Tuple[np.ndarray, np.ndarray]:
    """Extract component displacement amplitude (m) and acceleration amplitude (in g).

    Returns:
        (disp_amp_m, accel_amp_g)
    """
    if comp_id not in model.comp_dof:
        raise ValueError(f"Component '{comp_id}' not found in model DOF map")

    yc = model.comp_dof[comp_id]
    disp_complex = X_full[:, yc]
    disp_amp_m = np.abs(disp_complex)

    omegas_arr = np.asarray(omegas, dtype=float)
    accel_peak_m_s2 = (omegas_arr**2) * disp_amp_m
    accel_peak_g = accel_peak_m_s2 / GRAVITY
    accel_reported_g = to_accel_basis(accel_peak_g, basis=basis)

    return disp_amp_m, accel_reported_g


def transmitted_force(
    model: Model,
    X_full: np.ndarray,
    comp_id: str,
    omegas: Union[List[float], np.ndarray],
    kv: float,
    zeta: float,
    m_c: float,
) -> np.ndarray:
    """Calculate the transmitted force amplitude (N) from a mount into the supporting structure.

    F_T(w) = |(kv + i * w * c) * (y_c - v_b)|
    where v_b is zero if the corresponding beam node is constrained.
    """
    if comp_id not in model.comp_dof:
        raise ValueError(f"Component '{comp_id}' not found in model")

    yc = model.comp_dof[comp_id]
    vb = model.comp_beam_v[comp_id]

    c_dashpot = 2.0 * zeta * np.sqrt(kv * m_c)
    omegas_arr = np.asarray(omegas, dtype=float)

    u_yc = X_full[:, yc]
    u_vb = X_full[:, vb]
    rel_disp = u_yc - u_vb

    mount_dyn_stiffness = kv + 1j * omegas_arr * c_dashpot
    F_trans_complex = mount_dyn_stiffness * rel_disp
    return np.abs(F_trans_complex)


def node_response(
    model: Model,
    X_full: np.ndarray,
) -> Dict[str, Dict[str, np.ndarray]]:
    """Extract complex displacement arrays [ux, uy, rot] for each mesh node.

    Returns:
        dict mapping node_id -> {"ux": ndarray, "uy": ndarray, "rot": ndarray}
    """
    res: Dict[str, Dict[str, np.ndarray]] = {}
    for i, node in enumerate(model.mesh.nodes):
        u_dof = 3 * i
        v_dof = 3 * i + 1
        th_dof = 3 * i + 2
        res[node.id] = {
            "ux": X_full[:, u_dof],
            "uy": X_full[:, v_dof],
            "rot": X_full[:, th_dof],
        }
    return res


def combine_orders(responses_by_order: List[np.ndarray]) -> np.ndarray:
    """Combine response arrays across multiple harmonic orders taking maximum amplitude per frequency."""
    if not responses_by_order:
        return np.array([])
    stacked = np.stack(responses_by_order, axis=0)
    return np.max(stacked, axis=0)
