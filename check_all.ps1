# ResonAI Full Stack Verification Gate
# Runs backend fast test suite, frontend TypeScript compiler, ESLint, and JSON contract checks.
# Returns exit code 0 if all quality gates pass, 1 otherwise.

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "             ResonAI Full Quality Gate Check              " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$allPassed = $true

# 1. Backend Fast Tests (< 25 s)
Write-Host "`n[1/4] Running Backend Fast Pytest Suite..." -ForegroundColor Cyan
Set-Location -Path (Join-Path $ScriptDir "backend")
$pytestExe = ".\.venv\Scripts\pytest.exe"
if (Test-Path $pytestExe) {
    & $pytestExe -m "not slow" --durations=8
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] Backend pytest tests failed!" -ForegroundColor Red
        $allPassed = $false
    } else {
        Write-Host "[PASS] Backend tests passed." -ForegroundColor Green
    }
} else {
    Write-Host "[FAIL] Backend virtualenv not found at $pytestExe." -ForegroundColor Red
    $allPassed = $false
}

# 2. Frontend Type Checking
Write-Host "`n[2/4] Running Frontend TypeScript Typecheck (tsc --noEmit)..." -ForegroundColor Cyan
Set-Location -Path (Join-Path $ScriptDir "frontend")
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Frontend TypeScript checks failed!" -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "[PASS] Frontend TypeScript passed." -ForegroundColor Green
}

# 3. Frontend ESLint
Write-Host "`n[3/4] Running Frontend ESLint..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Frontend linting failed!" -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "[PASS] Frontend ESLint passed." -ForegroundColor Green
}

# 4. JSON Contract Check
Write-Host "`n[4/4] Running JSON Contract Verification..." -ForegroundColor Cyan
npm run check:contract
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] JSON contract check failed!" -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "[PASS] JSON contract check passed." -ForegroundColor Green
}

Set-Location -Path $ScriptDir

Write-Host "`n==========================================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "       [PASS] ALL QUALITY GATES PASSED (100% OK)         " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "       [FAIL] ONE OR MORE QUALITY GATES FAILED           " -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Cyan
    exit 1
}
