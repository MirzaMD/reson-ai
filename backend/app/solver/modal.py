"""Modal analysis using scipy.linalg.eigh for generalized symmetric eigenvalue problem.

Sign and unit conventions:
- Natural frequencies f in Hz, circular frequencies omega in rad/s (omega = 2*pi*f).
- Eigenvector normalization: mass-normalized (Phi.T @ M @ Phi = I).
- Units: SI (rad/s, Hz, kg, N/m).
"""

from typing import List, Optional, Tuple, Union
import numpy as np
from scipy.linalg import eigh


def modal_analysis(
    K: np.ndarray,
    M: np.ndarray,
    n_modes: Optional[int] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Solve the generalized undamped eigenvalue problem K phi = omega^2 M phi.

    Uses scipy.linalg.eigh on symmetric matrices K and M.
    Eigenvectors are mass-normalized: Phi^T M Phi = I.

    Returns:
        f_hz: 1D array of natural frequencies in ascending order (Hz)
        Phi: 2D array of mass-normalized mode shapes (n_dofs, n_modes)
        is_rigid_body: 1D boolean array indicating zero/rigid-body modes
    """
    if K.shape != M.shape:
        raise ValueError(f"Matrix shape mismatch: K is {K.shape}, M is {M.shape}")
    if K.shape[0] == 0:
        return np.array([]), np.empty((0, 0)), np.array([], dtype=bool)

    # Generalized symmetric eigenproblem K phi = w2 M phi
    # scipy.linalg.eigh returns eigenvalues in ascending order and mass-normalized eigenvectors
    w2, Phi = eigh(K, M)

    # Clip tiny numerical negative eigenvalues to zero
    w2 = np.clip(w2, 0.0, None)
    omega = np.sqrt(w2)
    f_hz = omega / (2.0 * np.pi)

    # Detect rigid-body / zero-frequency modes
    # Criterion: f < 1e-3 Hz or f < 1e-6 * max(f_hz)
    f_max = float(np.max(f_hz)) if len(f_hz) > 0 else 0.0
    threshold = max(1e-3, 1e-6 * f_max)
    is_rigid_body = (f_hz < 1e-3) | ((f_hz < threshold) & (f_hz < 1.0))

    if n_modes is not None and n_modes < len(f_hz):
        f_hz = f_hz[:n_modes]
        Phi = Phi[:, :n_modes]
        is_rigid_body = is_rigid_body[:n_modes]

    return f_hz, Phi, is_rigid_body


def axial_fraction(
    Phi: np.ndarray,
    M: np.ndarray,
    axial_dofs: Union[List[int], np.ndarray],
) -> Union[float, np.ndarray]:
    """Calculate the fraction of modal kinetic energy residing in axial DOFs.

    Uses the kinetic energy / mass weighting:
        W_{k, j} = Phi[k, j] * (M @ Phi)[k, j]
    The axial energy fraction for mode j is:
        sum_{k in axial_dofs}(W_{k, j}) / sum_k(W_{k, j})

    Returns:
        float if Phi is a 1D single mode vector
        1D ndarray of floats if Phi is 2D (n_dofs, n_modes)
    """
    axial_indices = np.asarray(axial_dofs, dtype=int)
    if len(axial_indices) == 0:
        if Phi.ndim == 1:
            return 0.0
        return np.zeros(Phi.shape[1], dtype=float)

    is_1d = Phi.ndim == 1
    if is_1d:
        phi_2d = Phi[:, np.newaxis]
    else:
        phi_2d = Phi

    M_phi = M @ phi_2d
    W = phi_2d * M_phi  # (n_dofs, n_modes)

    axial_weight = np.sum(W[axial_indices, :], axis=0)
    total_weight = np.sum(W, axis=0)

    # Avoid zero division
    denom = np.where(np.abs(total_weight) > 1e-15, total_weight, 1.0)
    fractions = axial_weight / denom
    fractions = np.clip(np.real(fractions), 0.0, 1.0)

    if is_1d:
        return float(fractions[0])
    return fractions


def component_energy_fraction(
    Phi: np.ndarray,
    M: np.ndarray,
    comp_dofs: Union[List[int], np.ndarray],
) -> Union[float, np.ndarray]:
    """Calculate the fraction of modal kinetic energy residing in component DOFs.

    Uses mass weighting:
        W_{k, j} = Phi[k, j] * (M @ Phi)[k, j]
    Fraction = sum_{k in comp_dofs}(W_{k, j}) / sum_k(W_{k, j})
    """
    comp_indices = np.asarray(comp_dofs, dtype=int)
    if len(comp_indices) == 0:
        if Phi.ndim == 1:
            return 0.0
        return np.zeros(Phi.shape[1], dtype=float)

    is_1d = Phi.ndim == 1
    if is_1d:
        phi_2d = Phi[:, np.newaxis]
    else:
        phi_2d = Phi

    M_phi = M @ phi_2d
    W = phi_2d * M_phi

    comp_weight = np.sum(W[comp_indices, :], axis=0)
    total_weight = np.sum(W, axis=0)

    denom = np.where(np.abs(total_weight) > 1e-15, total_weight, 1.0)
    fractions = comp_weight / denom
    fractions = np.clip(np.real(fractions), 0.0, 1.0)

    if is_1d:
        return float(fractions[0])
    return fractions


def mode_labels(
    f_hz: np.ndarray,
    Phi: np.ndarray,
    M: np.ndarray,
    is_rigid_body: np.ndarray,
    axial_dofs: Union[List[int], np.ndarray],
    comp_dofs: Union[List[int], np.ndarray],
) -> List[str]:
    """Classify and label each modal frequency.

    Labels:
    - "rigid-body": if is_rigid_body is True
    - "mount mode": if component energy fraction > 0.5
    - "axial mode": if axial energy fraction > 0.5
    - "bending n": ascending bending modes (1, 2, 3...)
    """
    n_modes = len(f_hz)
    if n_modes == 0:
        return []

    ax_fracs = axial_fraction(Phi, M, axial_dofs)
    comp_fracs = component_energy_fraction(Phi, M, comp_dofs)

    labels: List[str] = []
    bending_n = 1

    for j in range(n_modes):
        if is_rigid_body[j]:
            labels.append("rigid-body")
        elif comp_fracs[j] > 0.5:
            labels.append("mount mode")
        elif ax_fracs[j] > 0.5:
            labels.append("axial mode")
        else:
            labels.append(f"bending {bending_n}")
            bending_n += 1

    return labels
