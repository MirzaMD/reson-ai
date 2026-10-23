# ResonAI Full Stack Concurrent Launcher
# Starts both Python FastAPI backend (127.0.0.1:8000) and Next.js frontend (127.0.0.1:3000)
# Press Ctrl+C to cleanly stop both processes.

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "                Launching ResonAI Stack                   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Environment and dependency checks
$BackendDir = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"
$PythonExe = Join-Path $BackendDir ".venv\Scripts\python.exe"
$UvicornExe = Join-Path $BackendDir ".venv\Scripts\uvicorn.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Host "Backend virtual environment missing at $PythonExe." -ForegroundColor Red
    Write-Host "Please run: cd backend; python -m venv .venv; pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "Frontend node_modules missing. Installing dependencies..." -ForegroundColor Yellow
    Set-Location $FrontendDir
    npm install
    Set-Location $ScriptDir
}

if (-not (Test-Path (Join-Path $FrontendDir ".env.local"))) {
    Copy-Item (Join-Path $FrontendDir ".env.local.example") (Join-Path $FrontendDir ".env.local")
}

$backendProc = $null
$frontendProc = $null

try {
    # 2. Start Backend Process
    Write-Host "[1/2] Starting FastAPI backend on http://127.0.0.1:8000..." -ForegroundColor Cyan
    $backendStartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $backendStartInfo.FileName = $UvicornExe
    $backendStartInfo.Arguments = "app.main:app --host 127.0.0.1 --port 8000"
    $backendStartInfo.WorkingDirectory = $BackendDir
    $backendStartInfo.UseShellExecute = $false
    $backendProc = [System.Diagnostics.Process]::Start($backendStartInfo)

    # Wait for backend to respond
    $backendReady = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($resp) {
                $backendReady = $true
                break
            }
        } catch {}
    }

    if ($backendReady) {
        Write-Host "✓ Backend ready and listening at http://127.0.0.1:8000" -ForegroundColor Green
    } else {
        Write-Host "Backend took longer than 15s to respond, proceeding..." -ForegroundColor Yellow
    }

    # 3. Start Frontend Process
    Write-Host "[2/2] Starting Next.js frontend on http://127.0.0.1:3000..." -ForegroundColor Cyan
    $frontendStartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $frontendStartInfo.FileName = "npm.cmd"
    $frontendStartInfo.Arguments = "run dev"
    $frontendStartInfo.WorkingDirectory = $FrontendDir
    $frontendStartInfo.UseShellExecute = $false
    $frontendProc = [System.Diagnostics.Process]::Start($frontendStartInfo)

    Write-Host "`n✓ Full stack is active!" -ForegroundColor Green
    Write-Host "  👉 Frontend: http://127.0.0.1:3000" -ForegroundColor White
    Write-Host "  👉 Backend:  http://127.0.0.1:8000 (Docs: http://127.0.0.1:8000/docs)" -ForegroundColor White
    Write-Host "`nPress Ctrl+C to stop all services...`n" -ForegroundColor DarkGray

    # Wait indefinitely until interrupted
    while (-not $backendProc.HasExited -and -not $frontendProc.HasExited) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nShutting down ResonAI services..." -ForegroundColor Yellow
    if ($backendProc -and -not $backendProc.HasExited) {
        Write-Host "Stopping backend (PID $($backendProc.Id))..." -ForegroundColor DarkGray
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProc -and -not $frontendProc.HasExited) {
        Write-Host "Stopping frontend (PID $($frontendProc.Id))..." -ForegroundColor DarkGray
        Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "All services stopped." -ForegroundColor Green
}
