"""Closed operation vocabulary, argument models, and patch engine for LLM agent.

Enforces physical constraints, reference validity, clamping rules, and design schema re-validation.
"""

import copy
import math
import re
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

from pydantic import BaseModel, ConfigDict, Field

from app.presets import COMPONENTS, MATERIALS, MOUNTS, STRUCTURE_PRESETS, get_demo_design
from app.schemas import DesignModel

# Physical clamping bounds
MIN_MEMBER_LEN = 0.01       # 10 mm
MAX_MEMBER_LEN = 5.0        # 5 m
MIN_SECTION_DIM = 0.001     # 1 mm
MAX_SECTION_DIM = 0.5       # 500 mm
MIN_MASS = 0.001            # 1 gram
MAX_MASS = 100.0            # 100 kg
MIN_KV = 1.0e3              # 1 kN/m
MAX_KV = 1.0e8              # 100 MN/m
MIN_RPM = 10.0
MAX_RPM = 60000.0
MAX_MEMBERS = 50
MAX_COMPONENTS = 20


class OpError(Exception):
    """Raised when an operation cannot be applied due to invalid references or invariants."""

    pass


# ---------------------------------------------------------------------------
# Closed Vocabulary Pydantic Argument Models
# ---------------------------------------------------------------------------

class LoadPresetArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str


class AddNodeArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    x: float
    y: float


class AddMemberArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    n1: str
    n2: str
    material: str = "steel"
    section: Union[str, Dict[str, Any]] = Field(
        default_factory=lambda: {"type": "rect", "w": 0.02, "h": 0.02}
    )


class RemoveMemberArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str


class SetSectionArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    member: str
    section: Union[str, Dict[str, Any]]


class SetMaterialArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    member: str
    material: str


class SetSupportArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    node: str
    type: str
    kx: Optional[float] = None
    ky: Optional[float] = None
    kr: Optional[float] = None


class AddComponentArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    kind: str
    member: str
    s: float
    mass: Optional[float] = None
    mount: Optional[Dict[str, Any]] = None
    excitation: Optional[Dict[str, Any]] = None
    limit_g: Optional[float] = None


class MoveComponentArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    member: Optional[str] = None
    s: float


class SetComponentArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    fields: Dict[str, Any]


class RemoveComponentArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str


class SetMountArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    component: str
    preset: Optional[str] = None
    kv: Optional[float] = None
    zeta: Optional[float] = None


class SetExcitationArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    component: str
    rpm_min: Optional[float] = None
    rpm_max: Optional[float] = None
    me: Optional[float] = None
    orders: Optional[List[float]] = None
    blades: Optional[int] = None


class SetAnalysisArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    fields: Dict[str, Any]


OP_MODELS = {
    "load_preset": LoadPresetArgs,
    "add_node": AddNodeArgs,
    "add_member": AddMemberArgs,
    "remove_member": RemoveMemberArgs,
    "set_section": SetSectionArgs,
    "set_material": SetMaterialArgs,
    "set_support": SetSupportArgs,
    "add_component": AddComponentArgs,
    "move_component": MoveComponentArgs,
    "set_component": SetComponentArgs,
    "remove_component": RemoveComponentArgs,
    "set_mount": SetMountArgs,
    "set_excitation": SetExcitationArgs,
    "set_analysis": SetAnalysisArgs,
}


def _clamp_val(val: float, low: float, high: float, name: str, warnings: List[str]) -> float:
    if val < low:
        warnings.append(f"Clamped {name} from {val} up to minimum {low}")
        return low
    if val > high:
        warnings.append(f"Clamped {name} from {val} down to maximum {high}")
        return high
    return val


def _normalize_section(sec: Union[str, Dict[str, Any]], warnings: List[str]) -> Dict[str, Any]:
    """Ensure section is a valid dict with type and clamped dimensions."""
    if isinstance(sec, str):
        sec_name = sec.lower().strip()
        if "box" in sec_name:
            sec = {"type": "box", "w": 0.02, "h": 0.02, "t": 0.002}
        elif "tube" in sec_name or "pipe" in sec_name:
            sec = {"type": "tube", "d": 0.025, "t": 0.002}
        elif "circ" in sec_name or "rod" in sec_name:
            sec = {"type": "circ", "d": 0.02}
        else:
            sec = {"type": "rect", "w": 0.02, "h": 0.02}

    d = copy.deepcopy(sec)
    stype = d.get("type") or d.get("shape") or "rect"
    d["type"] = stype
    d.pop("shape", None)

    for dim_key in ["w", "h", "d", "b"]:
        if dim_key in d:
            d[dim_key] = _clamp_val(float(d[dim_key]), MIN_SECTION_DIM, MAX_SECTION_DIM, f"section.{dim_key}", warnings)
    if "t" in d:
        # Wall thickness clamp
        d["t"] = _clamp_val(float(d["t"]), 0.0005, 0.05, "section.t", warnings)

    return d


def _resolve_mount_dict(mount_in: Optional[Union[str, Dict[str, Any]]], warnings: List[str]) -> Optional[Dict[str, Any]]:
    if not mount_in:
        return None
    if isinstance(mount_in, str):
        m = {"preset": mount_in}
    else:
        m = copy.deepcopy(mount_in)

    preset = m.get("preset")
    if preset == "rigid":
        return {"preset": "rigid"}

    if preset and preset in MOUNTS:
        p_data = MOUNTS[preset]
        if "kv" not in m and "kv" in p_data:
            m["kv"] = float(p_data["kv"])
        if "zeta" not in m and "zeta" in p_data:
            m["zeta"] = float(p_data["zeta"])

    if "kv" in m:
        m["kv"] = _clamp_val(float(m["kv"]), MIN_KV, MAX_KV, "mount.kv", warnings)
    if "zeta" in m:
        m["zeta"] = _clamp_val(float(m["zeta"]), 0.0, 1.0, "mount.zeta", warnings)

    return m


def describe_op(op_dict: Dict[str, Any]) -> str:
    """Generate a clean, human-readable summary of an applied operation."""
    op = op_dict.get("op", "")
    args = op_dict.get("args", {})

    if op == "load_preset":
        return f"Loaded '{args.get('name')}' structural template preset"
    elif op == "add_node":
        return f"Added node '{args.get('id', 'new')}' at ({args.get('x', 0):.3f}, {args.get('y', 0):.3f}) m"
    elif op == "add_member":
        return f"Added member '{args.get('id', 'new')}' connecting {args.get('n1')} to {args.get('n2')} ({args.get('material', 'steel')})"
    elif op == "remove_member":
        return f"Removed member '{args.get('id')}'"
    elif op == "set_section":
        return f"Updated cross-section for member '{args.get('member')}'"
    elif op == "set_material":
        return f"Changed material to '{args.get('material')}' for member '{args.get('member')}'"
    elif op == "set_support":
        return f"Configured '{args.get('type')}' boundary support at node '{args.get('node')}'"
    elif op == "add_component":
        s_pct = int(round(float(args.get("s", 0.5)) * 100))
        mass_str = f" {args.get('mass'):.2f} kg" if args.get("mass") is not None else ""
        return f"Added {args.get('kind', 'component')}{mass_str} at {s_pct}% along member '{args.get('member')}'"
    elif op == "move_component":
        s_pct = int(round(float(args.get("s", 0.5)) * 100))
        target_mem = f" on member '{args.get('member')}'" if args.get("member") else ""
        return f"Moved component '{args.get('id')}' to {s_pct}%{target_mem}"
    elif op == "set_component":
        return f"Updated parameters for component '{args.get('id')}'"
    elif op == "remove_component":
        return f"Removed component '{args.get('id')}'"
    elif op == "set_mount":
        return f"Configured mount isolation for component '{args.get('component')}'"
    elif op == "set_excitation":
        return f"Updated vibration excitation harmonics for component '{args.get('component')}'"
    elif op == "set_analysis":
        return "Updated solver analysis frequency sweep configuration"
    return f"Applied operation '{op}'"


def apply_ops(
    design: Optional[Dict[str, Any]],
    ops: List[Dict[str, Any]],
) -> Tuple[Dict[str, Any], List[str]]:
    """Apply a sequence of validated operations to a design, returning a new design and warnings.

    Invariants:
    - Never mutates the input design in place.
    - Resolves 'all' for member modifications.
    - Clamps physical values with warnings.
    - Raises OpError on invalid node/member/component references.
    - Re-validates the resulting design using DesignModel.
    """
    if design is None or not design:
        # Start from empty base structure
        d: Dict[str, Any] = {
            "name": "User_Structure",
            "plane": "xy",
            "nodes": [],
            "members": [],
            "supports": [],
            "components": [],
            "analysis": {
                "rpm_min": 500.0,
                "rpm_max": 12000.0,
                "rpm_points": 200,
                "n_elements_per_member": 10,
                "method": "rom",
            },
        }
    else:
        d = copy.deepcopy(design)

    # Ensure container lists exist
    d.setdefault("nodes", [])
    d.setdefault("members", [])
    d.setdefault("supports", [])
    d.setdefault("components", [])
    d.setdefault("analysis", {})

    warnings: List[str] = []

    for raw_op in ops:
        if not isinstance(raw_op, dict) or "op" not in raw_op:
            raise OpError(f"Invalid operation structure: {raw_op}")

        op_name = raw_op["op"]
        args_dict = raw_op.get("args", {})

        if op_name not in OP_MODELS:
            raise OpError(f"Unknown operation '{op_name}'. Available: {list(OP_MODELS.keys())}")

        # Validate arguments through Pydantic
        model_cls = OP_MODELS[op_name]
        try:
            parsed_args = model_cls.model_validate(args_dict)
        except Exception as ve:
            raise OpError(f"Invalid arguments for op '{op_name}': {ve}") from ve

        # 1. LOAD_PRESET
        if op_name == "load_preset":
            pname = parsed_args.name.lower().strip()
            # Map friendly aliases
            if pname in ("drone", "quad", "quadcopter", "quad_drone_diagonal"):
                target_p = "drone"
            elif pname in ("cantilever", "cantilever_beam", "cantilever_demo"):
                target_p = "cantilever"
            elif pname in ("simply_supported", "simply_supported_beam", "simply_supported_demo"):
                target_p = "simply_supported"
            else:
                target_p = pname

            try:
                loaded = get_demo_design(target_p)
            except Exception as e:
                raise OpError(f"Unknown preset '{pname}'. Available: drone, cantilever, simply_supported") from e

            d = copy.deepcopy(loaded)
            d.setdefault("nodes", [])
            d.setdefault("members", [])
            d.setdefault("supports", [])
            d.setdefault("components", [])

        # 2. ADD_NODE
        elif op_name == "add_node":
            node_id = parsed_args.id
            if not node_id:
                # Auto-generate node id
                existing_nums = [
                    int(m.group(1))
                    for n in d["nodes"]
                    if (m := re.match(r"^n(\d+)$", str(n.get("id", ""))))
                ]
                next_num = (max(existing_nums) + 1) if existing_nums else (len(d["nodes"]) + 1)
                node_id = f"n{next_num}"

            # Check duplication
            if any(n["id"] == node_id for n in d["nodes"]):
                raise OpError(f"Node with id '{node_id}' already exists")

            d["nodes"].append({"id": node_id, "x": float(parsed_args.x), "y": float(parsed_args.y)})

        # 3. ADD_MEMBER
        elif op_name == "add_member":
            if len(d["members"]) >= MAX_MEMBERS:
                raise OpError(f"Maximum member limit ({MAX_MEMBERS}) reached")

            n_map = {n["id"]: n for n in d["nodes"]}
            if parsed_args.n1 not in n_map:
                raise OpError(f"Node '{parsed_args.n1}' does not exist")
            if parsed_args.n2 not in n_map:
                raise OpError(f"Node '{parsed_args.n2}' does not exist")
            if parsed_args.n1 == parsed_args.n2:
                raise OpError(f"Member endpoints cannot be the same node ({parsed_args.n1})")

            # Validate physical member length
            p1 = n_map[parsed_args.n1]
            p2 = n_map[parsed_args.n2]
            length = math.hypot(p2["x"] - p1["x"], p2["y"] - p1["y"])
            if length < MIN_MEMBER_LEN:
                raise OpError(f"Member length {length:.4f} m is below minimum allowable ({MIN_MEMBER_LEN} m)")
            if length > MAX_MEMBER_LEN:
                raise OpError(f"Member length {length:.4f} m exceeds maximum allowable ({MAX_MEMBER_LEN} m)")

            mat = parsed_args.material.lower().strip()
            # Normalize common synonyms
            if mat in ("aluminum", "aluminium"):
                mat = "aluminium_6061"
            elif mat == "carbon":
                mat = "cfrp"
            elif mat not in MATERIALS:
                raise OpError(f"Unknown material '{mat}'. Available: {list(MATERIALS.keys())}")

            sec = _normalize_section(parsed_args.section, warnings)

            mem_id = parsed_args.id
            if not mem_id:
                existing_nums = [
                    int(m.group(1))
                    for mem in d["members"]
                    if (m := re.match(r"^m(\d+)$", str(mem.get("id", ""))))
                ]
                next_num = (max(existing_nums) + 1) if existing_nums else (len(d["members"]) + 1)
                mem_id = f"m{next_num}"

            if any(m["id"] == mem_id for m in d["members"]):
                raise OpError(f"Member with id '{mem_id}' already exists")

            d["members"].append({
                "id": mem_id,
                "n1": parsed_args.n1,
                "n2": parsed_args.n2,
                "material": mat,
                "section": sec,
            })

        # 4. REMOVE_MEMBER
        elif op_name == "remove_member":
            target_id = parsed_args.id
            orig_len = len(d["members"])
            d["members"] = [m for m in d["members"] if m["id"] != target_id]
            if len(d["members"]) == orig_len:
                raise OpError(f"Member '{target_id}' not found")
            # Remove any attached components
            d["components"] = [c for c in d["components"] if c.get("member") != target_id]

        # 5. SET_SECTION
        elif op_name == "set_section":
            target = parsed_args.member
            sec = _normalize_section(parsed_args.section, warnings)
            if target == "all":
                if not d["members"]:
                    raise OpError("No members exist to update section")
                for mem in d["members"]:
                    mem["section"] = copy.deepcopy(sec)
            else:
                matched = [m for m in d["members"] if m["id"] == target]
                if not matched:
                    raise OpError(f"Member '{target}' not found")
                matched[0]["section"] = sec

        # 6. SET_MATERIAL
        elif op_name == "set_material":
            target = parsed_args.member
            mat = parsed_args.material.lower().strip()
            if mat in ("aluminum", "aluminium"):
                mat = "aluminium_6061"
            elif mat == "carbon":
                mat = "cfrp"
            elif mat not in MATERIALS:
                raise OpError(f"Unknown material '{mat}'. Available: {list(MATERIALS.keys())}")

            if target == "all":
                if not d["members"]:
                    raise OpError("No members exist to update material")
                for mem in d["members"]:
                    mem["material"] = mat
            else:
                matched = [m for m in d["members"] if m["id"] == target]
                if not matched:
                    raise OpError(f"Member '{target}' not found")
                matched[0]["material"] = mat

        # 7. SET_SUPPORT
        elif op_name == "set_support":
            nid = parsed_args.node
            stype = parsed_args.type.lower().strip()
            if not any(n["id"] == nid for n in d["nodes"]):
                raise OpError(f"Node '{nid}' does not exist")

            valid_types = ("fixed", "pinned", "roller_x", "roller_y", "hover", "free")
            if stype not in valid_types:
                raise OpError(f"Invalid support type '{stype}'. Available: {valid_types}")

            # Remove existing support for this node
            d["supports"] = [s for s in d["supports"] if s.get("node") != nid]
            if stype != "free":
                sup_entry: Dict[str, Any] = {"node": nid, "type": stype}
                if parsed_args.kx is not None:
                    sup_entry["kx"] = float(parsed_args.kx)
                if parsed_args.ky is not None:
                    sup_entry["ky"] = float(parsed_args.ky)
                if parsed_args.kr is not None:
                    sup_entry["kr"] = float(parsed_args.kr)
                d["supports"].append(sup_entry)

        # 8. ADD_COMPONENT
        elif op_name == "add_component":
            if len(d["components"]) >= MAX_COMPONENTS:
                raise OpError(f"Maximum component limit ({MAX_COMPONENTS}) reached")

            mid = parsed_args.member
            if not any(m["id"] == mid for m in d["members"]):
                raise OpError(f"Member '{mid}' does not exist")

            s_val = float(parsed_args.s)
            if s_val < 0.0 or s_val > 1.0:
                raise OpError(f"Component s coordinate {s_val} must be between 0.0 and 1.0")

            kind = parsed_args.kind.lower().strip()
            if kind == "imu":
                kind = "gyro"

            # Fill defaults from preset library if available
            p_data = COMPONENTS.get(kind, {})

            # Mass
            mass = parsed_args.mass if parsed_args.mass is not None else p_data.get("mass", 0.1)
            mass = _clamp_val(float(mass), MIN_MASS, MAX_MASS, "component.mass", warnings)

            # Mount
            mount = parsed_args.mount or p_data.get("mount")
            mount_dict = _resolve_mount_dict(mount, warnings)

            # Excitation
            excitation = parsed_args.excitation or p_data.get("excitation")

            # Limit_g
            limit_g = parsed_args.limit_g if parsed_args.limit_g is not None else p_data.get("limit_g")

            cid = parsed_args.id
            if not cid:
                existing_cids = {c["id"] for c in d["components"]}
                base_name = kind if kind else "comp"
                idx = 1
                while f"{base_name}_{idx}" in existing_cids:
                    idx += 1
                cid = f"{base_name}_{idx}"

            if any(c["id"] == cid for c in d["components"]):
                raise OpError(f"Component with id '{cid}' already exists")

            comp_entry: Dict[str, Any] = {
                "id": cid,
                "kind": kind if kind in COMPONENTS else "generic_mass",
                "member": mid,
                "s": s_val,
                "mass": mass,
            }
            if mount_dict is not None:
                comp_entry["mount"] = mount_dict
            if excitation is not None:
                comp_entry["excitation"] = copy.deepcopy(excitation)
            if limit_g is not None:
                comp_entry["limit_g"] = float(limit_g)

            d["components"].append(comp_entry)

        # 9. MOVE_COMPONENT
        elif op_name == "move_component":
            cid = parsed_args.id
            matched = [c for c in d["components"] if c["id"] == cid]
            if not matched:
                raise OpError(f"Component '{cid}' not found")

            s_val = float(parsed_args.s)
            if s_val < 0.0 or s_val > 1.0:
                raise OpError(f"Position s {s_val} must be between 0.0 and 1.0")

            if parsed_args.member:
                if not any(m["id"] == parsed_args.member for m in d["members"]):
                    raise OpError(f"Target member '{parsed_args.member}' not found")
                matched[0]["member"] = parsed_args.member

            matched[0]["s"] = s_val

        # 10. SET_COMPONENT
        elif op_name == "set_component":
            cid = parsed_args.id
            matched = [c for c in d["components"] if c["id"] == cid]
            if not matched:
                raise OpError(f"Component '{cid}' not found")

            fields = parsed_args.fields
            comp = matched[0]
            if "mass" in fields:
                comp["mass"] = _clamp_val(float(fields["mass"]), MIN_MASS, MAX_MASS, "component.mass", warnings)
            if "limit_g" in fields:
                comp["limit_g"] = float(fields["limit_g"]) if fields["limit_g"] is not None else None
            if "s" in fields:
                s_val = float(fields["s"])
                if s_val < 0.0 or s_val > 1.0:
                    raise OpError(f"Position s {s_val} must be between 0.0 and 1.0")
                comp["s"] = s_val
            if "member" in fields:
                if not any(m["id"] == fields["member"] for m in d["members"]):
                    raise OpError(f"Member '{fields['member']}' not found")
                comp["member"] = fields["member"]

        # 11. REMOVE_COMPONENT
        elif op_name == "remove_component":
            cid = parsed_args.id
            orig_len = len(d["components"])
            d["components"] = [c for c in d["components"] if c["id"] != cid]
            if len(d["components"]) == orig_len:
                raise OpError(f"Component '{cid}' not found")

        # 12. SET_MOUNT
        elif op_name == "set_mount":
            cid = parsed_args.component
            matched = [c for c in d["components"] if c["id"] == cid]
            if not matched:
                raise OpError(f"Component '{cid}' not found")

            comp = matched[0]
            m_dict = comp.setdefault("mount", {})

            if parsed_args.preset:
                pname = parsed_args.preset.lower().strip()
                if pname not in MOUNTS and pname != "rigid":
                    raise OpError(f"Unknown mount preset '{pname}'. Available: {list(MOUNTS.keys())}")
                m_dict["preset"] = pname
                if pname in MOUNTS:
                    m_dict["kv"] = float(MOUNTS[pname]["kv"])
                    m_dict["zeta"] = float(MOUNTS[pname]["zeta"])

            if parsed_args.kv is not None:
                m_dict["kv"] = _clamp_val(float(parsed_args.kv), MIN_KV, MAX_KV, "mount.kv", warnings)
            if parsed_args.zeta is not None:
                m_dict["zeta"] = _clamp_val(float(parsed_args.zeta), 0.0, 1.0, "mount.zeta", warnings)

        # 13. SET_EXCITATION
        elif op_name == "set_excitation":
            cid = parsed_args.component
            matched = [c for c in d["components"] if c["id"] == cid]
            if not matched:
                raise OpError(f"Component '{cid}' not found")

            comp = matched[0]
            exc = comp.setdefault("excitation", {"type": "unbalance"})
            if parsed_args.rpm_min is not None:
                exc["rpm_min"] = _clamp_val(float(parsed_args.rpm_min), MIN_RPM, MAX_RPM, "rpm_min", warnings)
            if parsed_args.rpm_max is not None:
                exc["rpm_max"] = _clamp_val(float(parsed_args.rpm_max), MIN_RPM, MAX_RPM, "rpm_max", warnings)
            if parsed_args.me is not None:
                exc["me"] = float(parsed_args.me)
            if parsed_args.orders is not None:
                exc["orders"] = [float(o) for o in parsed_args.orders]
            if parsed_args.blades is not None:
                exc["blades"] = int(parsed_args.blades)

        # 14. SET_ANALYSIS
        elif op_name == "set_analysis":
            fields = parsed_args.fields
            an = d.setdefault("analysis", {})
            if "rpm_min" in fields:
                an["rpm_min"] = _clamp_val(float(fields["rpm_min"]), MIN_RPM, MAX_RPM, "analysis.rpm_min", warnings)
            if "rpm_max" in fields:
                an["rpm_max"] = _clamp_val(float(fields["rpm_max"]), MIN_RPM, MAX_RPM, "analysis.rpm_max", warnings)
            if "rpm_points" in fields:
                an["rpm_points"] = int(_clamp_val(float(fields["rpm_points"]), 10, 5000, "analysis.rpm_points", warnings))
            if "n_elements_per_member" in fields:
                an["n_elements_per_member"] = int(_clamp_val(float(fields["n_elements_per_member"]), 2, 50, "analysis.n_elements", warnings))
            if "method" in fields:
                m_val = str(fields["method"]).lower()
                an["method"] = m_val if m_val in ("rom", "full", "sparse") else "rom"
            if "beam_zeta" in fields:
                an["beam_zeta"] = _clamp_val(float(fields["beam_zeta"]), 0.001, 0.5, "analysis.beam_zeta", warnings)

    # Re-validate with official DesignModel schema
    try:
        DesignModel.model_validate(d)
    except Exception as dval_err:
        raise OpError(f"Applied operations resulted in an invalid design schema: {dval_err}") from dval_err

    return d, warnings
