# ResonAI Backend

The core structural dynamics solver, optimization engine, and FastAPI server for ResonAI.

For comprehensive system documentation, architecture diagrams, demo walkthroughs, and environment configurations, please refer to the primary repository documentation:

👉 **[ResonAI Documentation (Root README.md)](../README.md)**

---

## Quick Backend Reference

### Setup
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
```

### Launch Server
```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Run Tests
```powershell
# Fast suite (< 25 s)
pytest -m "not slow" --durations=8

# Full suite
pytest --durations=8
```

### Check LLM connectivity
Set `LLM_PROVIDER=openrouter` and `OPENROUTER_API_KEY` in `backend/.env`. Optionally set `OPENROUTER_MODEL` (defaults to `openai/gpt-4o-mini`), then run:
```powershell
python scripts/llm_smoke.py
```
The script sends a short request through the selected provider and checks that the model returns valid JSON with `ok: true` and the exact echoed word. `LLM_PROVIDER=gemini` remains supported with `GEMINI_API_KEY` and `GEMINI_MODEL`. It exits with a non-zero status if the provider request or response check fails.
