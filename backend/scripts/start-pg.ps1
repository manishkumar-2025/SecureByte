param(
  [switch]$Stop
)

$backendDir = Split-Path -Parent $PSScriptRoot
$pgDir = Join-Path $backendDir ".pg"
$pgsqlDir = Join-Path $pgDir "pgsql"
$binDir = Join-Path $pgsqlDir "bin"
$dataDir = Join-Path $pgDir "data"
$logFile = Join-Path $pgDir "server.log"
$zipFile = Join-Path $backendDir ".pg_bin.zip"

if ($Stop) {
  if (Test-Path (Join-Path $binDir "pg_ctl.exe")) {
    Write-Host "Stopping PostgreSQL..."
    & (Join-Path $binDir "pg_ctl.exe") -D $dataDir stop -m fast
  }
  exit 0
}

# 1. Unzip if needed
if (-not (Test-Path (Join-Path $binDir "postgres.exe"))) {
  if (-not (Test-Path $zipFile)) {
    Write-Error "PostgreSQL archive $zipFile not found."
    exit 1
  }
  Write-Host "Extracting PostgreSQL binaries to $pgDir..."
  Expand-Archive -Path $zipFile -DestinationPath $pgDir -Force
}

# 2. Initialize DB if data dir doesn't exist
if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
  Write-Host "Initializing PostgreSQL cluster at $dataDir..."
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  & (Join-Path $binDir "initdb.exe") -U postgres -A trust -E UTF8 -D $dataDir
}

# 3. Check if server is already running
$status = & (Join-Path $binDir "pg_ctl.exe") -D $dataDir status 2>&1
if ($status -match "server is running") {
  Write-Host "PostgreSQL is already running."
} else {
  Write-Host "Starting PostgreSQL server on port 5432..."
  & (Join-Path $binDir "pg_ctl.exe") -D $dataDir -l $logFile start
  Start-Sleep -Seconds 2
}

# 4. Create campusshield_dev and campusshield_test databases
Write-Host "Ensuring development and test databases exist..."
& (Join-Path $binDir "createdb.exe") -U postgres campusshield_dev 2>$null
& (Join-Path $binDir "createdb.exe") -U postgres campusshield_test 2>$null

Write-Host "PostgreSQL is ready on localhost:5432!"
