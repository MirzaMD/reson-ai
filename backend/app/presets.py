"""Shared presets for materials, mounts, components, and structural templates in SI units.

Conventions:
- E in Pa
- Density rho in kg/m^3
- Yield strength in MPa (or Pa internally converted)
- Mount stiffness kv in N/m, damping ratio zeta (dimensionless)
- Masses in kg
- Unbalance me in kg*m
"""

from typing import Any, Dict

MATERIALS: Dict[str, Dict[str, Any]] = {
    "steel": {
        "name": "Steel (Structural)",
        "E": 200e9,
        "rho": 7850.0,
        "yield_mpa": 250.0,
    },
    "aluminium_6061": {
        "name": "Aluminium 6061-T6",
        "E": 69e9,
        "rho": 2700.0,
        "yield_mpa": 240.0,
    },
    "titanium": {
        "name": "Titanium (Grade 5)",
        "E": 110e9,
        "rho": 4500.0,
        "yield_mpa": 880.0,
    },
    "cfrp": {
        "name": "CFRP Quasi-Isotropic",
        "E": 70e9,
        "rho": 1600.0,
        "yield_mpa": 600.0,
    },
    "abs_plastic": {
        "name": "ABS Plastic",
        "E": 2.3e9,
        "rho": 1050.0,
        "yield_mpa": 40.0,
    },
}

MOUNTS: Dict[str, Dict[str, Any]] = {
    "rubber_soft": {"name": "Soft Rubber", "kv": 2e4, "zeta": 0.10},
    "rubber_medium": {"name": "Medium Rubber", "kv": 1e5, "zeta": 0.08},
    "silicone_gel": {"name": "Silicone Gel", "kv": 5e4, "zeta": 0.15},
    "foam": {"name": "Polyurethane Foam", "kv": 1e4, "zeta": 0.20},
    "steel_spring": {"name": "Steel Spring", "kv": 5e4, "zeta": 0.005},
    "wire_rope": {"name": "Wire Rope Isolator", "kv": 8e4, "zeta": 0.12},
    "rigid": {"name": "Rigid Mount", "kv": 1e8, "zeta": 0.01},
}

COMPONENTS: Dict[str, Dict[str, Any]] = {
    "motor": {
        "name": "BLDC Motor (2212)",
        "kind": "motor",
        "mass": 0.055,
        "mount": "rubber_medium",
        "excitation": {
            "type": "unbalance",
            "rpm_min": 1000,
            "rpm_max": 12000,
            "me": 2e-6,
            "orders": [1],
            "blades": 2,
        },
    },
    "fan": {
        "name": "Cooling Fan",
        "kind": "fan",
        "mass": 0.10,
        "mount": "rubber_soft",
        "excitation": {
            "type": "unbalance",
            "rpm_min": 1000,
            "rpm_max": 6000,
            "me": 5e-6,
            "orders": [1],
            "blades": 5,
        },
    },
    "pump": {
        "name": "Fluid Pump",
        "kind": "pump",
        "mass": 0.80,
        "mount": "rubber_medium",
        "excitation": {
            "type": "unbalance",
            "rpm_min": 1500,
            "rpm_max": 3500,
            "me": 2e-5,
            "orders": [1],
        },
    },
    "compressor": {
        "name": "Mini Compressor",
        "kind": "compressor",
        "mass": 3.0,
        "mount": "wire_rope",
        "excitation": {
            "type": "unbalance",
            "rpm_min": 1000,
            "rpm_max": 3000,
            "me": 1e-4,
            "orders": [1],
        },
    },
    "camera": {
        "name": "Payload Camera / Sensor",
        "kind": "camera",
        "mass": 0.15,
        "mount": "silicone_gel",
        "limit_g": 0.5,
    },
    "gyro": {
        "name": "IMU / Gyroscope",
        "kind": "gyro",
        "mass": 0.005,
        "mount": "foam",
        "limit_g": 1.0,
    },
    "flight_controller": {
        "name": "Flight Controller PCB",
        "kind": "flight_controller",
        "mass": 0.03,
        "mount": "silicone_gel",
        "limit_g": 1.0,
    },
    "battery": {
        "name": "LiPo Battery Pack",
        "kind": "battery",
        "mass": 0.25,
        "mount": "rigid",
    },
    "generic_mass": {
        "name": "Generic Lumped Mass",
        "kind": "generic_mass",
        "mass": 0.1,
        "mount": "rigid",
    },
}

STRUCTURE_PRESETS = [
    "quad_drone_diagonal",
    "simply_supported_beam",
    "cantilever",
    "fixed_fixed",
    "l_frame",
    "portal_frame",
    "box_frame",
]


def get_all_presets() -> Dict[str, Any]:
    return {
        "materials": MATERIALS,
        "mounts": MOUNTS,
        "components": COMPONENTS,
        "structures": STRUCTURE_PRESETS,
    }


def get_demo_design(name: str) -> Dict[str, Any]:
    """Retrieve full parameter specification for a demo structure.

    Available demo designs:
    - 'drone' or 'quad_drone_diagonal': Tuned quadcopter diagonal arm with BLDC motors,
      battery, IMU, and payload gimbal camera.
    - 'cantilever_demo': 0.5m aluminium cantilever beam with tip fan excitation and sensor.
    - 'simply_supported_demo': 1.0m steel tube beam with midspan fluid pump and sensor.
    """
    key = name.lower().strip()

    if key in ["drone", "quad_drone_diagonal", "drone_demo"]:
        # =========================================================================
        # Drone Diagonal Arm Parameter Rationale:
        # - Coordinates: nodes at x = -0.15, 0.0, +0.15 m represent a 300 mm diagonal span.
        # - Members: rect 0.016 m wide x 0.004 m thick CFRP quasi-isotropic (E=70 GPa, rho=1600 kg/m^3).
        #   Real drone arms are typically 15-20 mm wide and 3-5 mm thick carbon plates or tubes.
        # - Support: hover support spring at center node n2 (kx=2000 N/m, ky=2000 N/m, kr=5.0 N*m/rad).
        #   Simulates the low-frequency vertical aerodynamic thrust-to-weight hover bounce (~9.6 Hz)
        #   and pitch roll compliance without artificially pinning the airframe.
        # - Motors: two 2212 BLDC motors (0.055 kg each) at the arm extremities (s=0.0 and s=1.0).
        #   Unbalance me = 1.8e-6 kg*m (ISO 1940 G6.3 grade balance for small brushless rotors).
        #   Mounted via medium rubber grommets (kv=100 kN/m, zeta=0.08).
        # - Center Body & Payload:
        #   - 3S 1500mAh LiPo battery (0.25 kg) rigidly attached at center node (m1, s=1.0).
        #   - Flight controller IMU (0.005 kg, limit 1.0 g RMS) on foam mount (kv=10 kN/m, zeta=0.20) at m1, s=0.85.
        #   - HD FPV/Inspection camera (0.15 kg, limit 0.5 g RMS) on silicone gel mount (kv=40 kN/m, zeta=0.15) at m2, s=0.15.
        #   Mount kv=40,000 N/m places camera mount resonance at ~82 Hz (crosses 1x excitation in cruising RPM band 4000-5000 RPM,
        #   causing critical limit violation, which is resolved when kv is softened).
        # =========================================================================
        return {
            "name": "Quad_Drone_Diagonal",
            "plane": "xy",
            "nodes": [
                {"id": "n1", "x": -0.15, "y": 0.0},
                {"id": "n2", "x": 0.0, "y": 0.0},
                {"id": "n3", "x": 0.15, "y": 0.0},
            ],
            "members": [
                {
                    "id": "m1",
                    "n1": "n1",
                    "n2": "n2",
                    "material": "cfrp",
                    "section": {"type": "rect", "w": 0.016, "h": 0.004},
                },
                {
                    "id": "m2",
                    "n1": "n2",
                    "n2": "n3",
                    "material": "cfrp",
                    "section": {"type": "rect", "w": 0.016, "h": 0.004},
                },
            ],
            "supports": [
                {"node": "n2", "type": "spring", "kx": 2000.0, "ky": 2000.0, "kr": 5.0}
            ],
            "components": [
                {
                    "id": "motor_left",
                    "kind": "motor",
                    "member": "m1",
                    "s": 0.0,
                    "mass": 0.055,
                    "mount": {"preset": "rubber_medium", "kv": 100000.0, "zeta": 0.08},
                    "excitation": {
                        "type": "unbalance",
                        "rpm_min": 1000.0,
                        "rpm_max": 12000.0,
                        "me": 1.8e-6,
                        "orders": [1.0],
                        "blades": 2,
                    },
                },
                {
                    "id": "motor_right",
                    "kind": "motor",
                    "member": "m2",
                    "s": 1.0,
                    "mass": 0.055,
                    "mount": {"preset": "rubber_medium", "kv": 100000.0, "zeta": 0.08},
                    "excitation": {
                        "type": "unbalance",
                        "rpm_min": 1000.0,
                        "rpm_max": 12000.0,
                        "me": 1.8e-6,
                        "orders": [1.0],
                        "blades": 2,
                    },
                },
                {
                    "id": "camera",
                    "kind": "camera",
                    "member": "m2",
                    "s": 0.15,
                    "mass": 0.15,
                    "mount": {"preset": "silicone_gel", "kv": 40000.0, "zeta": 0.15},
                    "limit_g": 0.5,
                },
                {
                    "id": "imu",
                    "kind": "gyro",
                    "member": "m1",
                    "s": 0.85,
                    "mass": 0.005,
                    "mount": {"preset": "foam", "kv": 10000.0, "zeta": 0.20},
                    "limit_g": 1.0,
                },
                {
                    "id": "battery_center",
                    "kind": "battery",
                    "member": "m1",
                    "s": 1.0,
                    "mass": 0.25,
                    "mount": {"preset": "rigid", "kv": 1e8, "zeta": 0.01},
                },
            ],
            "analysis": {
                "rpm_min": 1000.0,
                "rpm_max": 12000.0,
                "n_points": 400,
                "beam_zeta": 0.02,
                "n_elements_per_member": 20,
            },
        }

    elif key in ["cantilever_demo", "cantilever"]:
        # =========================================================================
        # Cantilever Demo Rationale:
        # - Geometry: 0.50 m long aluminium 6061 bar (E=69 GPa, rho=2700 kg/m^3).
        #   Cross-section: rect w=0.020 m (20 mm), h=0.010 m (10 mm depth).
        # - Support: fully fixed at root n1 (x=0.0).
        # - Excitation: cooling fan (0.10 kg) at free tip s=1.0 running 1,000 to 6,000 RPM.
        #   Unbalance me = 5.0e-6 kg*m on rubber_soft mount (kv=20 kN/m, zeta=0.10).
        # - Sensitive sensor: camera / optical sensor at s=0.70 with limit_g = 0.5 g RMS.
        # =========================================================================
        return {
            "name": "Cantilever_Fan_Demo",
            "plane": "xy",
            "nodes": [
                {"id": "n1", "x": 0.0, "y": 0.0},
                {"id": "n2", "x": 0.50, "y": 0.0},
            ],
            "members": [
                {
                    "id": "m1",
                    "n1": "n1",
                    "n2": "n2",
                    "material": "aluminium_6061",
                    "section": {"type": "rect", "w": 0.020, "h": 0.010},
                }
            ],
            "supports": [{"node": "n1", "type": "fixed"}],
            "components": [
                {
                    "id": "cooling_fan",
                    "kind": "fan",
                    "member": "m1",
                    "s": 1.0,
                    "mass": 0.10,
                    "mount": {"preset": "rubber_soft", "kv": 20000.0, "zeta": 0.10},
                    "excitation": {
                        "type": "unbalance",
                        "rpm_min": 1000.0,
                        "rpm_max": 6000.0,
                        "me": 5.0e-6,
                        "orders": [1.0],
                        "blades": 5,
                    },
                },
                {
                    "id": "sensor",
                    "kind": "camera",
                    "member": "m1",
                    "s": 0.70,
                    "mass": 0.12,
                    "mount": {"preset": "silicone_gel", "kv": 30000.0, "zeta": 0.12},
                    "limit_g": 0.5,
                },
            ],
            "analysis": {
                "rpm_min": 1000.0,
                "rpm_max": 6000.0,
                "n_points": 200,
                "beam_zeta": 0.02,
                "n_elements_per_member": 30,
            },
        }

    elif key in ["simply_supported_demo", "simply_supported"]:
        # =========================================================================
        # Simply Supported Demo Rationale:
        # - Geometry: 1.0 m span steel circular tube (E=200 GPa, rho=7850 kg/m^3).
        #   Outer diameter d=0.040 m (40 mm), wall thickness t=0.002 m (2 mm).
        # - Supports: pinned at left n1 (x=0.0), roller at right n2 (x=1.0).
        # - Excitation: fluid pump (0.80 kg) at midspan s=0.50 running 1,200 to 3,600 RPM.
        #   Unbalance me = 2.0e-5 kg*m on rubber_medium mount (kv=100 kN/m, zeta=0.08).
        # - Sensitive sensor: accelerometer / instrument package at s=0.30 with limit_g = 0.8 g RMS.
        # =========================================================================
        return {
            "name": "Simply_Supported_Pump_Demo",
            "plane": "xy",
            "nodes": [
                {"id": "n1", "x": 0.0, "y": 0.0},
                {"id": "n2", "x": 1.0, "y": 0.0},
            ],
            "members": [
                {
                    "id": "m1",
                    "n1": "n1",
                    "n2": "n2",
                    "material": "steel",
                    "section": {"type": "tube", "d": 0.040, "t": 0.002},
                }
            ],
            "supports": [
                {"node": "n1", "type": "pinned"},
                {"node": "n2", "type": "roller"},
            ],
            "components": [
                {
                    "id": "fluid_pump",
                    "kind": "pump",
                    "member": "m1",
                    "s": 0.50,
                    "mass": 0.80,
                    "mount": {"preset": "rubber_medium", "kv": 100000.0, "zeta": 0.08},
                    "excitation": {
                        "type": "unbalance",
                        "rpm_min": 1200.0,
                        "rpm_max": 3600.0,
                        "me": 2.0e-5,
                        "orders": [1.0],
                    },
                },
                {
                    "id": "instrument_pack",
                    "kind": "flight_controller",
                    "member": "m1",
                    "s": 0.30,
                    "mass": 0.05,
                    "mount": {"preset": "foam", "kv": 15000.0, "zeta": 0.18},
                    "limit_g": 0.8,
                },
            ],
            "analysis": {
                "rpm_min": 1000.0,
                "rpm_max": 4000.0,
                "n_points": 200,
                "beam_zeta": 0.02,
                "n_elements_per_member": 30,
            },
        }

    else:
        raise ValueError(f"Unknown preset design '{name}'. Available: 'drone', 'cantilever_demo', 'simply_supported_demo'")

