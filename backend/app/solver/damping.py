"""Rayleigh structural damping and discrete mount dashpot assembly.

Sign and unit conventions:
- Units: SI (damping C in N*s/m, frequencies in Hz, circular frequencies in rad/s).
- Damping ratio zeta: dimensionless.
- Rayleigh damping: C_beam = alpha * M_beam + beta * K_beam
  with alpha (1/s) and beta (s).
"""

from typing import Tuple
import numpy as np

from app.solver.assemble import Model


def rayleigh_coefficients(
    zeta: float, f1_hz: float, f2_hz: float
) -> Tuple[float, float]:
    """Calculate Rayleigh damping coefficients alpha and beta for target damping ratio zeta.

    alpha = 2 * zeta * w1 * w2 / (w1 + w2)
    beta = 2 * zeta / (w1 + w2)
    where w = 2 * pi * f.
    """
    if f1_hz <= 0.0 or f2_hz <= 0.0:
        raise ValueError(f"Frequencies must be positive, got f1={f1_hz}, f2={f2_hz}")
    if np.isclose(f1_hz, f2_hz):
        # Degenerate case: single frequency
        w = 2.0 * np.pi * f1_hz
        alpha = zeta * w
        beta = zeta / w
        return float(alpha), float(beta)

    w1 = 2.0 * np.pi * f1_hz
    w2 = 2.0 * np.pi * f2_hz

    alpha = 2.0 * zeta * (w1 * w2) / (w1 + w2)
    beta = 2.0 * zeta / (w1 + w2)
    return float(alpha), float(beta)


def build_damping(
    model: Model,
    zeta: float,
    f1_hz: float,
    f2_hz: float,
) -> np.ndarray:
    """Build the total viscous damping matrix C_ff in the reduced free-DOF space.

    Combines:
    1. Beam Rayleigh damping (alpha * M_beam + beta * K_beam) on free beam DOFs.
    2. Discrete component mount dashpots on free (yc, vb) DOFs.

    Returns:
        C_ff: ndarray of shape (n_free, n_free)
    """
    n_free = len(model.free_dofs)
    C_ff = np.zeros((n_free, n_free), dtype=float)

    alpha, beta = rayleigh_coefficients(zeta, f1_hz, f2_hz)

    # 1. Beam Rayleigh damping on free beam DOFs
    beam_free_indices = [
        idx for idx, dof in enumerate(model.free_dofs) if dof < model.mesh.n_dofs
    ]
    if len(beam_free_indices) > 0:
        C_beam = alpha * model.M_beam + beta * model.K_beam
        C_ff[np.ix_(beam_free_indices, beam_free_indices)] += C_beam

    # 2. Add mount dashpots in free-DOF space
    C_mount_ff = model.C[np.ix_(model.free_dofs, model.free_dofs)]
    C_ff += C_mount_ff

    assert np.allclose(C_ff, C_ff.T, rtol=1e-10, atol=1e-10), "Damping matrix C_ff is not symmetric"
    return C_ff
