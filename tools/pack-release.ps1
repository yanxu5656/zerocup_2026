<#
.SYNOPSIS
    灯影 · 双版本打包脚本（单文件版 / 工程版）
.DESCRIPTION
    从网站源码目录生成两个交付版本，并做合规扫描：
      1) 单文件版：每个 HTML 内联 CSS / JS / 图片（data URI），双击即开，无需服务器
      2) 工程版  ：原样复制源码，剔除策划资料、测试目录与版本库
    最后分别打 zip，输出体积报表。
.PARAMETER Source
    网站源码目录，必须包含 index.html。默认 web
.PARAMETER Out
    输出目录，默认 dist
.PARAMETER Team
    zip 文件名前缀，默认「零杯2026_非遗灯影_夏思远_李健豪_廖哲煜_闫煦」
.EXAMPLE
    pwsh -NoProfile -File tools\pack-release.ps1 -Source web
.EXAMPLE
    pwsh -NoProfile -File tools\pack-release.ps1 -Source . -Out ..\dist
#>
[CmdletBinding()]
param(
    [string]$Source = 'web',
    [string]$Out    = 'dist',
    [string]$Team   = '零杯2026_非遗灯影_夏思远_李健豪_廖哲煜_闫煦',
    [string]$Name   = '灯影'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ---------- 基础校验 ----------
if (-not (Test-Path -LiteralPath $Source)) {
    throw "源码目录不存在：$Source（可用 -Source 指定）"
}
$root = (Resolve-Path -LiteralPath $Source).Path
$indexPath = Join-Path $root 'index.html'
if (-not (Test-Path -LiteralPath $indexPath)) {
    throw "源码目录里没有 index.html：$root"
}

$outDir = if (Test-Path -LiteralPath $Out) { (Resolve-Path -LiteralPath $Out).Path } else {
    New-Item -ItemType Directory -Path $Out -Force | Out-Null
    (Resolve-Path -LiteralPath $Out).Path
}

# 输出目录若在源码目录内，复制工程版时会把自己递归复制进去
if ($outDir.TrimEnd('\') -eq $root.TrimEnd('\') -or $outDir.StartsWith($root.TrimEnd('\') + '\')) {
    throw "输出目录不能位于源码目录内：$outDir。请用 -Out 指定外部目录（例如 ..\dist）"
}

$excludeDirs = @('资料', 'TEST', 'tools', 'dist', 'node_modules', '.git', '.workbuddy', '.vscode', 'web')
$safeName = if ($Team) { $Team } else { '作品' }
$singleName = "${Name}_单文件版"
$projName   = "${Name}_工程版"

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
Write-Host ""
Write-Host "灯影 · 双版本打包" -ForegroundColor Yellow
Write-Host "  源码：$root"
Write-Host "  输出：$outDir"
Write-Host "  时间：$stamp"
Write-Host ""

# ---------- 工具函数 ----------
$mimeMap = @{
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.gif'  = 'image/gif'
    '.woff2'= 'font/woff2'
    '.woff' = 'font/woff'
    '.ttf'  = 'font/ttf'
    '.ico'  = 'image/x-icon'
}

function Test-Remote([string]$ref) {
    if (-not $ref) { return $true }
    if ($ref -match '^(https?:)?//') { return $true }
    if ($ref -match '^(data:|blob:|mailto:|tel:|javascript:|#)') { return $true }
    return $false
}

function Get-DataUri([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $b64 = [System.Convert]::ToBase64String($bytes)
    if ($ext -eq '.svg') {
        # SVG 用 urlencode 更省体积，也避免 base64 里出现引号问题
        $text = [System.IO.File]::ReadAllText($path)
        $enc = [System.Uri]::EscapeDataString($text)
        return "data:$mime;charset=utf-8,$enc"
    }
    return "data:$mime;base64,$b64"
}

function Inline-Css([string]$cssText, [string]$baseDir) {
    # 把 CSS 内的本地 url(...) 换成 data URI
    return [regex]::Replace($cssText, 'url\(\s*(["'']?)([^)"'']+)\1\s*\)', {
        param($m)
        $ref = $m.Groups[2].Value
        if (Test-Remote $ref) { return $m.Value }
        if ($ref -match '^data:') { return $m.Value }
        $p = Join-Path $baseDir $ref
        $uri = Get-DataUri $p
        if ($uri) { return "url(`"$uri`")" }
        return $m.Value
    })
}

function ConvertTo-SingleFileHtml([string]$htmlPath) {
    $dir  = Split-Path -Parent $htmlPath
    $html = [System.IO.File]::ReadAllText($htmlPath)

    # 1) 本地样式表 -> <style>
    $html = [regex]::Replace($html, '<link\b[^>]*?rel\s*=\s*["'']stylesheet["''][^>]*?>', {
        param($m)
        $tag = $m.Value
        $href = [regex]::Match($tag, 'href\s*=\s*["'']([^"'']+)["'']').Groups[1].Value
        if (Test-Remote $href) { return $tag }
        $cssPath = Join-Path $dir $href
        if (-not (Test-Path -LiteralPath $cssPath)) { return $tag }
        $css = [System.IO.File]::ReadAllText($cssPath)
        $css = Inline-Css $css (Split-Path -Parent $cssPath)
        return "<style>`n$css`n</style>"
    })

    # 2) 本地脚本 -> 内联
    $html = [regex]::Replace($html, '<script\b([^>]*?)src\s*=\s*["'']([^"'']+)["'']([^>]*)>\s*</script>', {
        param($m)
        $src = $m.Groups[2].Value
        if (Test-Remote $src) { return $m.Value }
        $jsPath = Join-Path $dir $src
        if (-not (Test-Path -LiteralPath $jsPath)) { return $m.Value }
        $js = [System.IO.File]::ReadAllText($jsPath)
        # 内联后 defer/async 失效：脚本必须位于 </body> 之前（扫描阶段会检查并报错）
        $attrs = ($m.Groups[1].Value + $m.Groups[3].Value) -replace '\s*(defer|async)\s*', ' '
        return "<script$attrs>`n$js`n</script>"
    })

    # 3) <img src> -> data URI
    $html = [regex]::Replace($html, '(<img\b[^>]*?\bsrc\s*=\s*["''])([^"'']+)(["''])', {
        param($m)
        $src = $m.Groups[2].Value
        if (Test-Remote $src) { return $m.Value }
        $imgPath = Join-Path $dir $src
        $uri = Get-DataUri $imgPath
        if ($uri) { return $m.Groups[1].Value + $uri + $m.Groups[3].Value }
        return $m.Value
    })

    # 4) 内联 style 属性/块里的本地 url()
    $html = [regex]::Replace($html, 'url\(\s*(["'']?)([^)"'']+)\1\s*\)', {
        param($m)
        $ref = $m.Groups[2].Value
        if (Test-Remote $ref) { return $m.Value }
        $p = Join-Path $dir $ref
        $uri = Get-DataUri $p
        if ($uri) { return "url(`"$uri`")" }
        return $m.Value
    })

    return $html
}

function New-CleanDir([string]$path) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}

function Get-DirSize([string]$path) {
    $sum = 0
    Get-ChildItem -LiteralPath $path -Recurse -File | ForEach-Object { $sum += $_.Length }
    return $sum
}

# ---------- 1. 工程版 ----------
$projDir = Join-Path $outDir $projName
New-CleanDir $projDir
Copy-Item -Path (Join-Path $root '*') -Destination $projDir -Recurse -Force
Get-ChildItem -LiteralPath $projDir -Directory -Force |
    Where-Object { $excludeDirs -contains $_.Name } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

# ---------- 2. 单文件版 ----------
$singleDir = Join-Path $outDir $singleName
New-CleanDir $singleDir
$pages = Get-ChildItem -LiteralPath $root -Filter '*.html' -File
if ($pages.Count -eq 0) { throw "源码目录里没有 HTML 页面：$root" }
foreach ($page in $pages) {
    $out = ConvertTo-SingleFileHtml $page.FullName
    $target = Join-Path $singleDir $page.Name
    [System.IO.File]::WriteAllText($target, $out, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------- 3. 合规扫描 ----------
$issues = New-Object System.Collections.Generic.List[string]
$textExt = @('.html', '.css', '.js', '.svg', '.json')
$allFiles = Get-ChildItem -LiteralPath $projDir -Recurse -File | Where-Object { $textExt -contains $_.Extension.ToLowerInvariant() }
$allowPatterns = @('w3\.org', 'schema\.org', 'purl\.org', 'xmlns', 'localhost', '127\.0\.0\.1')
foreach ($f in $allFiles) {
    $content = [System.IO.File]::ReadAllText($f.FullName)
    foreach ($m in [regex]::Matches($content, 'https?://[^\s"''<>\)]+')) {
        $url = $m.Value
        if ($allowPatterns | Where-Object { $url -match $_ }) { continue }
        $issues.Add("外链 [$($f.Name)] $url")
    }
    foreach ($kw in @('bootstrap', 'element-ui', 'elementui', 'jquery', 'tailwind', 'unpkg.com', 'cdn.jsdelivr')) {
        if ($content -match [regex]::Escape($kw)) { $issues.Add("第三方库关键字 [$($f.Name)] $kw") }
    }
}

# 页面死链检查（仅检查根目录 html 之间的相对链接）
$pageNames = $pages.Name
foreach ($f in (Get-ChildItem -LiteralPath $projDir -Filter '*.html' -File)) {
    $content = [System.IO.File]::ReadAllText($f.FullName)
    foreach ($m in [regex]::Matches($content, 'href\s*=\s*["'']([^"''#?]+\.html)[^"'']*["'']')) {
        $target = $m.Groups[1].Value
        if (-not ($pageNames -contains $target)) { $issues.Add("死链 [$($f.Name)] -> $target") }
    }
    # <head> 里的脚本在单文件版中会被提前执行，要求脚本统一放在 </body> 前
    $headEnd = $content.IndexOf('</head>')
    if ($headEnd -gt 0) {
        $head = $content.Substring(0, $headEnd)
        if ($head -match '<script\b') { $issues.Add("脚本位于 <head> [$($f.Name)]，请移到 </body> 前") }
    }
}

# ---------- 4. 打包 ----------
$zipSingle = Join-Path $outDir "$safeName`_单文件版.zip"
$zipProj   = Join-Path $outDir "$safeName`_工程版.zip"
foreach ($z in @($zipSingle, $zipProj)) { if (Test-Path -LiteralPath $z) { Remove-Item -LiteralPath $z -Force } }
Compress-Archive -Path $singleDir -DestinationPath $zipSingle -CompressionLevel Optimal
Compress-Archive -Path $projDir   -DestinationPath $zipProj   -CompressionLevel Optimal

# ---------- 5. 报表 ----------
function Format-Size([long]$b) {
    if ($b -ge 1MB) { return ('{0:N2} MB' -f ($b / 1MB)) }
    if ($b -ge 1KB) { return ('{0:N1} KB' -f ($b / 1KB)) }
    return "$b B"
}

Write-Host "单文件版" -ForegroundColor Cyan
foreach ($p in $pages) {
    $sp = Join-Path $singleDir $p.Name
    $size = (Get-Item -LiteralPath $sp).Length
    $flag = if ($size -gt 600KB) { '  ← 偏大，检查内联图片' } else { '' }
    Write-Host ("  {0,-16} {1,10}{2}" -f $p.Name, (Format-Size $size), $flag)
}
Write-Host ("  合计 {0}" -f (Format-Size (Get-DirSize $singleDir)))

Write-Host ""
Write-Host "工程版" -ForegroundColor Cyan
Write-Host ("  文件数 {0}   合计 {1}" -f (Get-ChildItem -LiteralPath $projDir -Recurse -File).Count, (Format-Size (Get-DirSize $projDir)))

Write-Host ""
Write-Host "压缩包" -ForegroundColor Cyan
Write-Host ("  {0}  {1}" -f (Split-Path -Leaf $zipSingle), (Format-Size (Get-Item -LiteralPath $zipSingle).Length))
Write-Host ("  {0}  {1}" -f (Split-Path -Leaf $zipProj),   (Format-Size (Get-Item -LiteralPath $zipProj).Length))

Write-Host ""
if ($issues.Count -eq 0) {
    Write-Host "合规扫描：通过（无外链、无第三方库、无死链）" -ForegroundColor Green
} else {
    Write-Host ("合规扫描：发现 {0} 项，请处理" -f $issues.Count) -ForegroundColor Red
    $issues | Select-Object -Unique | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 2
}

Write-Host ""
Write-Host "下一步：把两个 zip 解压到干净目录，双击 index.html 复核一遍。" -ForegroundColor Yellow
