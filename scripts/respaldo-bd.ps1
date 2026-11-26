# Respaldo completo de las bases de datos de las dos tiendas (YBMOTOCOM y YJBMOTOCOM).
#
# El plan gratis de Supabase NO hace copias de seguridad. Este script saca un volcado completo
# (estructura + datos + usuarios) con pg_dump y lo guarda en la carpeta de la nube que se indique.
# Con ese archivo se puede restaurar la base en cualquier momento (ver docs/USO_Y_RESPALDOS.md).
#
# Uso (PowerShell):   powershell -ExecutionPolicy Bypass -File scripts\respaldo-bd.ps1
#
# Configuración: archivo scripts\respaldo-bd.config.local (NO se sube a GitHub, *.local está en
# .gitignore). Lleva las contraseñas de las bases de datos, así que no se comparte. Formato:
#   DESTINO=C:\Users\JJBarajas\OneDrive\Respaldos-Tiendas
#   GUARDAR=30
#   YBMOTOCOM=postgresql://postgres.ccoehayafcvfrnqnuhfa:CONTRASEÑA@aws-0-REGION.pooler.supabase.com:5432/postgres
#   YJBMOTOCOM=postgresql://postgres.agwjqetdlgmqtnepaqzj:CONTRASEÑA@aws-0-REGION.pooler.supabase.com:5432/postgres
# Las URL salen de Supabase → botón "Connect" → "Session pooler" (puerto 5432), con la contraseña
# de la base de datos puesta en lugar de [YOUR-PASSWORD]. GUARDAR = cuántos respaldos conservar
# por tienda (los más viejos se borran).
#
# Requiere pg_dump 17 o más nuevo (PostgreSQL command line tools).

$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'respaldo-bd.config.local'
if (-not (Test-Path $configPath)) {
    Write-Host "Falta $configPath (ver el encabezado de este script)." -ForegroundColor Red
    exit 1
}

$config = @{}
foreach ($line in Get-Content $configPath -Encoding UTF8) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -gt 0) { $config[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim() }
}

$destino = $config['DESTINO']
if (-not $destino) { Write-Host 'Falta DESTINO en la configuración.' -ForegroundColor Red; exit 1 }
$guardar = 30
if ($config['GUARDAR']) { $guardar = [int]$config['GUARDAR'] }

# Buscar pg_dump: en el PATH o en la instalación estándar de PostgreSQL (la versión más nueva).
$pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
    $pgDump = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
        Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $pgDump) {
    Write-Host 'No se encontró pg_dump. Instalar PostgreSQL 17 (solo "Command Line Tools").' -ForegroundColor Red
    exit 1
}

$fecha = Get-Date -Format 'yyyy-MM-dd_HHmm'
$errores = 0
foreach ($tienda in @('YBMOTOCOM', 'YJBMOTOCOM')) {
    $url = $config[$tienda]
    if (-not $url) { Write-Host "$tienda sin URL en la configuración; se omite." -ForegroundColor Yellow; continue }

    $carpeta = Join-Path $destino $tienda
    New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
    $archivo = Join-Path $carpeta "${tienda}_$fecha.dump"

    Write-Host "Respaldando $tienda..."
    # public = datos del negocio; auth = usuarios y contraseñas; storage = registro de las fotos.
    & $pgDump "--dbname=$url" --format=custom --no-owner --no-privileges `
        --schema=public --schema=auth --schema=storage --file="$archivo"

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $archivo) -or (Get-Item $archivo).Length -lt 1024) {
        Write-Host "  ERROR: el respaldo de $tienda falló." -ForegroundColor Red
        if (Test-Path $archivo) { Remove-Item $archivo -Force -Confirm:$false }
        $errores++
        continue
    }
    $mb = [math]::Round((Get-Item $archivo).Length / 1MB, 2)
    Write-Host "  OK: $archivo ($mb MB)" -ForegroundColor Green

    # Conservar solo los últimos $guardar respaldos de esta tienda.
    Get-ChildItem $carpeta -Filter "${tienda}_*.dump" | Sort-Object Name -Descending |
        Select-Object -Skip $guardar | ForEach-Object { Remove-Item $_.FullName -Force -Confirm:$false }
}

if ($errores -gt 0) { exit 1 }
Write-Host 'Respaldo terminado.' -ForegroundColor Green
