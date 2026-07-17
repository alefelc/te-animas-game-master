[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [string]$ProjectPath = ""
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
  if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $ProjectPath = $PSScriptRoot
  } elseif (-not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
    $ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
  } else {
    $ProjectPath = (Get-Location).Path
  }
}

$root = (Resolve-Path -LiteralPath $ProjectPath).Path
$obsolete = @(
  'src\api',
  'src\components',
  'src\db',
  'src\engine',
  'src\screens',
  'src\store',
  'src\main.tsx',
  'src\resilient-selection.ts',
  'src\styles.css',
  'src\types.ts',
  'vite.config.ts'
)

Write-Host "Proyecto: $root" -ForegroundColor Cyan
$found = @()
foreach ($relative in $obsolete) {
  $candidate = Join-Path $root $relative
  if (Test-Path -LiteralPath $candidate) {
    $found += $candidate
  }
}

if ($found.Count -eq 0) {
  Write-Host 'No se encontraron restos del frontend.' -ForegroundColor Green
  exit 0
}

Write-Host 'Se encontraron archivos ajenos a la API:' -ForegroundColor Yellow
$found | ForEach-Object { Write-Host " - $_" }

foreach ($candidate in $found) {
  if ($PSCmdlet.ShouldProcess($candidate, 'Eliminar resto del frontend')) {
    Remove-Item -LiteralPath $candidate -Recurse -Force
  }
}

Write-Host 'Limpieza terminada.' -ForegroundColor Green
