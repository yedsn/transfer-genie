param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("windows-x64", "macos-arm64", "macos-x64")]
  [string]$Target,

  [ValidateSet("debug", "release")]
  [string]$Profile = "release",

  [switch]$LaunchMacApp,

  [string]$ReportPath
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot "tools/ffmpeg/sidecars.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$manifestTarget = $manifest.targets.$Target
if (-not $manifestTarget) { throw "FFmpeg manifest is missing target $Target." }
$expectedFfmpegVersion = [string]$manifestTarget.reportedVersion
if ([string]::IsNullOrWhiteSpace($expectedFfmpegVersion)) { throw "FFmpeg reported version is missing from manifest: $Target" }
$expectedFfmpegVersionPattern = '^ffmpeg version ' + [regex]::Escape($expectedFfmpegVersion) + '([-+ ]|$)'
$requiredMetadata = @(
  "tools/ffmpeg/FFMPEG_BUILD_README.txt",
  "tools/ffmpeg/FFMPEG_LICENSE.txt",
  "tools/ffmpeg/README.md",
  "tools/ffmpeg/sidecars.json",
  "THIRD_PARTY_NOTICES.md"
)

function Assert-Path {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing $Label`: $Path"
  }
}

function Get-Sha256 {
  param([string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-MacArchitecture {
  param([string]$Path, [string]$ExpectedArchitecture, [string]$Label)
  $description = (& file -b $Path 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect $Label architecture: $description" }
  if ($description -notmatch [regex]::Escape($ExpectedArchitecture)) {
    throw "Unexpected $Label architecture. Expected $ExpectedArchitecture, got: $description"
  }
  return $description
}

$report = [ordered]@{
  target = $Target
  profile = $Profile
  verifiedAtUtc = [DateTime]::UtcNow.ToString("o")
  error = $null
  bundle = $null
  bundleSha256 = $null
  ffmpeg = $null
  ffmpegVersion = $null
  applicationExecutable = $null
  applicationArchitecture = $null
  launchVerified = $false
}

function Write-VerificationReport {
  $path = if ($ReportPath) { $ReportPath } else { Join-Path $repoRoot "target/release-verification/$Target.json" }
  $directory = Split-Path -Parent $path
  if ($directory) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
  $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $path -Encoding UTF8
  Write-Output "Wrote release verification report: $path"
}

trap {
  $report.error = $_.Exception.Message
  Write-Error $report.error -ErrorAction Continue
  Write-VerificationReport
  exit 1
}

if ($Target -eq "windows-x64") {
  if (-not $IsWindows) { throw "windows-x64 bundle verification must run on Windows." }

  $profileRoot = Join-Path $repoRoot "target/$Profile"
  $installer = Get-ChildItem -LiteralPath (Join-Path $profileRoot "bundle/nsis") -Filter "*-setup.exe" -File |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if (-not $installer) { throw "No NSIS installer was found under $profileRoot/bundle/nsis." }

  $installerScript = Join-Path $profileRoot "nsis/x64/installer.nsi"
  Assert-Path $installerScript "generated NSIS script"
  $scriptText = Get-Content -LiteralPath $installerScript -Raw -Encoding UTF8
  foreach ($resource in $requiredMetadata + @("tools/ffmpeg/ffmpeg.exe")) {
    $nsisPath = $resource.Replace("/", "\")
    if ($scriptText -notmatch [regex]::Escape($nsisPath)) {
      throw "Generated NSIS script does not package $resource."
    }
  }

  $report.bundle = $installer.FullName
  $report.bundleSha256 = Get-Sha256 $installer.FullName
  $report.ffmpeg = "tools/ffmpeg/ffmpeg.exe"
  $sourceFfmpeg = Join-Path $repoRoot "tools/ffmpeg/ffmpeg.exe"
  if ((Get-Sha256 $sourceFfmpeg) -ne $manifestTarget.executableSha256.ToLowerInvariant()) {
    throw "Windows FFmpeg executable does not match the pinned manifest."
  }
  $ffmpegVersionLines = @(& $sourceFfmpeg -version 2>&1)
  $ffmpegVersionExitCode = $LASTEXITCODE
  $report.ffmpegVersion = ($ffmpegVersionLines | Select-Object -First 1 | Out-String).Trim()
  if ($ffmpegVersionExitCode -ne 0 -or $report.ffmpegVersion -notmatch $expectedFfmpegVersionPattern) {
    throw "Packaged FFmpeg did not report version $expectedFfmpegVersion for ${Target}: $($report.ffmpegVersion) (exit code $ffmpegVersionExitCode)"
  }
  Write-Output "Verified Windows NSIS bundle: $($installer.FullName)"
} else {
  if (-not $IsMacOS) { throw "$Target bundle verification must run on macOS." }

  $rustTarget = if ($Target -eq "macos-arm64") { "aarch64-apple-darwin" } else { "x86_64-apple-darwin" }
  $expectedArchitecture = if ($Target -eq "macos-arm64") { "arm64" } else { "x86_64" }
  $profileRoot = Join-Path $repoRoot "target/$rustTarget/$Profile"
  $dmg = Get-ChildItem -LiteralPath (Join-Path $profileRoot "bundle/dmg") -Filter "*.dmg" -File |
    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if (-not $dmg) { throw "No DMG was found under $profileRoot/bundle/dmg." }

  $mountPoint = Join-Path ([System.IO.Path]::GetTempPath()) ("transfer-genie-dmg-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $mountPoint | Out-Null
  $appProcess = $null
  try {
    $attachOutput = (& hdiutil attach -readonly -nobrowse -mountpoint $mountPoint $dmg.FullName 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Unable to mount DMG: $attachOutput" }

    $appBundle = Get-ChildItem -LiteralPath $mountPoint -Filter "*.app" -Directory | Select-Object -First 1
    if (-not $appBundle) { throw "Mounted DMG does not contain an application bundle." }
    $resourcesRoot = Join-Path $appBundle.FullName "Contents/Resources"
    foreach ($resource in $requiredMetadata) {
      Assert-Path (Join-Path $resourcesRoot $resource) "packaged resource $resource"
    }

    $ffmpeg = Join-Path $resourcesRoot "tools/ffmpeg/ffmpeg"
    Assert-Path $ffmpeg "packaged FFmpeg executable"
    if ((Get-Sha256 $ffmpeg) -ne $manifestTarget.executableSha256.ToLowerInvariant()) {
      throw "Packaged FFmpeg executable does not match the pinned manifest for $Target."
    }
    $ffmpegArchitecture = Assert-MacArchitecture $ffmpeg $expectedArchitecture "FFmpeg"
    $ffmpegVersionLines = @(& $ffmpeg -version 2>&1)
    $ffmpegVersionExitCode = $LASTEXITCODE
    $ffmpegVersion = ($ffmpegVersionLines | Select-Object -First 1 | Out-String).Trim()
    if ($ffmpegVersionExitCode -ne 0 -or $ffmpegVersion -notmatch $expectedFfmpegVersionPattern) {
      throw "Packaged FFmpeg did not report version $expectedFfmpegVersion for ${Target}: $ffmpegVersion (exit code $ffmpegVersionExitCode)"
    }

    $infoPlist = Join-Path $appBundle.FullName "Contents/Info.plist"
    Assert-Path $infoPlist "application Info.plist"
    $executableName = (& /usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" $infoPlist 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($executableName)) {
      throw "Unable to resolve CFBundleExecutable from $infoPlist`: $executableName"
    }
    $applicationExecutablePath = Join-Path $appBundle.FullName "Contents/MacOS/$executableName"
    Assert-Path $applicationExecutablePath "application executable"
    $applicationArchitecture = Assert-MacArchitecture $applicationExecutablePath $expectedArchitecture "application"

    $report.bundle = $dmg.FullName
    $report.bundleSha256 = Get-Sha256 $dmg.FullName
    $report.ffmpeg = $ffmpeg
    $report.ffmpegVersion = $ffmpegVersion
    $report.applicationExecutable = $applicationExecutablePath
    $report.applicationArchitecture = $applicationArchitecture

    if ($LaunchMacApp) {
      $appData = Join-Path ([System.IO.Path]::GetTempPath()) ("transfer-genie-app-data-" + [guid]::NewGuid().ToString("N"))
      $stdoutPath = Join-Path $appData "stdout.log"
      $stderrPath = Join-Path $appData "stderr.log"
      New-Item -ItemType Directory -Path $appData | Out-Null
      $previousAppData = $env:TRANSFER_GENIE_APP_DATA_DIR
      $previousFfmpeg = $env:TRANSFER_GENIE_FFMPEG
      try {
        $env:TRANSFER_GENIE_APP_DATA_DIR = $appData
        $env:TRANSFER_GENIE_FFMPEG = $ffmpeg
        $appProcess = Start-Process -FilePath $applicationExecutablePath -ArgumentList @("--release-smoke-test") -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        Start-Sleep -Seconds 8
        $appProcess.Refresh()
        if ($appProcess.HasExited) {
          $stdout = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw } else { "" }
          $stderr = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { "" }
          throw "Packaged macOS application exited during launch smoke test (code $($appProcess.ExitCode)).`n$stdout`n$stderr"
        }
        $report.launchVerified = $true
      } finally {
        if ($appProcess -and -not $appProcess.HasExited) { Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue }
        $env:TRANSFER_GENIE_APP_DATA_DIR = $previousAppData
        $env:TRANSFER_GENIE_FFMPEG = $previousFfmpeg
        Remove-Item -LiteralPath $appData -Recurse -Force -ErrorAction SilentlyContinue
      }
    }

    Write-Output "Verified macOS DMG bundle: $($dmg.FullName) ($ffmpegArchitecture)"
  } finally {
    if (Test-Path -LiteralPath $mountPoint) {
      & hdiutil detach $mountPoint -force | Out-Null
      Remove-Item -LiteralPath $mountPoint -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-VerificationReport
