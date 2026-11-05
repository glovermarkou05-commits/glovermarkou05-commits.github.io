# V135 — conexión segura del backend y validación MFA en Supabase QA

**Fecha de trabajo:** 4 de noviembre de 2026, Ecuador. **Estado:** `CODIGO_Y_CI_APROBADOS / CREDENCIALES_QA_BLOQUEADAS / PRUEBA_REAL_PENDIENTE`.

## Lo implementado y verificado

- [Servidor privado V135](../server/v135-private-qa-runtime.cjs): integra la composición V133; únicamente acepta el host `db.tbfhiqkivsoeuudlpkgi.supabase.co`, puerto 5432, base `postgres`, y un cliente oficial Supabase Auth aislado con sesión iniciada, nunca `service_role` para MFA.
- Construye tres pools PostgreSQL con los roles instalados por V134, contraseñas distintas fuera del repositorio y TLS con certificado CA, `rejectUnauthorized:true` y hostname fijo. No admite connection strings genéricos que puedan anular esta configuración.
- Comprueba mediante consulta de solo lectura `current_user`, `session_user`, base, réplica y `pg_stat_ssl.ssl=true` antes de iniciar operaciones MFA. Una sesión SDK local mal asociada no es prueba de identidad; V132 todavía exige `getClaims` firmado y `getUser` en Auth.
- Niega acceso si falla TLS, roles, sesión o firma. Cierra conexiones con `close()`, sin devolver passwords, tokens, objetos de credenciales ni exponer ruta HTTP.
- [Pruebas unitarias](../tests/v135-private-qa-runtime.test.cjs): 6/6 PASS con mocks y acceso de red denegado.
- [Script Windows de conexión segura](../qa/v135-conectar-postgres-qa-seguro.ps1): exige el cliente `psql.exe`, certificado CA descargado de Supabase y confirmación `CONFIRMO_V135_QA`. Invoca `psql` con `sslmode=verify-full`; **no activa claves automáticamente** ni las solicita en el chat. Se comprobó **solo su sintaxis** en CI.
- [CI V135](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41945577874) aprobó 6/6 y `V135_POWERSHELL_PARSE_ONLY_PASS`.

## Estado real y limitación

La migración V134 ya creó dos esquemas privados, dos tablas, siete políticas y tres roles LOGIN con `PASSWORD NULL` en el proyecto `tbfhiqkivsoeuudlpkgi`. **Los roles NO pueden autenticarse por contraseña** hasta que el propietario los aprovisione en una terminal local segura. No se ha probado el backend real sobre ellos; CI sigue usando pools y respuestas Supabase Auth simuladas.

En las primeras verificaciones de V135, QA mantenía 0 usuarios, 0 sesiones, 3 roles bloqueados y 2 esquemas MFA; ningún registro fue modificado.

**No declarar V135 totalmente terminada, ni real-MFA PASS, ni GO de producción.** Mantener V67 formal 0/32, PR #7 DRAFT y `NO_GO`. La conexión directa a Supabase puede requerir IPv6; si no está disponible, no inferir una URL alternativa de pooler: obtener la conexión exacta desde Dashboard y revisar el modelo TLS/identidad antes de cambiar código.

## Próximo paso operativo limitado, sin compartir secretos

1. En el proyecto **MG WEB STUDIO AUTH QA**, desde la sección Database Settings, descargar el certificado CA/SSL. No cargarlo a GitHub ni enviarlo al chat. Consultar [Supabase: conectar a PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) y [verificación SSL](https://supabase.com/docs/guides/platform/ssl-enforcement).
2. En Windows, comprobar localmente que `psql.exe` está instalado (`Get-Command psql.exe`). Este paso es lectura local y no cambia nada en QA.
3. Si el cliente existe, descargar desde el PR #7 el script de PowerShell V135 y ejecutarlo **solo en la PC del propietario**, indicando `-ConectarQA -CertificadoCA "ruta al .crt"`. Exige confirmación adicional y comprueba el host QA con TLS `verify-full`.
4. Dentro de la sesión `psql` de PostgreSQL QA, utilizar `\password mg_qa_mfa_challenge_journal`, `\password mg_qa_mfa_receipt_issuer`, `\password mg_qa_mfa_receipt_reader` **de uno en uno**. Cada uno solicitará nueva clave y confirmación. Guardarlas únicamente en gestor de secretos privado, distintas y largas. No pegarlas en SQL Editor ni PowerShell ni ChatGPT.
5. Cerrar con `\q`. Verificar desde una lectura de catálogo (únicamente booleanos, nunca hashes) que los 3 roles ya tienen password configurada y que las tablas están vacías. Si un rol quedó bloqueado, detenerse y revisar: no activar endpoints ni usuarios.
6. Preparar el backend real con esas credenciales a través del entorno secreto privado y la CA validada, con cliente oficial Supabase por sesión. Nunca almacenar contraseñas en configuración de frontend, archivos `.env` bajo control de versiones ni archivos de CI.
7. Una vez que las conexiones reales funcionen, realizar **una única prueba MFA TOTP AAL2** en una cuenta temporal específicamente QA, registrando desafío y recibo privado, y verificar el rechazo de repetición. Cerrar sesión y borrar solo esa cuenta al terminar, preservando la evidencia de auditoría según política de retención.
8. Realizar comprobación final de grupos, RLS, autorizaciones, registros, backups y comportamiento ante Auth revocado. No repetir V107 ni V132.

**Seguridad importante:** no se ha habilitado un endpoint público, no se han mostrado ni generado credenciales aquí y no se ha intervenido producción.

## Resultado de aceptación esperado

V135 puede declararse cerrada **solo** cuando existan tres conexiones reales TLS/hostname verificado con roles distintos, un token `aal2` de Supabase auténtico haya producido un recibo QA bajo control de anti-replay, la cuenta temporal esté eliminada y el inventario final haya sido auditado. Pasar pruebas sintéticas no sustituye esos controles.

