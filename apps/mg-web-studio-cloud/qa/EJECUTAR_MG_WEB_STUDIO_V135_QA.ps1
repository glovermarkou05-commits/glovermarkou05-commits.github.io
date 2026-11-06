#requires -Version 5.1
<# V135 QA integrated single-run (OWNER Windows terminal only).
Creates ONE synthetic Auth identity, challenges TOTP, validates the PRIVATE
PG journal + receipt and anti-replay, then tries signout and deleting it.
Never supply secrets through arguments, GitHub, files or chat.
#>
[CmdletBinding()]
param([switch]$EjecutarQA)

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$qa = Join-Path $base 'qa'
$scriptNode = Join-Path $qa 'v135-mfa-integrated-one-shot.cjs'
$expectedBranch = 'docs/mg-web-studio-v94-preflight-20261101'
$project = 'tbfhiqkivsoeuudlpkgi'
$keys = @(
 'MG_AUTH_QA_PROJECT_REF','MG_AUTH_QA_URL','MG_AUTH_QA_CONFIRMATION',
 'MG_AUTH_QA_ADMIN_KEY','MG_AUTH_QA_PUBLISHABLE_KEY',
 'MG_V135_CONFIRMATION','MG_V135_JOURNAL_PASSWORD',
 'MG_V135_ISSUER_PASSWORD','MG_V135_READER_PASSWORD',
 'MG_V135_CA_PATH'
)
$backup = @{}
foreach($k in $keys) {
 $backup[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
}
function Read-PrivateQA([string]$key,[string]$caption) {
 $secret = Read-Host $caption -AsSecureString
 $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if([string]::IsNullOrEmpty($plain)) { throw 'Se necesita una credencial.' }
  [Environment]::SetEnvironmentVariable($key, $plain, 'Process')
  Remove-Variable plain -ErrorAction SilentlyContinue
 } finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
 }
 Remove-Variable secret -ErrorAction SilentlyContinue
}
try {
 if(-not (Test-Path -LiteralPath $scriptNode -PathType Leaf)) {
  throw 'Faltan archivos del runner V135. No se ha iniciado ninguna prueba.'
 }
 $nodeExe = Get-Command node.exe -ErrorAction Stop
 $major = [int]((& $nodeExe.Source --version).TrimStart('v').Split('.')[0])
 if($major -ne 22 -and $major -ne 24) {
  throw 'Se requiere Node.js 22 o 24.'
 }
 $currentBranch = (& git -C $base branch --show-current).Trim()
 if($LASTEXITCODE -ne 0 -or $currentBranch -cne $expectedBranch) {
  throw 'Rama Git incorrecta: V135 solo se ejecuta desde la rama QA fijada.'
 }
 if(-not $EjecutarQA) {
  & $nodeExe.Source $scriptNode --dry-run
  return
 }
 $cert = Join-Path $env:USERPROFILE 'Downloads\prod-ca-2021.crt'
 if(-not (Test-Path -LiteralPath $cert -PathType Leaf)) {
  throw 'No se encuentra el certificado CA de Supabase.'
 }
 Write-Host 'Destino unico: MG WEB STUDIO AUTH QA.'
 Write-Host 'Se creara UNA identidad sintetica y se intentara eliminar al terminar.'
 Write-Host 'No se modifica ni publica produccion.'
 $confirm = Read-Host 'Escribe CONFIRMO_V135_QA_UNA_CUENTA_Y_BORRADO'
 if($confirm -cne 'CONFIRMO_V135_QA_UNA_CUENTA_Y_BORRADO') {
  Write-Host 'V135_CANCELADO: no se ha creado ninguna identidad.'
  return
 }
 $env:MG_AUTH_QA_PROJECT_REF = $project
 $env:MG_AUTH_QA_URL = "https://$project.supabase.co"
 $env:MG_AUTH_QA_CONFIRMATION = 'YES_ONE_SYNTHETIC_TOTP_USER_DELETE_AFTER_TEST'
 $env:MG_V135_CONFIRMATION = 'YES_V135_ONE_EPHEMERAL_QA_USER_AND_DELETE'
 $env:MG_V135_CA_PATH = $cert
 Write-Host 'Introduce las claves SOLO de este proyecto QA. No se guardaran en archivos.'
 Read-PrivateQA 'MG_AUTH_QA_ADMIN_KEY' 'Clave privada administrativa del QA'
 Read-PrivateQA 'MG_AUTH_QA_PUBLISHABLE_KEY' 'Clave publica publishable del QA'
 Read-PrivateQA 'MG_V135_JOURNAL_PASSWORD' 'Contrasena del rol journal'
 Read-PrivateQA 'MG_V135_ISSUER_PASSWORD' 'Contrasena del rol issuer'
 Read-PrivateQA 'MG_V135_READER_PASSWORD' 'Contrasena del rol reader'
 Write-Host 'V135: preparando dependencias con lockfiles fijados.'
 & npm.cmd ci --prefix $qa --ignore-scripts --no-audit --no-fund
 if($LASTEXITCODE -ne 0) { throw 'No fue posible preparar el SDK QA.' }
 & npm.cmd ci --prefix (Join-Path $qa 'v116-pg-driver') --ignore-scripts --no-audit --no-fund
 if($LASTEXITCODE -ne 0) { throw 'No fue posible preparar el cliente PostgreSQL.' }
 Write-Host 'V135: ejecutando prueba integrada, sin publicar.'
 & $nodeExe.Source $scriptNode --execute
 $resultCode = $LASTEXITCODE
 if($resultCode -ne 0) {
  Write-Host 'V135_NO_APROBADA: revisar stage y cleanup antes de intentar otra vez.'
 }
} finally {
 foreach($k in $keys) {
  [Environment]::SetEnvironmentVariable($k, $backup[$k], 'Process')
 }
}
