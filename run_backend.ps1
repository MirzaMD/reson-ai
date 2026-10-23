# Launch ResonAI backend in production mode (no auto-reload)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path "$ScriptDir\backend"
Write-Host "Starting ResonAI Backend on http://127.0.0.1:8000 (Production Mode)..." -ForegroundColor Cyan
& ".\.venv\Scripts\uvicorn.exe" app.main:app --host 127.0.0.1 --port 8000
