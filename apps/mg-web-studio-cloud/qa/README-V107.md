# MG WEB STUDIO CLOUD — V107 | Ejecutor local de MFA TOTP (QA)

**Estado a 02/11/2026:** **Código y 20 pruebas offline aprobadas**. **Prueba contra Supabase Auth real: pendiente de ejecutar desde terminal confiable.**

Este ejecutor fue diseñado para la autorización de una **única cuenta sintética** en `MG WEB STUDIO AUTH QA`, región `sa-east-1`, con cierre de sesión y borrado después de la prueba. No afecta la web publicada ni los proyectos FINZY, Ventry, BAZAR-ONLINE o MG CLUB+.

## Garantías operativas

- **`--dry-run` no hace solicitudes**, no importa el SDK y no requiere claves.
- **`--execute`** se bloquea salvo que coincidan el proyecto aprobado (huella SHA-256 fija del project ref, sin publicar el ref en este repositorio), la URL `https://<ref>.supabase.co`, la señal exacta de aprobación, las credenciales de ese laboratorio y el lockfile de npm.
- `@supabase/supabase-js` **2.118.0 exacto**, con `package-lock.json` generado por npm y versiones/hashes de integridad de dependencias.
- Cliente administrador y cliente de usuario distintos, sin sesión persistida ni refresco automático; no reutiliza cuentas existentes.
- Antes de crear, consulta únicamente la **primera página de hasta dos usuarios del sandbox**. Si la lista no está vacía, **rechaza crear**. El laboratorio se comprobó vacío por conteos SQL (0 usuarios, 0 sesiones y 0 MFA); este dato puede cambiar y se revalida al ejecutar.
- Una sola identidad ficticia **`mg-webstudio-v107-qa@example.invalid`** (dominio reservado/no entregable), sin teléfono, WhatsApp, SMS ni correos a personas reales. Si Supabase rechaza el correo reservado, **detenerse y revisar el plan**, no cambiarlo por uno real automáticamente.
- Contraseña temporal aleatoria generada en memoria. `mfa.enroll({factorType:'totp'})`, `challenge` y `verify` desde un proceso seguro; TOTP de 6 dígitos generado en memoria mediante algoritmo estándar (sin QR/secret en logs).
- Verifica sujeto, sesión y `aal1` inicial; después `aal2`, AMR TOTP reciente, identidad y **mismo session_id** del token renovado. Si Supabase rota la sesión, falla de forma segura y documenta la discrepancia sin forzar un acceso.
- Un único intento por proceso, más bloqueo local contra ejecuciones concurrentes. El bloqueo local **no es distribuido ni resiste todos los escenarios de terminación forzada**.
- `finally` intenta `signOut({scope:'global'})` **solo para la cuenta QA** y `auth.admin.deleteUser(id)` exclusivamente con ID obtenido al crear esa cuenta. No borra identidades por búsqueda o suposición.
- Si el resultado de creación es ambiguo o falla el borrado, el estado pasa a `MANUAL_REVIEW_CREATION_UNCERTAIN` o `FAILED_DELETE_MANUAL_REVIEW` y exige revisión en Supabase **antes de repetir**.
- Salida exclusivamente por categorías `PASS/BLOCKED`, `stage`, `cleanup`; no imprime JWT, refresh token, contraseña, factor, código TOTP, email, identificador de usuario ni claves.
- **Esto no acredita una revocación inmediata de todos los access tokens**. Supabase advierte que los JWT pueden seguir siendo criptográficamente válidos hasta expirar. No se da PASS a AUTH-02 ni a los controles V67 solo por resultado positivo.
- **No se fusiona PR #7 ni se publica producción**. Ninguna operación en la base de otras aplicaciones.

## Antes de ejecutar

1. Asegúrate de estar en la rama `docs/mg-web-studio-v94-preflight-20261101` del repositorio `glovermarkou05-commits/glovermarkou05-commits.github.io`. **No uses main ni otra carpeta de proyecto**.
2. Abre el proyecto [MG WEB STUDIO AUTH QA en Supabase](https://supabase.com/dashboard/projects). La referencia del proyecto **solo se lee en el dashboard**; no guardarla en Git ni pegarla en la conversación.
3. Obtén desde la configuración de API del proyecto QA la clave **secret / service_role** para el administrador y una **publishable / anon** para el cliente sintético. No utilizar claves de ninguna otra aplicación. **No las envíes por ChatGPT ni las agregues a un archivo `.env` del repositorio.**
4. Utiliza Windows PowerShell con Node.js **22 o 24** y acceso a npm. El equipo debe tener el reloj sincronizado para TOTP.
5. En la raíz del repositorio de MG Web Studio:
   ```powershell
   git fetch origin
   git switch docs/mg-web-studio-v94-preflight-20261101
   git pull --ff-only origin docs/mg-web-studio-v94-preflight-20261101
   cd apps/mg-web-studio-cloud/qa
   npm ci --ignore-scripts --no-audit --no-fund
   npm run dry-run
   ```
   La prueba previa debe mostrar `V107 DRY_RUN`. **No ejecutar `npm run qa` si falló el paso anterior**.

## Ejecutar una vez desde PowerShell (sin guardar claves en disco)

Las siguientes variables de entorno son **temporales para la ventana de PowerShell**. Escribe la referencia del proyecto que ves en el Dashboard; es validada por la huella integrada del ejecutor:

```powershell
$env:MG_AUTH_QA_PROJECT_REF = Read-Host "Referencia exacta del proyecto QA"
$env:MG_AUTH_QA_URL = "https://$($env:MG_AUTH_QA_PROJECT_REF).supabase.co"
$env:MG_AUTH_QA_CONFIRMATION = "YES_ONE_SYNTHETIC_TOTP_USER_DELETE_AFTER_TEST"

$adminSecure = Read-Host "Clave administrativa SOLO del QA (oculta)" -AsSecureString
$adminPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecure)
try {
    $env:MG_AUTH_QA_ADMIN_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr)
}

$publishableSecure = Read-Host "Clave publishable SOLO del QA (oculta)" -AsSecureString
$publishablePtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($publishableSecure)
try {
    $env:MG_AUTH_QA_PUBLISHABLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($publishablePtr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($publishablePtr)
}

try {
    npm run qa
} finally {
    Remove-Item Env:MG_AUTH_QA_PROJECT_REF -ErrorAction SilentlyContinue
    Remove-Item Env:MG_AUTH_QA_URL -ErrorAction SilentlyContinue
    Remove-Item Env:MG_AUTH_QA_CONFIRMATION -ErrorAction SilentlyContinue
    Remove-Item Env:MG_AUTH_QA_ADMIN_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:MG_AUTH_QA_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
    Remove-Variable adminSecure,publishableSecure -ErrorAction SilentlyContinue
}
```

**No copiar las claves al chat, capturas, scripts ni logs.** La contraseña del usuario de ensayo y el secreto TOTP no se muestran nunca. El código genera el código de prueba internamente.

## Interpretación del resultado y limpieza

| Salida categórica | Interpretación / acción |
| --- | --- |
| `PASS; stage=COMPLETE; cleanup=CONFIRMED` | Flujo de ensayo AAL1→TOTP→AAL2 y eliminación de identidad sintética completados a nivel SDK. **No** implica aprobación V67. |
| `BLOCKED; stage=EMPTY_LAB` | El sandbox no estaba vacío (o la consulta falló). **No** se creó nada; revisar el proyecto correcto antes de actuar. |
| `BLOCKED; stage=CREATE; cleanup=MANUAL_REVIEW_CREATION_UNCERTAIN` | Puede haber una creación parcial. En Dashboard QA > Authentication > Users, revisar **solo el email sintético indicado arriba** y realizar la limpieza manual si existe. No repetir automáticamente. |
| `BLOCKED; cleanup=FAILED_DELETE_MANUAL_REVIEW` | El borrado no quedó confirmado: intervención humana obligatoria en **el QA correcto**, jamás en otro proyecto. |
| `BLOCKED; cleanup=PARTIAL_SIGNOUT_FAILED` | Borrado completado, cierre de sesión sin confirmar. Esperar a comprobar el estado de sesiones y no afirmar revocación instantánea. |
| `BLOCKED; stage=AAL2` | Supabase no devolvió sesión o assurance compatibles con el contrato; las operaciones de limpieza igualmente se intentan. |
| `BLOCKED: ANOTHER_RUN_OR_STALE_LOCK` | Existe otro proceso local o un bloqueo de un cierre abrupto. Verificar en Dashboard QA si quedó usuario/factor de prueba antes de revisar el archivo de bloqueo temporal; no eliminarlo a ciegas. |

Si el equipo se apaga abruptamente (o se interrumpe antes del `finally`), un proceso no puede garantizar la eliminación. **Verificar manualmente la cuenta sintética en el dashboard antes de cualquier otro intento.**

## Validación y aprobación formal

- QA de código: [GitHub Actions V107](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41482239796) — 20/20 pruebas adversariales, 0 FAIL, sin acceso a Auth real.
- Evidencia real requerida: únicamente resultado categórico de ejecución, estado de cleanup, comparación de sesión y fecha, **sin capturas de secretos o emails completos**.
- Revisión independiente: [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8), todavía pendiente. Solo esa revisión podrá proponer el cierre formal de controles.
- V67: **32 PENDING / 0 PASS**. Producción y publicación: **NO_GO**.

Este ejecutor resuelve la preparación técnica de V107. **La ejecución sobre Supabase real se hace únicamente en un equipo/servidor confiable con las credenciales QA, fuera de GitHub Actions y del chat.**
