"""Rule-based and keyword fallback system when LLM is offline or unavailable.

Provides deterministic ops mapping and template explanation generation without network calls.
"""

import copy
import re
from typing import Any, Dict, List, Optional, Tuple


def fallback_chat(
    user_text: str,
    design: Optional[Dict[str, Any]],
    mode: str = "continue",
    analysis: Optional[Dict[str, Any]] = None,
    candidates: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Offline rule-based fallback generating operations and assistant message."""
    text_lower = user_text.lower()
    ops: List[Dict[str, Any]] = []
    action: Optional[str] = None
    msg_parts: List[str] = []

    # 1. Structure templates
    if re.search(r"\b(drone|quad|quadcopter)\b", text_lower):
        ops.append({"op": "load_preset", "args": {"name": "drone"}})
        msg_parts.append("Loaded quadcopter drone structural model preset.")
    elif re.search(r"\bcantilever\b", text_lower):
        ops.append({"op": "load_preset", "args": {"name": "cantilever"}})
        msg_parts.append("Loaded aluminium cantilever beam preset.")
    elif re.search(r"\bsimply\s+supported\b", text_lower):
        ops.append({"op": "load_preset", "args": {"name": "simply_supported"}})
        msg_parts.append("Loaded simply-supported beam preset.")

    # 2. Materials
    if re.search(r"\b(carbon|cfrp)\b", text_lower):
        ops.append({"op": "set_material", "args": {"member": "all", "material": "cfrp"}})
        msg_parts.append("Set all member materials to carbon fibre (CFRP).")
    elif re.search(r"\b(alumin|aluminum|aluminium)\b", text_lower):
        ops.append({"op": "set_material", "args": {"member": "all", "material": "aluminium_6061"}})
        msg_parts.append("Set all member materials to aluminium 6061.")
    elif re.search(r"\bsteel\b", text_lower):
        ops.append({"op": "set_material", "args": {"member": "all", "material": "steel"}})
        msg_parts.append("Set all member materials to structural steel.")
    elif re.search(r"\btitanium\b", text_lower):
        ops.append({"op": "set_material", "args": {"member": "all", "material": "titanium"}})
        msg_parts.append("Set all member materials to titanium.")
    elif re.search(r"\bplastic\b", text_lower):
        ops.append({"op": "set_material", "args": {"member": "all", "material": "abs_plastic"}})
        msg_parts.append("Set all member materials to ABS plastic.")

    # 3. Components
    mem_id = "m1"
    if design and design.get("members"):
        mem_id = design["members"][0]["id"]

    if re.search(r"\bcamera\b", text_lower):
        ops.append({
            "op": "add_component",
            "args": {"kind": "camera", "member": mem_id, "s": 0.5, "limit_g": 0.5},
        })
        msg_parts.append(f"Added camera with isolation mount on member '{mem_id}' at midspan.")
    elif re.search(r"\b(gyro|imu)\b", text_lower):
        ops.append({
            "op": "add_component",
            "args": {"kind": "gyro", "member": mem_id, "s": 0.5, "limit_g": 1.0},
        })
        msg_parts.append(f"Added IMU / gyroscope sensor on member '{mem_id}' at midspan.")
    elif re.search(r"\bmotor\b", text_lower):
        ops.append({
            "op": "add_component",
            "args": {"kind": "motor", "member": mem_id, "s": 0.5},
        })
        msg_parts.append(f"Added motor on member '{mem_id}' at midspan.")
    elif re.search(r"\bfan\b", text_lower):
        ops.append({
            "op": "add_component",
            "args": {"kind": "fan", "member": mem_id, "s": 0.5},
        })
        msg_parts.append(f"Added cooling fan on member '{mem_id}' at midspan.")
    elif re.search(r"\bpump\b", text_lower):
        ops.append({
            "op": "add_component",
            "args": {"kind": "pump", "member": mem_id, "s": 0.5},
        })
        msg_parts.append(f"Added fluid pump on member '{mem_id}' at midspan.")
    elif re.search(r"\bbattery\b", text_lower):
        ops.append({
            "op": "add_component",
            "args": {"kind": "battery", "member": mem_id, "s": 0.5},
        })
        msg_parts.append(f"Added battery pack on member '{mem_id}' at midspan.")

    # 4. Actions
    if re.search(r"\b(optimi|reduce\s+vibrat|mitigat|triage|fix)\b", text_lower):
        action = "run_optimization"
        msg_parts.append("Triggered automated mount parameter optimization.")
    elif re.search(r"\b(run|analy|simulat|sweep)\b", text_lower):
        action = "run_analysis"
        msg_parts.append("Triggered frequency sweep simulation.")

    if not msg_parts:
        if mode == "explain":
            assistant_msg = template_explanation(analysis, candidates)
        else:
            assistant_msg = "Acknowledged request. No specific rules matched; please specify structural modifications or requested action."
    else:
        assistant_msg = " ".join(msg_parts)

    return {
        "assistant_message": assistant_msg,
        "ops": ops,
        "action": action,
        "clarifying_question": None,
    }


def template_explanation(
    analysis: Optional[Dict[str, Any]],
    candidates: Optional[List[Dict[str, Any]]],
) -> str:
    """Generate deterministic, purely factual engineering explanation from simulation numbers."""
    sections: List[str] = ["### Simulation and Triage Report"]

    if analysis:
        # Findings
        findings = analysis.get("findings", [])
        if findings:
            sections.append(f"\n**Identified Engineering Findings ({len(findings)}):**")
            for f in findings:
                sev = f.get("severity", "info").upper()
                ftype = f.get("type", "finding")
                detail = f.get("detail", "")
                rpm = f.get("rpm")
                rpm_str = f" at {rpm:.0f} RPM" if rpm is not None else ""
                sections.append(f"- [{sev}] **{ftype}**{rpm_str}: {detail}")
        else:
            sections.append("\n**Findings:** No critical vibration limits or resonance crossings detected.")

        # Max stress
        max_stress = analysis.get("max_stress_mpa")
        if max_stress:
            val = max_stress.get("value_mpa", 0.0)
            ratio = max_stress.get("ratio", 0.0) * 100.0
            sections.append(f"\n**Max Bending Stress:** {val:.2f} MPa ({ratio:.1f}% of allowable).")

        # Sensitive components
        comps = analysis.get("components", [])
        if isinstance(comps, list) and comps:
            sections.append("\n**Sensitive Component Peak Accelerations:**")
            for c in comps:
                cid = c.get("id")
                pk = c.get("peak_accel_g")
                lim = c.get("limit_g")
                st = c.get("status", "ok").upper()
                at_rpm = c.get("at_rpm", 0.0)
                if lim is not None:
                    sections.append(f"- **{cid}**: {pk:.3f} g RMS at {at_rpm:.0f} RPM (Limit: {lim:.2f} g, Status: {st})")

    if candidates:
        sections.append(f"\n**Optimization Proposed Candidates ({len(candidates)}):**")
        for cand in candidates:
            rank = cand.get("rank", 1)
            label = cand.get("label", "Candidate")
            red = cand.get("reduction_pct", 0.0)
            sections.append(f"\n#### Candidate {rank}: [{label}] ({red:.1f}% Peak Reduction)")
            changes = cand.get("changes", [])
            for ch in changes:
                lbl = ch.get("label") if isinstance(ch, dict) else getattr(ch, "label", str(ch))
                sections.append(f"  - {lbl}")

    return "\n".join(sections)
