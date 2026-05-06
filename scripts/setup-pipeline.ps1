$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$venvPath = Join-Path $repoRoot "pipeline\venv"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"
$requirementsPath = Join-Path $repoRoot "pipeline\requirements.txt"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python was not found on PATH. Install Python 3.10+ for Windows, then run npm run setup:pipeline again."
}

if (-not (Test-Path $pythonPath)) {
  python -m venv $venvPath
}

& $pythonPath -m pip install --upgrade pip setuptools wheel
& $pythonPath -m pip install -r $requirementsPath

Write-Host "Pipeline environment ready: $pythonPath"
