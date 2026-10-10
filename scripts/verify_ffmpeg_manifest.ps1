param(
  [switch]$CheckRemoteMetadata,
  [switch]$CheckArchives,
  [string]$ProxyUrl
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $repoRoot "tools\ffmpeg\sidecars.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$expectedTargets = @("windows-x64", "macos-arm64", "macos-x64")

function Get-VerifiedDownload([string]$Url, [string]$ExpectedHash, [string]$Destination) {
  $arguments = @("--fail", "--location", "--silent", "--show-error", "--connect-timeout", "20", "--max-time", "180", "--output", $Destination)
  if (-not [string]::IsNullOrWhiteSpace($ProxyUrl)) { $arguments += @("--proxy", $ProxyUrl) }
  $arguments += $Url
  & curl.exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "Download failed for $Url (curl exit code $LASTEXITCODE)." }
  $actualHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $ExpectedHash.Trim().ToLowerInvariant()) {
    throw "SHA-256 mismatch for $Url. Expected $ExpectedHash, got $actualHash."
  }
}

function Assert-ExecutableArchitecture([string]$Path, [string]$TargetName) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $reader = [System.IO.BinaryReader]::new($stream)
    if ($TargetName -eq "windows-x64") {
      if ($reader.ReadUInt16() -ne 0x5A4D) { throw "$TargetName archive is not a PE executable." }
      $stream.Position = 0x3C
      $peOffset = $reader.ReadUInt32()
      $stream.Position = $peOffset
      if ($reader.ReadUInt32() -ne 0x00004550) { throw "$TargetName archive has an invalid PE header." }
      if ($reader.ReadUInt16() -ne 0x8664) { throw "$TargetName archive is not PE x64." }
      return
    }

    $stream.Position = 0
    $magic = $reader.ReadBytes(4)
    $cpu = $reader.ReadBytes(4)
    $magicHex = ($magic | ForEach-Object { $_.ToString("x2") }) -join ""
    if ($magicHex -notin @("cffaedfe", "feedfacf")) {
      throw "$TargetName archive is not a 64-bit Mach-O executable."
    }
    $littleEndian = $magicHex -eq "cffaedfe"
    $cpuBytes = if ($littleEndian) { $cpu } else { [byte[]]($cpu[3], $cpu[2], $cpu[1], $cpu[0]) }
    $cpuType = [BitConverter]::ToUInt32($cpuBytes, 0)
    $expectedCpu = if ($TargetName -eq "macos-arm64") { [uint32]0x0100000C } else { [uint32]0x01000007 }
    if ($cpuType -ne $expectedCpu) {
      throw ("$TargetName archive has unexpected Mach-O CPU type 0x{0:x8}." -f $cpuType)
    }
  } finally {
    if ($reader) { $reader.Dispose() } else { $stream.Dispose() }
  }
}

if ([string]::IsNullOrWhiteSpace([string]$manifest.version)) { throw "FFmpeg manifest version is missing." }
if ($manifest.license -ne "GPL-3.0-or-later") { throw "Unexpected FFmpeg bundle license: $($manifest.license)" }
foreach ($targetName in $expectedTargets) {
  $target = $manifest.targets.$targetName
  if (-not $target) { throw "Missing FFmpeg manifest target: $targetName" }
  foreach ($field in @("archiveUrl", "archiveSha256", "executableName", "executableSha256", "licenseUrl", "licenseSha256", "readmeUrl", "readmeSha256")) {
    if ([string]::IsNullOrWhiteSpace([string]$target.$field)) { throw "Missing $targetName.$field" }
  }
  foreach ($hashField in @("archiveSha256", "executableSha256", "licenseSha256", "readmeSha256")) {
    if ([string]$target.$hashField -notmatch '^[0-9a-f]{64}$') { throw "Invalid SHA-256 in $targetName.$hashField" }
  }
  if ([int64]$target.archiveBytes -le 0) { throw "Invalid archive size for $targetName" }
  if ($CheckRemoteMetadata) {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/eugeneware/ffmpeg-static/releases/tags/$($manifest.releaseTag)"
    $assetName = Split-Path ([uri]$target.archiveUrl).AbsolutePath -Leaf
    $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    if (-not $asset) { throw "Release asset not found for ${targetName}: $assetName" }
    if ([int64]$asset.size -ne [int64]$target.archiveBytes) { throw "Release asset size changed for $targetName." }
    if ([string]$asset.digest -ne "sha256:$($target.archiveSha256)") { throw "Release digest changed for $targetName." }
  }
  if ($CheckArchives) {
    $archivePath = Join-Path ([System.IO.Path]::GetTempPath()) ("transfer-genie-ffmpeg-audit-" + [guid]::NewGuid().ToString("N") + ".gz")
    $executablePath = Join-Path ([System.IO.Path]::GetTempPath()) ("transfer-genie-ffmpeg-audit-" + [guid]::NewGuid().ToString("N"))
    $licensePath = "$executablePath.license"
    $readmePath = "$executablePath.readme"
    try {
      Get-VerifiedDownload ([string]$target.archiveUrl) ([string]$target.archiveSha256) $archivePath
      $inputStream = [System.IO.File]::OpenRead($archivePath)
      try {
        $gzipStream = [System.IO.Compression.GZipStream]::new($inputStream, [System.IO.Compression.CompressionMode]::Decompress)
        try {
          $outputStream = [System.IO.File]::Create($executablePath)
          try { $gzipStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
        } finally { $gzipStream.Dispose() }
      } finally { $inputStream.Dispose() }
      Assert-ExecutableArchitecture $executablePath $targetName
      $executableHash = (Get-FileHash -LiteralPath $executablePath -Algorithm SHA256).Hash.ToLowerInvariant()
      Write-Host "$targetName executable sha256=$executableHash"
      if ($executableHash -ne ([string]$target.executableSha256).ToLowerInvariant()) {
        throw "Executable SHA-256 mismatch for $targetName. Expected $($target.executableSha256), got $executableHash."
      }
      Get-VerifiedDownload ([string]$target.licenseUrl) ([string]$target.licenseSha256) $licensePath
      Get-VerifiedDownload ([string]$target.readmeUrl) ([string]$target.readmeSha256) $readmePath
      if ((Get-Item -LiteralPath $licensePath).Length -le 0 -or (Get-Item -LiteralPath $readmePath).Length -le 0) {
        throw "$targetName license or build README is empty."
      }
    } finally {
      foreach ($path in @($archivePath, $executablePath, $licensePath, $readmePath)) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
      }
    }
  }
}

$tauriConfig = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "tauri.conf.json") | ConvertFrom-Json
$resources = @($tauriConfig.bundle.resources)
if ($resources -notcontains "tools/ffmpeg/*") { throw "tauri.conf.json does not package tools/ffmpeg/*." }
if ($resources -notcontains "THIRD_PARTY_NOTICES.md") { throw "tauri.conf.json does not package THIRD_PARTY_NOTICES.md." }

$rustSource = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "src\media_preview.rs")
if ($rustSource -notmatch ('FFMPEG_BUNDLE_VERSION: &str = "' + [regex]::Escape([string]$manifest.version) + '"')) {
  throw "Rust FFmpeg version does not match the sidecar manifest."
}

Write-Host "Verified FFmpeg manifest $($manifest.version) for $($expectedTargets.Count) targets."
