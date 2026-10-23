"""Pre-warm LLM agent disk cache for hackathon demo prompts.

Runs 3 canonical demo requests through the live LLM adapter:
(a) mode build, empty design: 'Quadcopter with 4 aluminium arms and a camera on the center body, motors up to 9000 RPM'
(b) mode continue on drone preset: 'add a gyro near the center and make the arms carbon fibre'
(c) mode fix with drone analysis findings: 'reduce camera vibration'

Skips gracefully with a notice if GEMINI_API_KEY is not configured.
"""

import os
from pathlib import Path
import sys
import time
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
load_dotenv(dotenv_path=backend_dir / ".env")

from app.agent.provider import get_llm
from app.agent.service import handle_chat
from app.presets import get_demo_design
from app.schemas import AgentChatRequest, ChatMessage
from app.solver.pipeline import solve_design
from app.solver.post import build_response


def main():
    print("=" * 80)
    print("WARMING AGENT DISK CACHE (backend/cache/agent_cache.json)")
    print("=" * 80)

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("[NOTICE] GEMINI_API_KEY not configured in backend/.env. Skipping live warm-up gracefully.")
        print("Offline rule-based fallback is active and ready.")
        return

    llm = get_llm()
    drone = get_demo_design("drone")

    # Run quick drone analysis to get realistic findings for prompt (c)
    sol = solve_design(drone, method="rom")
    drone_analysis = build_response(drone, sol)

    prompts = [
        (
            "Demo (a) [Mode: build, empty design]",
            AgentChatRequest(
                mode="build",
                design={},
                messages=[ChatMessage(role="user", content="Quadcopter with 4 aluminium arms and a camera on the center body, motors up to 9000 RPM")],
            ),
        ),
        (
            "Demo (b) [Mode: continue on drone preset]",
            AgentChatRequest(
                mode="continue",
                design=drone,
                messages=[ChatMessage(role="user", content="add a gyro near the center and make the arms carbon fibre")],
            ),
        ),
        (
            "Demo (c) [Mode: fix with drone analysis findings]",
            AgentChatRequest(
                mode="fix",
                design=drone,
                analysis=drone_analysis,
                messages=[ChatMessage(role="user", content="reduce camera vibration")],
            ),
        ),
    ]

    for label, req in prompts:
        print(f"\n--- Running {label} ---")
        try:
            t0 = time.perf_counter()
            resp = handle_chat(req, llm=llm)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            print(f"Source: {resp.source.upper()} ({elapsed_ms:.1f} ms)")
            print(f"Assistant: {resp.assistant_message[:140]}...")
            print(f"Ops emitted ({len(resp.ops)}):")
            for desc in resp.op_descriptions:
                print(f"  - {desc}")
            if resp.action:
                print(f"Action: {resp.action}")
            if resp.warnings:
                print(f"Warnings: {resp.warnings}")
        except Exception as e:
            print(f"Error during warming: {e}")

    print("\n" + "=" * 80)
    print("Agent cache warming routine completed.")
    print("=" * 80)


if __name__ == "__main__":
    main()
