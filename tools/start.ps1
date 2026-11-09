# Glass Desktop - start the see-through helper (and Steam, if it is not running).
#
#   .\start.ps1        follows the theme's Mode, Transparency % and Toggle hotkey settings
#   .\start.ps1 220    pin a fixed opacity 40-255 and ignore the slider
#
# The helper exits by itself when Steam exits. Make Steam solid again: .\uninstall.ps1
param([int]$Opacity = -1)

$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'SteamGlass.exe'
if (-not (Test-Path -LiteralPath $exe)) { & (Join-Path $PSScriptRoot 'build.ps1') }

Get-Process SteamGlass -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 300

if ($Opacity -ge 0) {
    $Opacity = [Math]::Max(40, [Math]::Min(255, $Opacity))
    Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot -ArgumentList $Opacity
    Write-Host "SteamGlass running (fixed opacity $Opacity/255)."
} else {
    Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot
    Write-Host 'SteamGlass running (follows your Glass Desktop settings).'
}
