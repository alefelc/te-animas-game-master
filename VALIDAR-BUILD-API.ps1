[CmdletBinding()]
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
Push-Location $root
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js no está instalado o no está en PATH.' }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm no está instalado o no está en PATH.' }

  Write-Host "Node: $(node --version)" -ForegroundColor Cyan
  Write-Host "npm:  $(npm --version)" -ForegroundColor Cyan
  Write-Host 'Instalando dependencias desde package-lock.json...' -ForegroundColor Cyan
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci terminó con código $LASTEXITCODE" }

  Write-Host 'Ejecutando pruebas...' -ForegroundColor Cyan
  npm test
  if ($LASTEXITCODE -ne 0) { throw "npm test terminó con código $LASTEXITCODE" }

  Write-Host 'Compilando API...' -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build terminó con código $LASTEXITCODE" }

  if (-not (Test-Path -LiteralPath (Join-Path $root 'dist\server.js'))) {
    throw 'La compilación terminó sin generar dist/server.js.'
  }

  Write-Host 'VALIDACIÓN CORRECTA: pruebas y compilación aprobadas.' -ForegroundColor Green
} finally {
  Pop-Location
}
