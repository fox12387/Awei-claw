# AweiClaw Desktop Build Script
# Copies web files from repo root into www/ and applies desktop-specific patches

Write-Host "=== AweiClaw Desktop Build Preparation ===" -ForegroundColor Cyan

$rootDir = Split-Path -Parent $PSScriptRoot
$wwwDir  = Join-Path $PSScriptRoot "www"

# 1. Copy core web files from repo root
Write-Host "[1/4] Copying core web files from repo root..." -ForegroundColor Yellow
Copy-Item "$rootDir/index.html"  "$wwwDir/index.html"  -Force
Copy-Item "$rootDir/style.css"   "$wwwDir/style.css"   -Force
Copy-Item "$rootDir/script.js"   "$wwwDir/script.js"   -Force
Copy-Item "$rootDir/catalog.json" "$wwwDir/experts/catalog.json" -Force

# 2. Copy expert files
Write-Host "[2/4] Copying expert files..." -ForegroundColor Yellow
$expertsDir = Join-Path $wwwDir "experts"
if (-not (Test-Path $expertsDir)) { New-Item -ItemType Directory -Path $expertsDir -Force }
Get-ChildItem "$rootDir/expert_*.txt" | Copy-Item -Destination $expertsDir -Force

# 3. Copy snippet files
Write-Host "[3/4] Copying snippet files..." -ForegroundColor Yellow
$snippetsDir = Join-Path $wwwDir "snippets"
if (-not (Test-Path $snippetsDir)) { New-Item -ItemType Directory -Path $snippetsDir -Force }
@("python.txt", "cpp.txt", "cs.txt", "html.txt", "css.txt", "js.txt") | ForEach-Object {
    Copy-Item "$rootDir/$_" "$snippetsDir/$_" -Force
}

# 4. Apply desktop-specific patches to script.js
Write-Host "[4/4] Applying desktop patches to script.js..." -ForegroundColor Yellow
$scriptPath = Join-Path $wwwDir "script.js"
$content = Get-Content $scriptPath -Raw -Encoding UTF8

# Patch init(): redirect to login.html instead of ../awei-login.html
$content = $content -replace 'else window\.location\.href = ''../awei-login\.html'';', 'else window.location.href = ''login.html'';'

# Patch handleLogout(): redirect to login.html instead of ../awei-login.html
$content = $content -replace 'window\.location\.href = ''../awei-login\.html'';', 'window.location.href = ''login.html'';'

Set-Content $scriptPath $content -Encoding UTF8 -NoNewline

Write-Host ""
Write-Host "=== Done! www/ directory is ready. ===" -ForegroundColor Green
Write-Host "Now run: dotnet publish -c Release -r win-x64 --self-contained -p:PublishSingleFile=true" -ForegroundColor White
