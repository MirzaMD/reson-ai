"""Mesh generation: discretizes structural members into 1D beam elements, inserting exact nodes at component attachment points.

Sign and unit conventions:
- Units: SI (coordinates in meters).
- Coordinate system: 2D planar (x, y) with y up.
- In-plane rotation theta is CCW positive.
- Element local axis: directed from start node (n1) to end node (n2).
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from app.solver.elements import section_props


@dataclass
class MeshNodeData:
    id: str
    x: float
    y: float
    member: Optional[str] = None
    s: Optional[float] = None


@dataclass
class ElementData:
    id: str
    node_idx1: int
    node_idx2: int
    n1_id: str
    n2_id: str
    member: str
    E: float
    A: float
    I: float
    rho: float
    L: float
    cos: float
    sin: float
    c: float  # half-depth for stress


@dataclass
class Mesh:
    nodes: List[MeshNodeData]
    elements: List[ElementData]
    node_map: Dict[str, int]  # design node id -> mesh node index
    component_node_map: Dict[str, int]  # component id -> mesh node index
    member_elements_map: Dict[str, List[int]] = field(default_factory=dict)

    @property
    def n_nodes(self) -> int:
        return len(self.nodes)

    @property
    def n_elements(self) -> int:
        return len(self.elements)

    @property
    def n_dofs(self) -> int:
        # Beam nodes: 3 DOFs per node (u, v, theta)
        return self.n_nodes * 3


def build_mesh(design: Union[Dict[str, Any], Any]) -> Mesh:
    """Discretize the frame design into beam elements and nodes.

    Inserts nodes exactly at component attachment locations s in [0, 1].
    Preserves shared connectivity across members meeting at design nodes.
    """
    if hasattr(design, "model_dump"):
        d = design.model_dump()
    elif isinstance(design, dict):
        d = design
    else:
        d = vars(design)

    # 1. Map design nodes
    design_nodes = {n["id"]: (float(n["x"]), float(n["y"])) for n in d.get("nodes", [])}

    analysis_cfg = d.get("analysis", {})
    if hasattr(analysis_cfg, "model_dump"):
        analysis_cfg = analysis_cfg.model_dump()
    n_el_per_member_default = int(analysis_cfg.get("n_elements_per_member", 20))

    components = d.get("components", [])

    # Group components by member
    comps_by_member: Dict[str, List[Dict[str, Any]]] = {}
    for comp in components:
        if hasattr(comp, "model_dump"):
            c_dict = comp.model_dump()
        else:
            c_dict = comp
        mem_id = c_dict["member"]
        comps_by_member.setdefault(mem_id, []).append(c_dict)

    mesh_nodes: List[MeshNodeData] = []
    node_map: Dict[str, int] = {}  # design node id -> mesh node index
    elements: List[ElementData] = []
    component_node_map: Dict[str, int] = {}
    member_elements_map: Dict[str, List[int]] = {}

    # Helper to find or add mesh node with tolerance
    def add_mesh_node(
        node_id: str,
        x: float,
        y: float,
        member: Optional[str] = None,
        s: Optional[float] = None,
    ) -> int:
        # Check if already exists near this point
        for idx, n in enumerate(mesh_nodes):
            if np.isclose(n.x, x, atol=1e-9) and np.isclose(n.y, y, atol=1e-9):
                return idx

        idx = len(mesh_nodes)
        mesh_nodes.append(MeshNodeData(id=node_id, x=x, y=y, member=member, s=s))
        return idx

    # Pre-add design nodes
    for nid, (nx, ny) in design_nodes.items():
        idx = add_mesh_node(nid, nx, ny)
        node_map[nid] = idx

    members = d.get("members", [])
    for member in members:
        if hasattr(member, "model_dump"):
            m_dict = member.model_dump()
        else:
            m_dict = member

        mid = m_dict["id"]
        n1_id = m_dict["n1"]
        n2_id = m_dict["n2"]
        material = m_dict["material"]
        section = m_dict["section"]

        E, A, I, rho, c_half = section_props(section, material)

        x1, y1 = design_nodes[n1_id]
        x2, y2 = design_nodes[n2_id]
        dx = x2 - x1
        dy = y2 - y1
        L_total = float(np.hypot(dx, dy))
        if L_total <= 0.0:
            raise ValueError(f"Member '{mid}' has zero length")

        cos_alpha = dx / L_total
        sin_alpha = dy / L_total

        # Collect split points along member s in [0, 1]
        split_dict: Dict[float, List[str]] = {0.0: [], 1.0: []}
        mem_comps = comps_by_member.get(mid, [])
        for c in mem_comps:
            s_val = round(float(c["s"]), 8)
            split_dict.setdefault(s_val, []).append(c["id"])

        sorted_s = sorted(split_dict.keys())

        # Determine subdivision count for each segment
        target_el = n_el_per_member_default
        segment_points: List[Tuple[float, List[str]]] = []

        for i in range(len(sorted_s) - 1):
            s_a = sorted_s[i]
            s_b = sorted_s[i + 1]
            ds = s_b - s_a
            # Proportional element count, at least 1
            n_sub = max(1, int(round(target_el * ds)))
            for k in range(n_sub):
                curr_s = s_a + (k / n_sub) * ds
                c_ids = split_dict.get(curr_s, []) if k == 0 else []
                segment_points.append((curr_s, c_ids))

        # Add the end point s=1.0
        segment_points.append((1.0, split_dict.get(1.0, [])))

        # Create nodes and elements along the member
        elem_indices: List[int] = []
        prev_node_idx: Optional[int] = None

        for pt_idx, (s_val, comp_ids) in enumerate(segment_points):
            if np.isclose(s_val, 0.0, atol=1e-8):
                curr_node_idx = node_map[n1_id]
            elif np.isclose(s_val, 1.0, atol=1e-8):
                curr_node_idx = node_map[n2_id]
            else:
                curr_x = x1 + s_val * dx
                curr_y = y1 + s_val * dy
                node_name = f"{mid}_s{int(round(s_val * 10000)):04d}"
                curr_node_idx = add_mesh_node(
                    node_name, curr_x, curr_y, member=mid, s=round(s_val, 6)
                )

            # Map any components placed at this s
            for cid in comp_ids:
                component_node_map[cid] = curr_node_idx

            # Build element between prev and curr
            if prev_node_idx is not None and prev_node_idx != curr_node_idx:
                p_node = mesh_nodes[prev_node_idx]
                c_node = mesh_nodes[curr_node_idx]
                el_L = float(np.hypot(c_node.x - p_node.x, c_node.y - p_node.y))
                el_id = f"el_{mid}_{len(elements)}"
                el_data = ElementData(
                    id=el_id,
                    node_idx1=prev_node_idx,
                    node_idx2=curr_node_idx,
                    n1_id=p_node.id,
                    n2_id=c_node.id,
                    member=mid,
                    E=E,
                    A=A,
                    I=I,
                    rho=rho,
                    L=el_L,
                    cos=cos_alpha,
                    sin=sin_alpha,
                    c=c_half,
                )
                el_idx = len(elements)
                elements.append(el_data)
                elem_indices.append(el_idx)

            prev_node_idx = curr_node_idx

        member_elements_map[mid] = elem_indices

    return Mesh(
        nodes=mesh_nodes,
        elements=elements,
        node_map=node_map,
        component_node_map=component_node_map,
        member_elements_map=member_elements_map,
    )
