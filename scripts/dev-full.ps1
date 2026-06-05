param(
  [int]$ServerPort = 8000,
  [int]$AppPort = 5173
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ProjectRoot = Join-Path $RepoRoot "imperium-like-digital-prototype"
$ServerUrl = "http://127.0.0.1:$ServerPort"
$AppUrl = "http://127.0.0.1:$AppPort"

if (-not (Test-Path $ProjectRoot)) {
  throw "Project root not found: $ProjectRoot"
}

function Wait-HttpOk {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = "unreachable"
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return
      }
      $lastError = "status $($response.StatusCode)"
    }
    catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 500
  }

  throw "Timed out waiting for $Url ($lastError)"
}

function Start-DevJob {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Script,
    [Parameter(Mandatory = $true)]
    [object[]]$ArgumentList
  )

  Start-Job -Name $Name -ScriptBlock $Script -ArgumentList $ArgumentList
}

$jobs = @()
try {
  Write-Host "Checking multiplayer server on $ServerUrl" -ForegroundColor Cyan
  try {
    Wait-HttpOk "$ServerUrl/polity/lobby/rooms" -TimeoutSeconds 1
    Write-Host "Using existing multiplayer server on $ServerUrl" -ForegroundColor Green
  }
  catch {
    Write-Host "Starting multiplayer server on $ServerUrl" -ForegroundColor Cyan
    $jobs += Start-DevJob -Name "polity-server" -ArgumentList @($ProjectRoot, $ServerPort) -Script {
      param($ProjectRoot, $ServerPort)
      Set-Location $ProjectRoot
      $env:POLITY_SERVER_PORT = [string]$ServerPort
      npm run server:dev
    }
    Wait-HttpOk "$ServerUrl/polity/lobby/rooms"
  }

  Write-Host "Starting app on $AppUrl" -ForegroundColor Cyan
  $jobs += Start-DevJob -Name "polity-app" -ArgumentList @($ProjectRoot, $ServerUrl, $AppPort) -Script {
    param($ProjectRoot, $ServerUrl, $AppPort)
    Set-Location $ProjectRoot
    $env:VITE_MULTIPLAYER_DEV_PROXY_TARGET = $ServerUrl
    npm run dev -w app -- --host 127.0.0.1 --port $AppPort
  }

  Write-Host "Dev stack is running. Press Ctrl+C to stop both processes." -ForegroundColor Green
  while ($true) {
    foreach ($job in $jobs) {
      Receive-Job $job
      if ($job.State -in @("Completed", "Failed", "Stopped")) {
        throw "$($job.Name) exited with state $($job.State)"
      }
    }
    Start-Sleep -Milliseconds 500
  }
}
finally {
  foreach ($job in $jobs) {
    Stop-Job $job -ErrorAction SilentlyContinue
    Receive-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
  }
}
