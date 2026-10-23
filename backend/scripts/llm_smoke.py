"""Small smoke test verifying Gemini LLM connectivity and structured JSON parsing.

Usage:
    python scripts/llm_smoke.py [word]
"""

from pathlib import Path
import sys
import time

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.agent.provider import LLMError, get_llm


def run_smoke(word: str = "vibration") -> dict:
    llm = get_llm()
    system = "You are a test assistant. You must respond ONLY with a JSON object matching this schema: {\"ok\": true, \"echo\": string}."
    messages = [{"role": "user", "content": f"Echo this word in the json response: '{word}'"}]

    t0 = time.perf_counter()
    result = llm.chat_json(system=system, messages=messages)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    print(f"LLM smoke test succeeded in {elapsed_ms:.1f} ms:")
    print(result)
    return result


def main():
    word = sys.argv[1] if len(sys.argv) > 1 else "resonai"
    try:
        run_smoke(word)
    except LLMError as err:
        err_msg = str(err)
        if "404" in err_msg:
            print(f"[ERROR] 404: Invalid model ID. Please check GEMINI_MODEL in backend/.env")
        elif "429" in err_msg:
            print(f"[ERROR] 429: Gemini API rate limit or quota exceeded.")
        else:
            print(f"[ERROR] LLM test failed: {err_msg}")
        sys.exit(1)


if __name__ == "__main__":
    main()
