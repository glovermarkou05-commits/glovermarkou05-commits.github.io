# MG WEB STUDIO CLOUD — V75 | Verificación de sesiones PostgreSQL con mínimo privilegio

**Rama:** \`feature/mg-digital-v5-web-services\`  
**Fecha:** 23/10/2026  
**Resultado:** V75 implementada y probada con **consultas PostgreSQL simuladas**. **No se accedió a ninguna base real, no se otorgaron permisos ni se desplegó la aplicación.** Producción, STAGING y red real: **NO GO**.

## 1. Qué se implementó

\`server/pg-session-reader-v75.cjs\` exporta \`createPgSessionReaderV75({query,nowSec?,proofTtlSec?})\`. Devuelve \`{readSession,readiness}\`. Se suministra desde código de servidor un callback de consultas estrictamente de solo lectura; la fábrica **no** importa drivers, abre pools, configura roles, obtiene claves ni lee variables de entorno.

**Contrato de llamada:** \`readSession({subject,sessionId,signal})\` recibe los UUID ya verificados criptográficamente por V71–V74. Rechaza entradas mal formadas antes de consultar. Emite **exclusivamente esta consulta fija**, con parámetros \`$1\` (sesión) y \`$2\` (usuario):

\`\`\`sql
SELECT
  id::text AS "sessionId",
  user_id::text AS "subject",
  FLOOR(EXTRACT(EPOCH FROM not_after))::bigint::text AS "notAfterEpoch"
FROM auth.sessions
WHERE id = $1::uuid AND user_id = $2::uuid
LIMIT 2
\`\`\`

No se concatena ningún dato recibido del token en el SQL. \`LIMIT 2\` permite detectar resultados duplicados y **rechazarlos**, no escoger arbitrariamente uno. Solo se aceptan cero o una fila con las tres columnas esperadas y UUID coincidentes. No se extraen \`refresh_token\`, IP, correo, \`user_metadata\`, MFA, permisos o campos sensibles.

- **Fila encontrada y coincidente:** confirma, en el alcance de un proveedor confiable, que la sesión pertenece al sujeto. Si \`not_after\` está definida, se respeta como límite explícito.
- **Cero filas:** devuelve \`{active:false,revocationChecked:true,...}\`, como *negación* coherente con el comportamiento documentado de Supabase al cerrar sesión. No se confunde con un error técnico.
- **Error de base de datos, dos filas, columnas adicionales, columnas mal formadas, reloj inválido o señal cancelada:** devuelve \`null\`; la frontera V74/V73 deniega el acceso.
- **Corta vigencia de comprobación:** \`checkedAtSec\` se calcula **después** de completar la consulta; \`expiresAtSec\` vence a los 2 segundos por defecto (configurable de 1 a 5), o antes si existe \`not_after\`. Esta fecha representa **la vigencia de la acreditación de lectura**, **no** la vida completa de la sesión Supabase. V71 comprueba por separado \`JWT.exp\`.

La salida coincide con el contrato V74:
\`{active:boolean,revocationChecked:true,subject,sessionId,checkedAtSec,expiresAtSec}\`.
Los resultados son inmutables y el indicador \`readiness\` siempre declara \`databaseConnected:false\`, \`grantsVerified:false\`, \`sessionPolicyVerified:false\`, \`realRevocationVerified:false\`, \`productionAuthorized:false\` y \`decision:'NO_GO'\`.

## 2. Importante: qué demuestra realmente auth.sessions

La documentación actual de Supabase establece que \`session_id\` es el identificador de sesión en el JWT y corresponde a \`auth.sessions.id\`. Cuando el usuario cierra sesión, las sesiones afectadas desaparecen de esa tabla. También advierte que los límites por inactividad, duración máxima o sesión única **no se materializan necesariamente inmediatamente**; pueden aplicarse al siguiente refresco del token y las filas vencidas pueden permanecer durante la limpieza progresiva.

Por ello **la existencia de una fila no demuestra por sí sola que se han cumplido todas las políticas de tiempo, MFA o revocación inmediata de cualquier sesión**. V75 verifica propietario y existencia y respeta \`not_after\` si el esquema lo incluye; no implementa todas las reglas de expiración administrativa de Supabase. Antes de conectar un proyecto real se necesita revisar la configuración de sesiones, la versión efectiva del esquema y confirmar qué política puede implementarse con evidencias independientes.

Referencia oficial: https://supabase.com/docs/guides/auth/sessions  
Modelo upstream de Auth: https://pkg.go.dev/github.com/supabase/auth/internal/models

## 3. Mínimo privilegio: condiciones ANTES de usar PostgreSQL real

No se modificaron permisos en esta etapa. El futuro proveedor PostgreSQL deberá revisarse y aprobarse con estas restricciones:

1. **Identidad de conexión dedicada al backend**; nunca la clave \`service_role\` expuesta al navegador. No conceder consultas de \`auth.sessions\` a \`anon\`, \`authenticated\` o público para este mecanismo.
2. **Permisos mínimos auditados**: acceso a esquema \`auth\` y \`SELECT\` únicamente sobre las columnas requeridas (\`id\`, \`user_id\`, \`not_after\`) o un mecanismo alternativo privado formalmente revisado. No \`INSERT\`, \`UPDATE\`, \`DELETE\`, \`TRUNCATE\`, administración de usuarios, \`BYPASSRLS\`, superusuario o privilegios generales. Revalidar compatibilidad con la política que administre Supabase Auth.
3. **Fuente de lectura primaria, fresca y autoritativa**: evitar réplicas con retraso, cachés de filas, resultados de lectura anteriores a una revocación, o reutilización del callback bajo identidades ajenas.
4. **Transporte/operación**: TLS del driver, \`statement_timeout\`, límite de conexiones y cancelación efectiva, transacciones solo lectura y saneamiento de logs. El \`AbortSignal\` pasado por V75 **solo indica cancelación cooperativa**: deberá respetarlo el adaptador PostgreSQL y no garantiza detener la consulta subyacente por sí mismo.
5. **Inspección de esquema y grants** en un destino autorizado de laboratorio: verificar columnas, tipos, existencia de \`not_after\`, ausencia de acceso por usuarios públicos, aislamiento y revocación de los privilegios no requeridos. No aplicar SQL ni crear migraciones sin aprobación.

El paso operativo permanece bloqueado; el código de V75 **no** crea un cliente PostgreSQL, modifica roles o instala una función \`SECURITY DEFINER\`. Crear una vista o función privilegiada para sortear permisos de Auth está fuera de alcance y exige revisión de seguridad independiente.

## 4. Evidencia reproducible de QA

- GitHub Actions: https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39976518123
- **Run ID:** \`39976518123\`
- **Job ID:** \`120492419800\`
- **Commit probado:** \`086527f3d8b208f1965a9dcbe5ef090a0527386e\`
- **Node.js:** \`v22.23.3\` sobre Linux GitHub Actions.
- **Estado del workflow:** \`completed / success\`, todos los pasos verdes.
- **Precarga protectora:** \`--require ./server/native-network-guard-v70.cjs\` en las nuevas suites y regresiones. Esto bloquea varias APIs de red de Node pero no equivale a un aislamiento a nivel de SO; el runner usa red para descargar el repositorio/configurar Node.

| Batería | Correctas | Fallidas |
| --- | ---: | ---: |
| V75: 28 tests del lector SQL + 10 tests de integración JWT/V60–V74 | **38** | **0** |
| V74: contrato JWKS/origen fijo | **39** | **0** |
| V73: límite de proveedores, circuit breaker | **34** | **0** |
| V72: claves y revocación sintética | **28** | **0** |
| V71: firma JWT ES256/RS256 | **44** | **0** |
| V70: siete suites de seguridad backend | **92** | **0** |
| **Total ejecutado** | **275/275** | **0** |

**Nota sobre la primera ejecución:** Run \`39976399447\` falló **1 de 38 tests V75**: la prueba directa del repositorio omitió el \`AbortSignal\` que el mock de consulta exige. La ruta normal V74 sí lo suministraba. Se corrigió **la prueba**, no la política de aceptación, y GitHub Actions repitió la batería completa: \`275/275 PASS\`. La primera ejecución no se presenta como satisfactoria.

Las pruebas revisan SQL invariable y parametrizado, selección mínima, caso sin fila, fila expirada, resultado duplicado, usuario/sesión que no coinciden, desbordamiento, abortos, inyección por UUID inválido, reloj regresivo, JWT alterado, audiencia incorrecta, prohibición de lectura tenant al fallar autenticación y ausencia de credenciales/listeners.

**Estas son pruebas nativas sobre proveedores y filas simuladas.** No se ejecutó la consulta SQL en PostgreSQL. El alcance validado no concede permisos sobre el proyecto ni certifica comportamiento de un driver, un servidor o un clúster real.

## 5. Archivos de la etapa

- \`server/pg-session-reader-v75.cjs\`
- \`tests/pg-session-reader-v75.test.cjs\`
- \`tests/pg-session-integration-v75.test.cjs\`
- \`.github/workflows/mg-web-studio-v75-pg-session.yml\`
- \`docs/V75-POSTGRES-SESIONES-SOLO-LECTURA.md\`

## 6. Continuidad sugerida — V76

Preparar la **matriz de concesiones de privilegios, verificación estática de migraciones, auditoría de roles/grants y ensayo de integración PostgreSQL 17**, primero con datos ficticios y sin conexiones reales. Requerir después una aprobación independiente de base de laboratorio, rol, copia, recursos y procedimiento de rollback antes de ejecutar una sola consulta real.

Los **32 controles operativos V67 permanecen PENDING** y tampoco se ha hecho un ensayo de restauración PostgreSQL 17. No se publicó la aplicación ni se consumieron créditos Lovable.

**Dictamen final V75:** implementación y QA sintética terminadas, **275 tests ejecutados y aprobados**; Auth real, acceso a PG, seguridad de red y publicación siguen en estado **NO GO**.
