# Glass Desktop - export your theme settings to a JSON file.
#
#   .\export-settings.ps1                     -> .\glass-desktop-settings.json
#   .\export-settings.ps1 D:\my-glass.json
param([string]$Path = (Join-Path $PSScriptRoot 'glass-desktop-settings.json'))

$ErrorActionPreference = 'Stop'
$config = Join-Path $PSScriptRoot '..\..\..\config\config.json'
$c = Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
$settings = $c.themes.conditions.GlassDesktop
if (-not $settings) { throw 'No Glass Desktop settings found. Open Configure once in Millennium first.' }

$out = [ordered]@{ theme = 'GlassDesktop'; exported = (Get-Date).ToString('s'); settings = $settings }
$out | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Path -Encoding UTF8
Write-Host "Exported to $Path"
