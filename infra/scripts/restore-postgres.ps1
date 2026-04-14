param(
  [Parameter(Mandatory=$true)]
  [string]$BackupFile,
  [string]$ContainerName = "taxi_db",
  [string]$DbName = "taxi",
  [string]$DbUser = "taxi"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

Write-Host "Restoring PostgreSQL from: $BackupFile"
Get-Content $BackupFile | docker exec -i $ContainerName psql -U $DbUser -d $DbName

if ($LASTEXITCODE -ne 0) {
  throw "Restore failed"
}

Write-Host "Restore completed successfully"
