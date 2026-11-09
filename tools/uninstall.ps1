# Glass Desktop - stop the helper and make every Steam window solid again.
# The theme files stay; pick another theme in Millennium to stop the styling too.
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'SteamGlass.exe'

Get-Process SteamGlass -ErrorAction SilentlyContinue | Stop-Process -Force
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'SteamGlass.lnk'
if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force }
if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe -ArgumentList '--restore' -Wait }
foreach ($f in 'helper-status.json', 'glass-opacity.txt') {
    $p = Join-Path $PSScriptRoot $f
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
}
Write-Host 'SteamGlass removed. Steam windows are solid again.'
