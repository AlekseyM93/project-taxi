param(
  [string]$ContainerName = "taxi_db",
  [string]$DbName = "taxi",
  [string]$DbUser = "taxi",
  [string]$OutputDir = ".\backups"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dumpPath = Join-Path $OutputDir "taxi_pg_$timestamp.sql"

Write-Host "Creating PostgreSQL backup: $dumpPath"
docker exec $ContainerName pg_dump -U $DbUser -d $DbName > $dumpPath

if ($LASTEXITCODE -ne 0) {
  throw "Backup failed"
}

Write-Host "Backup completed: $dumpPath"
