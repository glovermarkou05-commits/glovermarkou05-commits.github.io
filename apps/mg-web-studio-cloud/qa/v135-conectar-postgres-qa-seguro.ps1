#requires -Version 5.1
<#
 V135 SOLO para una terminal Windows local confiable. No ejecutar en CI.
 Usa psql y el certificado CA del Supabase QA. No guarda ni muestra passwords.
#>
[CmdletBinding()]
param(
    [switch]$ConectarQA,
    [string]$CertificadoCA
)
$ErrorActionPreference = 'Stop'
$hostFijo = 'db.tbfhiqkivsoeuudlpkgi.supabase.co'
$proyecto = 'tbfhiqkivsoeuudlpkgi'
$roles = @(
    'mg_qa_mfa_challenge_journal',
    'mg_qa_mfa_receipt_issuer',
    'mg_qa_mfa_receipt_reader'
)
if (-not $ConectarQA) {
    Write-Host 'V135_NO_EJECUTADO: falta -ConectarQA.'
    exit 2
}
if ([string]::IsNullOrWhiteSpace($CertificadoCA) -or
    -not (Test-Path -LiteralPath $CertificadoCA -PathType Leaf)) {
    Write-Host 'V135_BLOQUEADO: selecciona el certificado CA descargado de Supabase QA.'
    exit 2
}
$psql = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
if (-not $psql) {
    Write-Host 'V135_BLOQUEADO: falta el cliente psql.exe. No se cambio ninguna clave.'
    exit 2
}
$ca = (Resolve-Path -LiteralPath $CertificadoCA).ProviderPath
$publicCert = Get-Content -LiteralPath $ca -Raw
if ($publicCert -notmatch '-----BEGIN CERTIFICATE-----' -or
    $publicCert -notmatch '-----END CERTIFICATE-----') {
    Write-Host 'V135_BLOQUEADO: el archivo no parece un certificado CA PEM.'
    exit 2
}
Write-Host 'Destino fijo: MG WEB STUDIO AUTH QA.'
Write-Host "Proyecto: $proyecto"
Write-Host "Host: $hostFijo"
Write-Host 'Se abrira psql con TLS verify-full y verificacion de hostname.'
Write-Host 'No introduzcas contrasenas en SQL, GitHub, capturas o chats.'
Write-Host 'Los tres roles deben recibir claves DISTINTAS en un gestor seguro.'
$confirmacion = Read-Host 'Para conectar SOLO A QA escribe CONFIRMO_V135_QA'
if ($confirmacion -cne 'CONFIRMO_V135_QA') {
    Write-Host 'V135_CANCELADO'
    exit 2
}
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:PGSERVICE -ErrorAction SilentlyContinue
Remove-Item Env:PGOPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:PGHOSTADDR -ErrorAction SilentlyContinue
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = $ca
$env:PGCONNECT_TIMEOUT = '8'
$env:PGAPPNAME = 'mg-web-studio-v135-qa-interactive-only'
Write-Host 'Dentro de psql, escribe UNO POR UNO:'
foreach ($rol in $roles) { Write-Host ('  \password ' + $rol) }
Write-Host 'psql pedira la nueva contrasena dos veces. Guardala solo en tu gestor de claves.'
Write-Host 'Para salir escribe \q. Nunca uses RESET PASSWORD del proyecto.'
try {
    & $psql.Source -X -W -v 'ON_ERROR_STOP=1' -h $hostFijo -p 5432 -U postgres -d postgres
    $salida = $LASTEXITCODE
    if ($salida -ne 0) {
        Write-Host 'V135_PSQL_ERROR: no se afirma que los roles se activaron.'
        exit 3
    }
    Write-Host 'V135_PSQL_CERRADO: verificar despues roles con consulta solo lectura.'
}
finally {
    Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
    Remove-Item Env:PGSSLROOTCERT -ErrorAction SilentlyContinue
    Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
    Remove-Item Env:PGAPPNAME -ErrorAction SilentlyContinue
}
