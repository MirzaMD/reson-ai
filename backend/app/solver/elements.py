"""2D Euler-Bernoulli beam element matrices, coordinate transformations, and section properties.

Sign and unit conventions:
- Units: SI everywhere internally:
  - Modulus of elasticity E: Pa (N/m^2)
  - Density rho: kg/m^3
  - Cross-sectional area A: m^2
  - Second moment of area I: m^4
  - Half-depth for stress c: m
  - Length L: m
  - Stiffness k: N/m, N*m/rad
  - Mass m: kg, kg*m^2
- Coordinate system:
  - 2D planar (x, y) with y pointing upwards.
  - Rotation theta is positive counter-clockwise (CCW).
- DOF conventions:
  - Local element DOFs: [u1, v1, theta1, u2, v2, theta2]
    u: axial displacement along member (from node 1 to node 2)
    v: transverse displacement perpendicular to member (90 deg CCW from u)
    theta: in-plane rotation CCW
  - Global nodal DOFs: [u, v, theta] where u is global x, v is global y, theta is CCW rotation.
"""

from typing import Any, Dict, Tuple, Union
import numpy as np

from app.presets import MATERIALS


def section_props(
    section: Union[Dict[str, Any], Any],
    material: Union[str, Dict[str, Any]],
) -> Tuple[float, float, float, float, float]:
    """Calculate cross-section properties and material constants.

    Returns:
        (E, A, I, rho, c)
        E: Young's modulus (Pa)
        A: Cross-sectional area (m^2)
        I: Second moment of area about bending axis (m^4)
        rho: Density (kg/m^3)
        c: Distance from neutral axis to extreme fiber (m)
    """
    # Resolve material
    if isinstance(material, str):
        if material not in MATERIALS:
            raise ValueError(f"Unknown material '{material}'. Available: {list(MATERIALS.keys())}")
        mat_dict = MATERIALS[material]
    elif isinstance(material, dict):
        mat_dict = material
    else:
        raise TypeError(f"Invalid material type: {type(material)}")

    E = float(mat_dict["E"])
    rho = float(mat_dict["rho"])

    # Extract section attributes whether dict or Pydantic model
    if hasattr(section, "model_dump"):
        sec_dict = section.model_dump()
    elif isinstance(section, dict):
        sec_dict = section
    else:
        sec_dict = vars(section)

    stype = sec_dict.get("type")

    if stype == "rect":
        w = float(sec_dict["w"])
        h = float(sec_dict["h"])
        A = w * h
        # In-plane bending is about the axis perpendicular to h (h is in-plane depth)
        I = w * (h**3) / 12.0
        c = h / 2.0
    elif stype == "circ":
        d = float(sec_dict["d"])
        r = d / 2.0
        A = np.pi * (r**2)
        I = np.pi * (d**4) / 64.0
        c = r
    elif stype == "tube":
        d_out = float(sec_dict["d"])
        t = float(sec_dict["t"])
        d_in = d_out - 2.0 * t
        if d_in <= 0.0:
            raise ValueError(f"Tube wall thickness {t} too large for diameter {d_out}")
        A = np.pi * (d_out**2 - d_in**2) / 4.0
        I = np.pi * (d_out**4 - d_in**4) / 64.0
        c = d_out / 2.0
    elif stype == "box":
        w_out = float(sec_dict["w"])
        h_out = float(sec_dict["h"])
        t = float(sec_dict["t"])
        w_in = w_out - 2.0 * t
        h_in = h_out - 2.0 * t
        if w_in <= 0.0 or h_in <= 0.0:
            raise ValueError("Box wall thickness too large for section dimensions")
        A = w_out * h_out - w_in * h_in
        I = (w_out * (h_out**3) - w_in * (h_in**3)) / 12.0
        c = h_out / 2.0
    else:
        raise ValueError(f"Unknown section type '{stype}'")

    return E, A, I, rho, c


def frame_element(
    E: float, A: float, I: float, rho: float, L: float
) -> Tuple[np.ndarray, np.ndarray]:
    """Local 2D Euler-Bernoulli frame element stiffness and consistent mass matrices (6x6).

    Local DOF ordering: [u1, v1, theta1, u2, v2, theta2]
    """
    if L <= 0.0:
        raise ValueError(f"Element length L must be positive, got {L}")

    k = np.zeros((6, 6), dtype=float)
    m = np.zeros((6, 6), dtype=float)

    # Axial stiffness
    a = E * A / L
    k[np.ix_([0, 3], [0, 3])] = a * np.array([[1.0, -1.0], [-1.0, 1.0]])

    # Bending stiffness
    b = E * I / (L**3)
    idx = [1, 2, 4, 5]
    k[np.ix_(idx, idx)] = b * np.array(
        [
            [12.0, 6.0 * L, -12.0, 6.0 * L],
            [6.0 * L, 4.0 * L**2, -6.0 * L, 2.0 * L**2],
            [-12.0, -6.0 * L, 12.0, -6.0 * L],
            [6.0 * L, 2.0 * L**2, -6.0 * L, 4.0 * L**2],
        ]
    )

    # Axial consistent mass
    m[np.ix_([0, 3], [0, 3])] = (rho * A * L / 6.0) * np.array([[2.0, 1.0], [1.0, 2.0]])

    # Bending consistent mass
    m[np.ix_(idx, idx)] = (rho * A * L / 420.0) * np.array(
        [
            [156.0, 22.0 * L, 54.0, -13.0 * L],
            [22.0 * L, 4.0 * L**2, 13.0 * L, -3.0 * L**2],
            [54.0, 13.0 * L, 156.0, -22.0 * L],
            [-13.0 * L, -3.0 * L**2, -22.0 * L, 4.0 * L**2],
        ]
    )

    return k, m


def transform(c: float, s: float) -> np.ndarray:
    """Coordinate transformation matrix T (6x6) from global to local DOFs.

    u_local = T @ u_global
    c: cos(alpha)
    s: sin(alpha)
    where alpha is the member angle from global x axis to local element axis.
    """
    R = np.array(
        [
            [c, s, 0.0],
            [-s, c, 0.0],
            [0.0, 0.0, 1.0],
        ],
        dtype=float,
    )
    T = np.zeros((6, 6), dtype=float)
    T[:3, :3] = R
    T[3:, 3:] = R
    return T


def global_element_matrices(
    k: np.ndarray, m: np.ndarray, c: float, s: float
) -> Tuple[np.ndarray, np.ndarray]:
    """Transform local element matrices to global coordinate system.

    Kg = T.T @ k @ T
    Mg = T.T @ m @ T
    """
    T = transform(c, s)
    Kg = T.T @ k @ T
    Mg = T.T @ m @ T
    return Kg, Mg
