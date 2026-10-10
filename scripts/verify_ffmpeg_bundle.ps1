param([string]$ExpectedVersion)

$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $PSScriptRoot "..\tools\ffmpeg\sidecars.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$isWindowsPlatform = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$isMacPlatform = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
$targetName = if ($isWindowsPlatform -and $architecture -eq "x64") {
  "windows-x64"
} elseif ($isMacPlatform -and $architecture -eq "arm64") {
  "macos-arm64"
} elseif ($isMacPlatform -and $architecture -eq "x64") {
  "macos-x64"
} else {
  throw "No bundled FFmpeg target for the current platform: $architecture"
}
if (-not $ExpectedVersion) { $ExpectedVersion = [string]$manifest.targets.$targetName.reportedVersion }
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) { throw "FFmpeg reported version is missing from manifest: $targetName" }
$expectedVersionPattern = '^ffmpeg version ' + [regex]::Escape($ExpectedVersion) + '([-+ ]|$)'
$executableName = if ($isWindowsPlatform) { "ffmpeg.exe" } else { "ffmpeg" }
$sidecar = Join-Path $PSScriptRoot "..\tools\ffmpeg\$executableName"
if (-not (Test-Path -LiteralPath $sidecar -PathType Leaf)) { throw "Missing FFmpeg sidecar: $sidecar" }
$versionLines = @(& $sidecar -version 2>&1)
$versionExitCode = $LASTEXITCODE
$firstLine = $versionLines | Select-Object -First 1
if ($versionExitCode -ne 0 -or $firstLine -notmatch $expectedVersionPattern) {
  throw "Expected FFmpeg $ExpectedVersion, got: $firstLine (exit code $versionExitCode)"
}
foreach ($requiredFile in @("FFMPEG_LICENSE.txt", "FFMPEG_BUILD_README.txt", "sidecars.json")) {
  $requiredPath = Join-Path $PSScriptRoot "..\tools\ffmpeg\$requiredFile"
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Missing FFmpeg bundle metadata: $requiredPath"
  }
}
Write-Host "Verified FFmpeg sidecar: $firstLine"
