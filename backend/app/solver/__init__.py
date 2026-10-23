"""ResonAI frame solver package.

Sign and unit conventions:
- Units: SI everywhere internally (m, kg, N, Pa, s, Hz, rad/s).
- Coordinate system: 2D planar (x, y); y is vertical (thrust / vibration excitation direction).
- Nodal DOFs: [u, v, theta] where u is x-displacement, v is y-displacement, theta is in-plane rotation (CCW positive).
- Component DOF: 1 vertical translation DOF (yc) connected to beam transverse DOF through mount spring-damper.
"""
