# Launch ResonAI frontend server
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -Path "$ScriptDir\frontend"

Write-Host "Checking frontend configuration..." -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules not found. Running npm install..." -ForegroundColor Yellow
    npm install
}

if (-not (Test-Path ".env.local")) {
    Write-Host "Creating .env.local from .env.local.example..." -ForegroundColor Yellow
    Copy-Item ".env.local.example" ".env.local"
}

Write-Host "Starting ResonAI Frontend on http://127.0.0.1:3000..." -ForegroundColor Green
npm run dev
