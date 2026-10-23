# Rules for the AI agent (ResonAI backend)

Project docs (repo root): 00_MASTER_CONTEXT.md and 01_PERSON1_SOLVER_BACKEND.md. Read both before coding.
Live status: PROGRESS.md. Read it at the start of every session and update it at the end of every milestone.

I own ONLY backend/. Never edit frontend/ or the 00/01/02 markdown files.
Exception: you may write mock_analyze.json at the repo root (shared with the frontend).

## Working style
1. Work one milestone at a time (see PROGRESS.md). Stop after each milestone and wait for me.
2. Plan first in 5-10 lines, then code. Small diffs. Do not rewrite working files.
3. Ask one short question if something is unclear. Do not guess on physics or contract details.
4. Do not re-read the whole repo each time. Read only what the milestone needs plus PROGRESS.md.

## Engineering rules
5. SI units everywhere internally (m, kg, N, Pa, s, Hz). Convert only at an API edge, and only if the contract says so. State sign and unit conventions in a code comment at the top of each solver module.
6. The JSON contract in 00_MASTER_CONTEXT.md section 6 is frozen. Do not rename, remove or reshape fields. If you think it must change, stop and tell me.
7. Every solver feature needs a pytest test. Run the tests and show the actual output before saying "done".
8. Physics checks: after any solver change, print the first 3 computed natural frequencies next to the analytical ones. K and M must be symmetric; M must be positive definite.
9. Use scipy.linalg.eigh(K, M) for the generalized eigenproblem. Never use eig.
10. Pure numpy/scipy for the solver. No FEM libraries.

## Security and LLM rules
11. Never hardcode secrets. Keys come from backend/.env via python-dotenv. Never print or log keys. Keep .env in .gitignore, commit only .env.example.
12. The LLM never computes physics or invents numbers. All numbers shown to users come from the solver. The LLM edits designs only through whitelisted, validated ops.
13. The app must work with no network: keep the template/keyword fallback for the agent.

## End of every milestone
14. Update PROGRESS.md: what was built, files touched, test results (paste real output), decisions and assumptions, known issues, and the exact next step.
