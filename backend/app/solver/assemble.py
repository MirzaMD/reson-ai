"""Global matrix assembly for stiffness K, mass M, and damping C with boundary conditions and component mounts.

Sign and unit conventions:
- Units: SI everywhere internally:
  - K: N/m for translations, N*m/rad for rotations, N/rad for cross terms.
  - M: kg for translational DOFs, kg*m^2 for rotational DOFs.
  - C: N*s/m for translational dampers, N*m*s/rad for rotational dampers.
- Global coordinate system: (x, y) with y pointing upwards, CCW rotation.
- DOF order:
  - Beam nodes: node i -> [3*i, 3*i + 1, 3*i + 2] = [u_i, v_i, theta_i]
  - Components: placed after all beam DOFs (N_beam + j for j-th component)
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple, Union
import numpy as np

from app.presets import MOUNTS
from app.solver.elements import frame_element, global_element_matrices
from app.solver.mesh import Mesh


@dataclass
class Model:
    K: np.ndarray  # full stiffness (n_total, n_total)
    M: np.ndarray  # full mass (n_total, n_total)
    C: np.ndarray  # full mount damping (n_total, n_total)
    free_dofs: np.ndarray  # active global DOF indices
    constrained_dofs: np.ndarray  # eliminated DOF indices
    K_ff: np.ndarray  # reduced stiffness on free DOFs
    M_ff: np.ndarray  # reduced mass on free DOFs
    K_beam: np.ndarray  # beam-only reduced stiffness on free beam DOFs
    M_beam: np.ndarray  # beam-only reduced mass on free beam DOFs
    free_beam_dofs: np.ndarray  # indices of free beam DOFs in beam DOF space
    comp_dof: Dict[str, int]  # comp_id -> full global DOF index
    comp_beam_v: Dict[str, int]  # comp_id -> full beam vertical DOF index
    mesh: Mesh

    def expand(self, vec_free: np.ndarray) -> np.ndarray:
        """Expand a vector or matrix from free DOFs back to full global DOFs.

        Sets constrained DOFs to zero.
        Handles:
          - 1D vector of shape (n_free,)
          - 2D matrix of shape (n_free, n_modes)
          - 2D matrix of shape (n_frequencies, n_free)
        """
        n_full = self.K.shape[0]
        n_free = len(self.free_dofs)

        if vec_free.ndim == 1:
            if vec_free.shape[0] != n_free:
                raise ValueError(f"Expected vector of size {n_free}, got {vec_free.shape[0]}")
            full = np.zeros(n_full, dtype=vec_free.dtype)
            full[self.free_dofs] = vec_free
            return full

        elif vec_free.ndim == 2:
            if vec_free.shape[0] == n_free:
                # Shape (n_free, cols) e.g. mode shapes Phi
                full = np.zeros((n_full, vec_free.shape[1]), dtype=vec_free.dtype)
                full[self.free_dofs, :] = vec_free
                return full
            elif vec_free.shape[1] == n_free:
                # Shape (rows, n_free) e.g. frequency response sweep
                full = np.zeros((vec_free.shape[0], n_full), dtype=vec_free.dtype)
                full[:, self.free_dofs] = vec_free
                return full
            else:
                raise ValueError(
                    f"Dimension mismatch: neither axis matches n_free={n_free} (got {vec_free.shape})"
                )
        else:
            raise ValueError(f"Unsupported array dimension: {vec_free.ndim}")


def _resolve_mount(mount_obj: Any) -> Tuple[float, float]:
    """Extract (kv, zeta) from mount dict/model or presets."""
    if mount_obj is None:
        preset_data = MOUNTS.get("rubber_medium", {})
        return float(preset_data.get("kv", 1e5)), float(preset_data.get("zeta", 0.08))

    if hasattr(mount_obj, "model_dump"):
        m_dict = mount_obj.model_dump()
    elif isinstance(mount_obj, dict):
        m_dict = mount_obj
    else:
        m_dict = vars(mount_obj)

    preset_name = m_dict.get("preset")
    preset_data = MOUNTS.get(preset_name, {}) if preset_name else {}

    kv = m_dict.get("kv")
    if kv is None or float(kv) <= 0.0:
        kv = preset_data.get("kv", 1e5)
    kv = float(kv)

    zeta = m_dict.get("zeta")
    if zeta is None:
        zeta = preset_data.get("zeta", 0.08)
    zeta = float(zeta)

    return kv, zeta


def assemble(design: Union[Dict[str, Any], Any], mesh: Mesh) -> Model:
    """Assemble global stiffness K, mass M, and mount damping C matrices.

    DOFs layout:
    - Beam DOFs: 0 to N_beam - 1 (3 per mesh node: [u, v, theta])
    - Component DOFs: N_beam to N_beam + N_comp - 1 (1 vertical DOF yc per component)
    """
    if hasattr(design, "model_dump"):
        d = design.model_dump()
    elif isinstance(design, dict):
        d = design
    else:
        d = vars(design)

    n_beam_dofs = mesh.n_dofs
    components = d.get("components", [])
    n_comp = len(components)
    n_total_dofs = n_beam_dofs + n_comp

    K = np.zeros((n_total_dofs, n_total_dofs), dtype=float)
    M = np.zeros((n_total_dofs, n_total_dofs), dtype=float)
    C = np.zeros((n_total_dofs, n_total_dofs), dtype=float)

    # 1. Assemble beam elements
    for el in mesh.elements:
        i1 = el.node_idx1
        i2 = el.node_idx2
        dof_indices = [3 * i1, 3 * i1 + 1, 3 * i1 + 2, 3 * i2, 3 * i2 + 1, 3 * i2 + 2]

        k_local, m_local = frame_element(el.E, el.A, el.I, el.rho, el.L)
        k_glob, m_glob = global_element_matrices(k_local, m_local, el.cos, el.sin)

        K[np.ix_(dof_indices, dof_indices)] += k_glob
        M[np.ix_(dof_indices, dof_indices)] += m_glob

    # 2. Apply boundary conditions to beam nodes
    constrained_set: Set[int] = set()
    supports = d.get("supports", [])

    for supp in supports:
        if hasattr(supp, "model_dump"):
            s_dict = supp.model_dump()
        else:
            s_dict = supp

        node_id = s_dict["node"]
        if node_id not in mesh.node_map:
            raise ValueError(f"Support node '{node_id}' not found in mesh")

        node_idx = mesh.node_map[node_id]
        u_dof = 3 * node_idx
        v_dof = 3 * node_idx + 1
        th_dof = 3 * node_idx + 2

        stype = s_dict["type"]
        if stype == "fixed":
            constrained_set.update([u_dof, v_dof, th_dof])
        elif stype == "pinned":
            constrained_set.update([u_dof, v_dof])
        elif stype == "roller":
            constrained_set.add(v_dof)
        elif stype == "spring":
            kx = s_dict.get("kx")
            ky = s_dict.get("ky")
            kr = s_dict.get("kr")
            if kx is not None and float(kx) > 0.0:
                K[u_dof, u_dof] += float(kx)
            if ky is not None and float(ky) > 0.0:
                K[v_dof, v_dof] += float(ky)
            if kr is not None and float(kr) > 0.0:
                K[th_dof, th_dof] += float(kr)
        elif stype == "free":
            pass
        else:
            raise ValueError(f"Unknown support type '{stype}'")

    # Extract beam-only reduced matrices BEFORE adding components
    constrained_beam_dofs = sorted(list(constrained_set))
    all_beam_dofs = np.arange(n_beam_dofs, dtype=int)
    free_beam_dofs = np.setdiff1d(all_beam_dofs, constrained_beam_dofs)

    K_beam = K[np.ix_(free_beam_dofs, free_beam_dofs)].copy()
    M_beam = M[np.ix_(free_beam_dofs, free_beam_dofs)].copy()

    # 3. Assemble components & mounts
    comp_dof: Dict[str, int] = {}
    comp_beam_v: Dict[str, int] = {}

    for j, comp in enumerate(components):
        if hasattr(comp, "model_dump"):
            c_dict = comp.model_dump()
        else:
            c_dict = comp

        cid = c_dict["id"]
        m_c = float(c_dict["mass"])
        if m_c <= 0.0:
            raise ValueError(f"Component '{cid}' mass must be positive, got {m_c}")

        yc = n_beam_dofs + j
        comp_dof[cid] = yc

        mesh_node_idx = mesh.component_node_map[cid]
        vb = 3 * mesh_node_idx + 1  # vertical translation DOF v of the mesh node
        comp_beam_v[cid] = vb

        # Lumped component mass
        M[yc, yc] += m_c

        # Mount stiffness and dashpot
        kv, zeta = _resolve_mount(c_dict.get("mount"))
        c_dashpot = 2.0 * zeta * np.sqrt(kv * m_c)

        # Coupled mount terms on (yc, vb)
        # Note: if vb is constrained (eliminated from free DOFs), slicing will keep only the yc term
        mount_coupling = np.array([[1.0, -1.0], [-1.0, 1.0]])
        pair = [yc, vb]
        K[np.ix_(pair, pair)] += kv * mount_coupling
        C[np.ix_(pair, pair)] += c_dashpot * mount_coupling

    # 4. Slicing and sanity assertions
    assert np.allclose(K, K.T, rtol=1e-10, atol=1e-10), "Global K is not symmetric"
    assert np.allclose(M, M.T, rtol=1e-10, atol=1e-10), "Global M is not symmetric"

    # Component DOFs are always free
    constrained_dofs = np.array(sorted(list(constrained_set)), dtype=int)
    all_dofs = np.arange(n_total_dofs, dtype=int)
    free_dofs = np.setdiff1d(all_dofs, constrained_dofs)

    K_ff = K[np.ix_(free_dofs, free_dofs)]
    M_ff = M[np.ix_(free_dofs, free_dofs)]

    # Positive definiteness of Mass matrix M_ff
    eigvals_M = np.linalg.eigvalsh(M_ff)
    if len(eigvals_M) > 0 and np.min(eigvals_M) <= 0.0:
        raise ValueError(f"Reduced mass matrix M_ff is not positive definite: min eig = {np.min(eigvals_M)}")

    return Model(
        K=K,
        M=M,
        C=C,
        free_dofs=free_dofs,
        constrained_dofs=constrained_dofs,
        K_ff=K_ff,
        M_ff=M_ff,
        K_beam=K_beam,
        M_beam=M_beam,
        free_beam_dofs=free_beam_dofs,
        comp_dof=comp_dof,
        comp_beam_v=comp_beam_v,
        mesh=mesh,
    )
