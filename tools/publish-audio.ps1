# Uploads recorded clips to the knighthops/jp-trainer-audio repo (served by GitHub Pages),
# writes the list of published clips to data/audio.json, and deletes the local copies.
# The clips never enter this project or its git history.
#
#   powershell -ExecutionPolicy Bypass -File tools/publish-audio.ps1 -From <folder with .m4a files>
param([Parameter(Mandatory)][string]$From, [string]$Repo = 'knighthops/jp-trainer-audio', [switch]$Keep)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$From = (Resolve-Path $From).Path
$clips = @(Get-ChildItem $From -Filter *.m4a | Where-Object { $_.Length -gt 0 })
if (-not $clips.Count) { throw "No .m4a clips in $From." }

# A throwaway clone next to the clips, removed at the end.
$work = Join-Path ([IO.Path]::GetTempPath()) "jp-trainer-audio-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
# Commit as whoever commits to the app repo.
$name = git -C $root config user.name
$email = git -C $root config user.email
git clone --depth 1 "https://github.com/$Repo.git" $work -q
if ($LASTEXITCODE) { throw "Couldn't clone $Repo." }
try {
  Push-Location $work
  # A brand-new repo has no branch yet: start main, which Pages publishes.
  git rev-parse --verify -q HEAD | Out-Null
  if ($LASTEXITCODE) { git checkout -q -b main }
  Copy-Item ($clips | ForEach-Object { $_.FullName }) $work -Force
  # Pages serves files as they are; .nojekyll skips the site build.
  if (-not (Test-Path '.nojekyll')) { New-Item -ItemType File '.nojekyll' | Out-Null }
  if (-not (Test-Path 'README.md')) {
    Set-Content -Encoding utf8 'README.md' "Recorded audio for JP Trainer's Radio (https://knighthops.github.io/jp-trainer/). Made with tools/make-audio.ps1 in the app repo; one file per line, named by its text."
  }
  git add -A
  git diff --cached --quiet
  if ($LASTEXITCODE) {
    git -c "user.name=$name" -c "user.email=$email" commit -q -m "Add or update $($clips.Count) clips"
    git -c http.postBuffer=157286400 push -q origin HEAD
    if ($LASTEXITCODE) { throw 'Push failed.' }
  } else { Write-Host 'Nothing new to upload.' }
  $published = @(Get-ChildItem $work -Filter *.m4a | ForEach-Object { $_.BaseName } | Sort-Object)
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $work
}
$json = '[' + (($published | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'
[IO.File]::WriteAllText((Join-Path $root 'data/audio.json'), $json, (New-Object Text.UTF8Encoding($false)))
if (-not $Keep) { Remove-Item -Recurse -Force $From }
Write-Host "Published $($published.Count) clips to $Repo; data/audio.json lists them."
