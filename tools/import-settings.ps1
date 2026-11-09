# Glass Desktop - import theme settings from a JSON file made by export-settings.ps1.
#
#   .\import-settings.ps1 D:\my-glass.json
#
# Steam must be closed (Millennium rewrites its config on exit). Re-open Steam after.
param([Parameter(Mandatory = $true)][string]$Path)

$ErrorActionPreference = 'Stop'
if (Get-Process steam -ErrorAction SilentlyContinue) {
    throw 'Close Steam first (Steam menu > Exit), then run this again.'
}
$in = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
if ($in.theme -ne 'GlassDesktop' -or -not $in.settings) { throw "$Path is not a Glass Desktop settings file." }

# Only accept known setting names with string values.
$skin = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\skin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$known = $skin.Conditions.PSObject.Properties.Name
$clean = [ordered]@{}
foreach ($p in $in.settings.PSObject.Properties) {
    if ($known -contains $p.Name -and $p.Value -is [string]) { $clean[$p.Name] = $p.Value }
}

$config = Join-Path $PSScriptRoot '..\..\..\config\config.json'
Copy-Item -LiteralPath $config -Destination "$config.bak" -Force
$c = Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $c.themes.conditions) { $c.themes | Add-Member conditions ([pscustomobject]@{}) }
$c.themes.conditions | Add-Member -Force GlassDesktop ([pscustomobject]$clean)
$c | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $config -Encoding UTF8
Write-Host "Imported $($clean.Count) settings. Backup: $config.bak. Start Steam to apply."
