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
