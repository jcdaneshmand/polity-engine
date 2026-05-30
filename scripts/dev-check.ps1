param(
  [switch]$NoLaunch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRoot = Join-Path $RepoRoot "imperium-like-digital-prototype"
$ToolsPath = Join-Path $RepoRoot ".codex-tools"
$DevUrl = "http://localhost:5173"

if (-not (Test-Path $ProjectRoot)) {
  throw "Project root not found: $ProjectRoot"
}

if (Test-Path $ToolsPath) {
  $env:Path = "$ToolsPath;$env:Path"
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
  }
}

Write-Host "Using npm:" -ForegroundColor Cyan
Invoke-CheckedCommand npm --version

Push-Location $ProjectRoot
try {
  Write-Host ""
  Write-Host "Running engine tests..." -ForegroundColor Cyan
  Invoke-CheckedCommand npm test

  Write-Host ""
  Write-Host "Running TypeScript checks..." -ForegroundColor Cyan
  Invoke-CheckedCommand npm run typecheck

  if ($NoLaunch) {
    Write-Host ""
    Write-Host "Checks passed. Skipping dev server because -NoLaunch was provided." -ForegroundColor Green
    return
  }

  Write-Host ""
  Write-Host "Checks passed. Starting Vite at $DevUrl" -ForegroundColor Green
  Invoke-CheckedCommand npm run dev
}
finally {
  Pop-Location
}
