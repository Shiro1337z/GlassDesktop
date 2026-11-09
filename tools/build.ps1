# Glass Desktop - build tools\SteamGlass.exe from SteamGlass.cs.
# Uses the C# compiler that ships with Windows (.NET Framework 4.x). No downloads.
$ErrorActionPreference = 'Stop'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw "C# compiler not found at $csc" }
$src = Join-Path $PSScriptRoot 'SteamGlass.cs'
$out = Join-Path $PSScriptRoot 'SteamGlass.exe'
Get-Process SteamGlass -ErrorAction SilentlyContinue | Stop-Process -Force
& $csc /nologo /optimize+ /target:winexe /platform:x64 "/out:$out" $src
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Write-Host "Built $out"
