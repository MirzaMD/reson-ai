"""Analytical reference equations and benchmark formulas for beam and lumped vibration.

Conventions:
- All units SI: E (Pa), I (m^4), rho (kg/m^3), A (m^2), L (m).
- Returns frequency in Hz.
"""

from typing import Union
import numpy as np

BETA_CANT = [1.8751, 4.6941, 7.8548]
BETA_FF = [4.7300, 7.8532, 10.9956]  # free-free and fixed-fixed


def ss_beam_f(
    n: int, E: float, I: float, rho: float, A: float, L: float
) -> float:
    """Natural frequency (Hz) of mode n of an Euler-Bernoulli simply supported beam.

    f_n = (n*pi)^2 / (2*pi*L^2) * sqrt(E*I / (rho*A))
    """
    return float((n * np.pi) ** 2 / (2.0 * np.pi * (L**2)) * np.sqrt(E * I / (rho * A)))


def beam_f(
    beta: Union[float, int], E: float, I: float, rho: float, A: float, L: float
) -> float:
    """Natural frequency (Hz) for a beam with boundary condition wavenumber parameter beta.

    f = beta^2 / (2*pi*L^2) * sqrt(E*I / (rho*A))
    """
    return float((float(beta) ** 2) / (2.0 * np.pi * (L**2)) * np.sqrt(E * I / (rho * A)))


def sdof_transmissibility(r: float, zeta: float) -> float:
    """Transmissibility of a single-degree-of-freedom system at frequency ratio r = omega / omega_n."""
    num = 1.0 + (2.0 * zeta * r) ** 2
    den = (1.0 - r**2) ** 2 + (2.0 * zeta * r) ** 2
    return float(np.sqrt(num / den))


def cantilever_tip_deflection(P: float, L: float, E: float, I: float) -> float:
    """Static tip deflection of an Euler-Bernoulli cantilever beam under point load P."""
    return float(P * (L**3) / (3.0 * E * I))


def cantilever_root_stress(P: float, L: float, w: float, h: float) -> float:
    """Extreme fiber bending stress at the clamped root of a rectangular cantilever beam."""
    return float(6.0 * P * L / (w * (h**2)))


def sdof_mount_freq(k: float, m: float) -> float:
    """Natural frequency (Hz) of an undamped SDOF mount."""
    return float(np.sqrt(k / m) / (2.0 * np.pi))


def sdof_damping_c(zeta: float, k: float, m: float) -> float:
    """Viscous damping coefficient c (N*s/m) for SDOF mount."""
    return float(2.0 * zeta * np.sqrt(k * m))


def coupled_mount_mode(k: float, m_c: float, M_b: float) -> float:
    """Coupled mount natural frequency (Hz) for component on free-floating body."""
    return float(np.sqrt((k / m_c) * (1.0 + m_c / M_b)) / (2.0 * np.pi))


def sdof_unbalance_disp(m_e: float, m: float, r: float, zeta: float) -> float:
    """Steady-state displacement amplitude |X| of SDOF system under rotating unbalance m_e."""
    return float((m_e / m) * (r**2) / np.sqrt((1.0 - r**2) ** 2 + (2.0 * zeta * r) ** 2))

