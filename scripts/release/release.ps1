param(
  [Parameter(Position = 0)]
  [string]$Version,
  [string]$Branch,
  [switch]$Push
)

$ErrorActionPreference = "Stop"
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Fail([string]$Message) {
  Write-Host "[release] Error: $Message" -ForegroundColor Red
  exit 1
}

function Read-Json([string]$Path) {
  Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-Json([string]$Path, $Data) {
  $json = $Data | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Set-CargoVersion([string]$Path, [string]$TargetVersion) {
  $text = [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
  $updated = [regex]::Replace($text, '(?m)^version\s*=\s*"[^"]+"', "version = `"$TargetVersion`"", 1)
  if ($updated -eq $text) { Fail "Failed to update Cargo.toml version." }
  [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "Missing required command: $Name"
  }
}

Assert-Command git

# Read current version from Cargo.toml
$cargoPath = Join-Path $RootDir "Cargo.toml"
$cargoText = [System.IO.File]::ReadAllText($cargoPath, [System.Text.UTF8Encoding]::new($false))
if ($cargoText -notmatch '(?m)^version\s*=\s*"([^"]+)"') {
  Fail "Cannot read version from Cargo.toml"
}
$currentVersion = $Matches[1]

# Suggest versions
$suggestedPatch = ""
$suggestedMinor = ""
$suggestedMajor = ""
if ($currentVersion -match '^(\d+)\.(\d+)\.(\d+)$') {
  $major = [int]$Matches[1]
  $minor = [int]$Matches[2]
  $patch = [int]$Matches[3]
  $suggestedPatch = "$major.$minor.$($patch + 1)"
  $suggestedMinor = "$major.$($minor + 1).0"
  $suggestedMajor = "$($major + 1).0.0"
}

# Determine version
if (-not $Version) {
  if ($suggestedPatch -and $suggestedMinor -and $suggestedMajor) {
    Write-Host "[release] 当前版本: $currentVersion"
    Write-Host "[release] 请选择版本类型:"
    Write-Host "  1) patch -> $suggestedPatch"
    Write-Host "  2) minor -> $suggestedMinor"
    Write-Host "  3) major -> $suggestedMajor"
    Write-Host "  4) custom"

    $choice = Read-Host "请输入选项 [默认: 1]"
    $choice = if ($choice.Trim()) { $choice.Trim() } else { "1" }

    switch ($choice) {
      "1" { $Version = $suggestedPatch }
      "2" { $Version = $suggestedMinor }
      "3" { $Version = $suggestedMajor }
      "4" {
        $customVersion = Read-Host "请输入自定义版本号"
        $Version = $customVersion.Trim()
      }
      default { Fail "无效选项，请输入 1、2、3 或 4" }
    }
  } else {
    $inputVersion = Read-Host "请输入版本号"
    $Version = $inputVersion.Trim()
  }
}

if ($Version -notmatch '^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$') {
  Fail "Version must look like 0.1.2 or 0.1.2-beta.1"
}

# Determine branch
if (-not $Branch) {
  $currentBranch = git -C $RootDir branch --show-current 2>$null
  if (-not $currentBranch) { $currentBranch = "master" }
  $inputBranch = Read-Host "Release branch [默认: $currentBranch]"
  $Branch = if ($inputBranch.Trim()) { $inputBranch.Trim() } else { $currentBranch }
}

# Validate git state
$remotes = @(git -C $RootDir remote)
if ($remotes.Count -eq 0) { Fail "No git remotes configured." }

$dirty = git -C $RootDir status --porcelain
if ($dirty) {
  Fail "Working tree is not clean. Commit or stash changes before running the release script."
}

$localTag = git -C $RootDir tag --list "v$Version"
if ($localTag) { Fail "Git tag v$Version already exists locally." }

foreach ($remote in $remotes) {
  $existing = git -C $RootDir ls-remote --tags $remote "refs/tags/v$Version" 2>$null
  if ($existing) { Fail "Git tag v$Version already exists on remote '$remote'." }
}

Write-Host "[release] Preparing Transfer Genie v$Version"
Write-Host "[release] Branch: $Branch"
Write-Host "[release] Remotes: $($remotes -join ', ')"

# Update versions
Set-CargoVersion $cargoPath $Version

$tauriPath = Join-Path $RootDir "tauri.conf.json"
$tauri = Read-Json $tauriPath
$tauri.version = $Version
Write-Json $tauriPath $tauri

# Validate tauri.conf.json is still valid JSON
$null = Read-Json $tauriPath

Write-Host "[release] Updated versions:"
Select-String -LiteralPath $cargoPath -Pattern "^version = " | ForEach-Object { Write-Host "  Cargo.toml:$($_.LineNumber): $($_.Line)" }
Select-String -LiteralPath $tauriPath -Pattern '"version":' | Select-Object -First 1 | ForEach-Object { Write-Host "  tauri.conf.json:$($_.LineNumber): $($_.Line)" }

# Commit and tag
git -C $RootDir add Cargo.toml tauri.conf.json
git -C $RootDir commit -m "release: v$Version"
git -C $RootDir tag -a "v$Version" -m "Release v$Version"

Write-Host "[release] Created commit and tag v$Version"

if ($Push) {
  foreach ($remote in $remotes) {
    Write-Host "[release] Pushing to $remote"
    git -C $RootDir push $remote $Branch
    git -C $RootDir push $remote "v$Version"
  }
  Write-Host "[release] Pushed $Branch and tag v$Version to all remotes"
  Write-Host "[release] Next: open https://github.com/yedsn/transfer-genie/actions and verify the Release workflow"
} else {
  Write-Host "[release] Push skipped. Next commands:"
  foreach ($remote in $remotes) {
    Write-Host "  git push $remote $Branch"
    Write-Host "  git push $remote v$Version"
  }
}
