# Local preview server for machines without Node or Python.
# Usage: powershell -ExecutionPolicy Bypass -File tools/serve.ps1
param([int]$Port = 8123)
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json'; '.png' = 'image/png'; '.mp3' = 'audio/mpeg'; '.m4a' = 'audio/mp4'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  if (-not $rel) { $rel = 'index.html' }
  $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
  $res = $ctx.Response
  # tools/dict-build.html, dict-check.html, kanji-more.html, audio-lines.html and write-build.html save their output here. Only this
  # server's own origin may write, and only these files.
  $saves = @{ 'tools/save-dict' = 'data/dict.json'; 'tools/save-dict-check' = 'data/dict-check.json'; 'tools/save-kanji-more' = 'data/kanji-more.json'; 'tools/save-kanji-n5' = 'data/kanji-n5.json'; 'tools/save-audio-lines' = 'data/audio-lines.json'; 'tools/save-write' = 'data/write.json' }
  if ($ctx.Request.HttpMethod -eq 'POST') {
    $sameOrigin = $ctx.Request.Headers['Origin'] -eq "http://localhost:$Port"
    if ($saves.ContainsKey($rel) -and $sameOrigin -and $ctx.Request.ContentLength64 -lt 8MB) {
      $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      try {
        $null = $body | ConvertFrom-Json
        [IO.File]::WriteAllText((Join-Path $root $saves[$rel]), $body, (New-Object Text.UTF8Encoding($false)))
        $res.StatusCode = 204
      } catch { $res.StatusCode = 400 }
    } else {
      $res.StatusCode = 403
    }
    $res.Close()
    continue
  }
  if ($path.StartsWith($root) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $type = $types[[IO.Path]::GetExtension($path)]
    $res.ContentType = if ($type) { $type } else { 'application/octet-stream' }
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.Close()
}
