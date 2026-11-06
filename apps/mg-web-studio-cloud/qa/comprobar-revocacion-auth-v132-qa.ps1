#requires -Version 5.1
<#
 MG Web Studio — SOLO QA, prueba controlada de getUser despues de signOut local.
 NO crea cuentas, NO modifica SQL, NO despliega, NO escribe tokens en disco.
 EJECUTAR SOLO tras autorizacion especifica y con usuario TEMPORAL QA creado.
 No usar cuentas personales ni de produccion.
#>
[CmdletBinding()]
param([switch]$AutorizoCerrarSesionTemporalQA)

$ErrorActionPreference = "Stop"
$PSDefaultParameterValues['Invoke-WebRequest:UseBasicParsing'] = $true

$project = "tbfhiqkivsoeuudlpkgi"
$base = "https://$project.supabase.co"
$token = $null
$key = $null
$credentials = $null
$bodyJson = $null

function Get-QAUserStatus {
    param([hashtable]$Headers)
    try {
        $r = Invoke-WebRequest -Uri "$base/auth/v1/user" -Headers $Headers -Method Get -TimeoutSec 15
        $user = $r.Content | ConvertFrom-Json
        return @{ status = [int]$r.StatusCode; userId = [string]$user.id }
    }
    catch {
        $status = 0
        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch {}
        }
        return @{ status = $status; userId = "" }
    }
}

try {
    if (-not $AutorizoCerrarSesionTemporalQA) {
        Write-Host "NO_EJECUTADO: requiere el parametro -AutorizoCerrarSesionTemporalQA."
        exit 2
    }

    Write-Host "Destino fijo: MG WEB STUDIO AUTH QA ($project)."
    Write-Host "Esta prueba cerrara UNA SESION de una cuenta temporal del proyecto QA."
    Write-Host "No crea ni elimina usuarios y NO modifica el esquema de Supabase."
    $consent = Read-Host "Escribe CONFIRMO_QA para continuar"
    if ($consent -cne "CONFIRMO_QA") { throw "QA_CANCELADO" }

    $key = Read-Host "Introduce SOLO la clave PUBLICA sb_publishable_ de este proyecto QA"
    if ($key -cnotmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
        throw "CLAVE_NO_PUBLICABLE: nunca utilices service_role, sb_secret_ ni JWT privado"
    }

    $credentials = Get-Credential -Message "SOLO correo y clave de una cuenta de prueba TEMPORAL en QA"
    if (-not $credentials) { throw "CREDENCIALES_CANCELADAS" }
    $email = [string]$credentials.UserName
    if ($email -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$' -or -not $email.ToLowerInvariant().Contains("qa")) {
        throw "CUENTA_NO_TEMPORAL: el correo debe ser de prueba y contener 'qa'"
    }
    $password = $credentials.GetNetworkCredential().Password
    if ([string]::IsNullOrWhiteSpace($password)) { throw "CLAVE_VACIA" }

    $bodyJson = @{ email = $email; password = $password } | ConvertTo-Json -Compress
    $password = $null
    $credentials = $null

    try {
        $login = Invoke-RestMethod -Uri "$base/auth/v1/token?grant_type=password" -Method Post -ContentType "application/json" -Headers @{ apikey = $key } -Body $bodyJson -TimeoutSec 15
    }
    catch { throw "LOGIN_QA_FALLO: revisa que la cuenta temporal exista y este habilitada" }
    $bodyJson = $null

    $token = [string]$login.access_token
    $userId = [string]$login.user.id
    if ([string]::IsNullOrWhiteSpace($token) -or $userId -notmatch '^[0-9a-fA-F-]{36}$') {
        throw "LOGIN_QA_RESPUESTA_INVALIDA"
    }

    $headers = @{ apikey = $key; Authorization = "Bearer $token" }
    $before = Get-QAUserStatus -Headers $headers
    if ($before.status -ne 200 -or $before.userId -ne $userId) {
        throw "VERIFICACION_PREVIA_FALLO: no se ejecutara el cierre de sesion"
    }
    Write-Host "ANTES_DE_LOGOUT: GET_USER_ACTIVO (HTTP 200)."

    try {
        $logout = Invoke-WebRequest -Uri "$base/auth/v1/logout?scope=local" -Headers $headers -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 15
        if ([int]$logout.StatusCode -notin @(200,204)) { throw "LOGOUT_HTTP_INESPERADO" }
    }
    catch { throw "LOGOUT_QA_INCIERTO: no se repetira automaticamente" }
    Write-Host "LOGOUT_LOCAL_QA: CONFIRMADO."

    $after = Get-QAUserStatus -Headers $headers
    if ($after.status -eq 200 -and $after.userId -eq $userId) {
        Write-Host "RESULTADO: TOKEN_ANTIGUO_SIGUE_ACEPTADO_POR_GETUSER."
        Write-Host "SEGURIDAD: NO habilitar operaciones sensibles basadas solo en V132."
        exit 3
    }
    if ($after.status -in @(401,403)) {
        Write-Host "RESULTADO: GETUSER_RECHAZA_TOKEN_TRAS_LOGOUT."
        Write-Host "LIMITACION: esto NO demuestra revocacion atomica antes de COMMIT ni autoriza produccion."
        exit 0
    }
    Write-Host "RESULTADO: INCONCLUSO (la respuesta no confirma revocacion)."
    Write-Host "SEGURIDAD: mantener NO_GO."
    exit 4
}
catch {
    Write-Host "PRUEBA_DETENIDA_SIN_PUBLICAR: $($_.Exception.Message)"
    exit 5
}
finally {
    $token = $null
    $key = $null
    $bodyJson = $null
    $credentials = $null
    $headers = $null
}
