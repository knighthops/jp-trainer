# Records every line in data/audio-lines.json with the Windows voices (Japanese: Haruka,
# English: Zira) and compresses each to a small AAC file, <OutDir>/<id>.m4a.
# Free and offline: needs Japanese text-to-speech installed in Windows
# (Settings > Time & language > Language & region > Japanese > Text-to-speech).
#
# The clips are published from a separate repo (see tools/publish-audio.ps1), so by
# default they're written to a temporary folder outside the project.
#
#   powershell -ExecutionPolicy Bypass -File tools/make-audio.ps1 -OutDir <folder> [-Limit 5]
param([Parameter(Mandatory)][string]$OutDir, [int]$Limit = 0)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$lines = Get-Content (Join-Path $root 'data/audio-lines.json') -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path
$wavDir = Join-Path $OutDir '.wav'
New-Item -ItemType Directory -Force $wavDir | Out-Null

Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
$asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1' } | Select-Object -First 1
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(); $t.Result }
function AwaitProgress($op) { $t = $asTaskAction.MakeGenericMethod([double]).Invoke($null, @($op)); $t.Wait() }

$profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateM4a([Windows.Media.MediaProperties.AudioEncodingQuality]::Medium)
$profile.Audio.ChannelCount = 1
$profile.Audio.SampleRate = 22050
$profile.Audio.Bitrate = 48000
$transcoder = New-Object Windows.Media.Transcoding.MediaTranscoder
$outFolder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync($OutDir)) ([Windows.Storage.StorageFolder])

function Encode([string]$wav, [string]$id) {
  $src = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($wav)) ([Windows.Storage.StorageFile])
  $dst = Await ($outFolder.CreateFileAsync("$id.m4a", [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
  $prep = Await ($transcoder.PrepareFileTranscodeAsync($src, $dst, $profile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
  if (-not $prep.CanTranscode) { throw "Can't encode $id ($($prep.FailureReason))" }
  AwaitProgress ($prep.TranscodeAsync())
}

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$voices = @{ 'ja' = 'Microsoft Haruka Desktop'; 'en' = 'Microsoft Zira Desktop' }
# The line list pins each kanji word's reading as <sub alias="kana">word</sub>. This voice
# gets the kana, so it can't misread a word.
function Spoken([string]$ssml) {
  $s = [regex]::Replace($ssml, '<sub alias="([^"]*)">[^<]*</sub>', '$1')
  return $s.Replace('&lt;', '<').Replace('&gt;', '>').Replace('&quot;', '"').Replace('&amp;', '&')
}

$todo = @($lines | Where-Object { -not (Test-Path (Join-Path $OutDir "$($_.id).m4a")) })
if ($Limit -gt 0) { $todo = @($todo | Select-Object -First $Limit) }
Write-Host "$($lines.Count) clips listed, $($todo.Count) to record."
$n = 0
foreach ($line in $todo) {
  $wav = Join-Path $wavDir "$($line.id).wav"
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SetOutputToWaveFile($wav, $format)
  if ($line.id -like 'sil-*') {
    $p = New-Object System.Speech.Synthesis.PromptBuilder
    $p.AppendBreak([TimeSpan]::FromMilliseconds([int]($line.id -replace 'sil-', '')))
    $synth.Speak($p)
  } else {
    $lang = $line.id.Substring(0, 2)
    $synth.SelectVoice($voices[$lang])
    # Japanese a touch slower, for learners. Radio's Slow setting slows it further.
    $synth.Rate = if ($lang -eq 'ja') { -1 } else { 0 }
    $synth.Speak((Spoken $line.ssml))
  }
  $synth.Dispose()
  Encode $wav $line.id
  Remove-Item $wav
  $n++
  if ($n % 50 -eq 0) { Write-Host "$n / $($todo.Count)" }
}
Remove-Item -Recurse -Force $wavDir
$ids = Get-ChildItem $OutDir -Filter *.m4a | Where-Object { $_.Length -gt 0 } | ForEach-Object { $_.BaseName } | Sort-Object
Write-Host "Done. $($ids.Count) clips in $OutDir."
