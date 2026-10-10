param(
  [ValidateSet("windows-x64", "macos-arm64", "macos-x64")]
  [string]$Target
)

$ErrorActionPreference = "Stop"
$isWindowsPlatform = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
$isMacPlatform = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if (-not $Target) {
  if ($isWindowsPlatform -and $architecture -eq "x64") { $Target = "windows-x64" }
  elseif ($isMacPlatform -and $architecture -eq "arm64") { $Target = "macos-arm64" }
  elseif ($isMacPlatform -and $architecture -eq "x64") { $Target = "macos-x64" }
  else { throw "No bundled FFmpeg target for the current platform: $architecture" }
}
$expectedHost = switch ($Target) {
  "windows-x64" { $isWindowsPlatform -and $architecture -eq "x64" }
  "macos-arm64" { $isMacPlatform -and $architecture -eq "arm64" }
  "macos-x64" { $isMacPlatform -and $architecture -eq "x64" }
}
if (-not $expectedHost) {
  throw "FFmpeg target $Target cannot be executed and verified on this host ($architecture)."
}

$manifestPath = Join-Path $PSScriptRoot "..\tools\ffmpeg\sidecars.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$targetConfig = $manifest.targets.$Target
if (-not $targetConfig) { throw "FFmpeg target is missing from manifest: $Target" }
$SourceUrl = [string]$targetConfig.archiveUrl
$Sha256 = [string]$targetConfig.archiveSha256
$ExpectedVersion = [string]$targetConfig.reportedVersion
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) { throw "FFmpeg reported version is missing from manifest: $Target" }
$expectedVersionPattern = '^ffmpeg version ' + [regex]::Escape($ExpectedVersion) + '([-+ ]|$)'
$targetDirectory = Join-Path $PSScriptRoot "..\tools\ffmpeg"
$executableName = [string]$targetConfig.executableName
$targetPath = Join-Path $targetDirectory $executableName
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) ("transfer-genie-ffmpeg-" + [guid]::NewGuid().ToString("N"))

function Get-VerifiedDownload([string]$Url, [string]$ExpectedHash, [string]$Destination) {
  $attempts = 3
  for ($attempt = 1; $attempt -le $attempts; $attempt++) {
    try {
      Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -MaximumRetryCount 2 -RetryIntervalSec 3
      break
    } catch {
      if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Force }
      if ($attempt -eq $attempts) {
        throw "Download failed after $attempts attempts for $Url`: $($_.Exception.Message)"
      }
      Write-Warning "Download attempt $attempt/$attempts failed for $Url`: $($_.Exception.Message)"
      Start-Sleep -Seconds (3 * $attempt)
    }
  }
  $actualHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $ExpectedHash.Trim().ToLowerInvariant()) {
    throw "SHA-256 mismatch for $Url. Expected $ExpectedHash, got $actualHash."
  }
  return $actualHash
}

New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
try {
  $actualHash = Get-VerifiedDownload $SourceUrl $Sha256 $archivePath

  $extension = [System.IO.Path]::GetExtension(([uri]$SourceUrl).AbsolutePath).ToLowerInvariant()
  if ($extension -eq ".zip") {
    $extractDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("transfer-genie-ffmpeg-extract-" + [guid]::NewGuid().ToString("N"))
    try {
      Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDirectory -Force
      $candidate = Get-ChildItem -LiteralPath $extractDirectory -Recurse -File | Where-Object { $_.Name -eq $executableName } | Select-Object -First 1
      if (-not $candidate) { throw "FFmpeg executable was not found in the archive." }
      Copy-Item -LiteralPath $candidate.FullName -Destination $targetPath -Force
    } finally {
      if (Test-Path -LiteralPath $extractDirectory) { Remove-Item -LiteralPath $extractDirectory -Recurse -Force }
    }
  } elseif ($extension -eq ".gz") {
    $inputStream = [System.IO.File]::OpenRead($archivePath)
    try {
      $gzipStream = [System.IO.Compression.GZipStream]::new($inputStream, [System.IO.Compression.CompressionMode]::Decompress)
      try {
        $outputStream = [System.IO.File]::Create($targetPath)
        try { $gzipStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
      } finally { $gzipStream.Dispose() }
    } finally { $inputStream.Dispose() }
  } else {
    Copy-Item -LiteralPath $archivePath -Destination $targetPath -Force
  }

  $executableHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($executableHash -ne ([string]$targetConfig.executableSha256).ToLowerInvariant()) {
    throw "Executable SHA-256 mismatch for $Target. Expected $($targetConfig.executableSha256), got $executableHash."
  }

  $licensePath = Join-Path $targetDirectory "FFMPEG_LICENSE.txt"
  $readmePath = Join-Path $targetDirectory "FFMPEG_BUILD_README.txt"
  Get-VerifiedDownload ([string]$targetConfig.licenseUrl) ([string]$targetConfig.licenseSha256) $licensePath | Out-Null
  Get-VerifiedDownload ([string]$targetConfig.readmeUrl) ([string]$targetConfig.readmeSha256) $readmePath | Out-Null

  if (-not $isWindowsPlatform) { & chmod +x $targetPath }
  $versionLines = @(& $targetPath -version 2>&1)
  $versionExitCode = $LASTEXITCODE
  $versionOutput = $versionLines | Select-Object -First 1
  if ($versionExitCode -ne 0 -or $versionOutput -notmatch $expectedVersionPattern) {
    throw "Expected FFmpeg $ExpectedVersion for $Target, got: $versionOutput (exit code $versionExitCode)"
  }
  Write-Host "Prepared $targetPath for $Target ($versionOutput, archive sha256=$actualHash, executable sha256=$executableHash)"
} finally {
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
}
