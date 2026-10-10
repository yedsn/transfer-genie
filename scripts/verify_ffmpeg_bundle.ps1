param([string]$ExpectedVersion)

$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $PSScriptRoot "..\tools\ffmpeg\sidecars.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if (-not $ExpectedVersion) { $ExpectedVersion = [string]$manifest.version }
$isWindowsPlatform = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$executableName = if ($isWindowsPlatform) { "ffmpeg.exe" } else { "ffmpeg" }
$sidecar = Join-Path $PSScriptRoot "..\tools\ffmpeg\$executableName"
if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) { throw "Missing FFmpeg sidecar: $sidecar" }
$versionLines = @(& $sidecar -version 2>&1)
$versionExitCode = $LASTEXITCODE
$firstLine = $versionLines | Select-Object -First 1
if ($versionExitCode -ne 0 -or $firstLine -notmatch ([regex]::Escape($ExpectedVersion))) {
  throw "Expected FFmpeg $ExpectedVersion, got: $firstLine (exit code $versionExitCode)"
}
foreach ($requiredFile in @("FFMPEG_LICENSE.txt", "FFMPEG_BUILD_README.txt", "sidecars.json")) {
  $requiredPath = Join-Path $PSScriptRoot "..\tools\ffmpeg\$requiredFile"
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Missing FFmpeg bundle metadata: $requiredPath"
  }
}
Write-Host "Verified FFmpeg sidecar: $firstLine"
