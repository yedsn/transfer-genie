param(
  [ValidateRange(1, 3)]
  [int]$Attempts = 2
)

$ErrorActionPreference = "Stop"
$retryCache = $null
$isWindowsPlatform = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$npmCommand = if ($isWindowsPlatform) { "npm.cmd" } else { "npm" }

try {
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    Write-Host "Installing frontend dependencies (attempt $attempt/$Attempts)..."
    if ($attempt -eq 1) {
      & $npmCommand ci --no-audit --no-fund
    } else {
      if (-not $retryCache) {
        $retryCache = Join-Path ([System.IO.Path]::GetTempPath()) ("transfer-genie-npm-cache-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $retryCache -Force | Out-Null
      }
      & $npmCommand ci --no-audit --no-fund --prefer-online --cache $retryCache
    }

    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      Write-Host "Frontend dependencies installed successfully."
      return
    }
    if ($attempt -eq $Attempts) {
      throw "npm ci failed after $Attempts attempts (last exit code $exitCode)."
    }

    Write-Warning "npm ci failed with exit code $exitCode. Retrying with a fresh temporary npm cache."
    Start-Sleep -Seconds 3
  }
} finally {
  if ($retryCache -and (Test-Path -LiteralPath $retryCache)) {
    Remove-Item -LiteralPath $retryCache -Recurse -Force -ErrorAction SilentlyContinue
  }
}
