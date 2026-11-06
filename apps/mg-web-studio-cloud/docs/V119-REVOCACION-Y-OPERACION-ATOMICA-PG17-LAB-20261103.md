# MG Web Studio Cloud — V119: revocación simulada y operación empresarial atómica

**Corte:** 2026-11-03 America/Guayaquil (GitHub registra 2026-11-04 UTC).  
**Estado:** `PG17_SYNTHETIC_ATOMIC_COMMIT_18_PASS` — laboratorio aislado, **no desplegado**.  
**Evidencia:** [GitHub Actions #41760179573](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41760179573), job `126345754412`, **18/18 PASS, 0 FAIL**.

## Qué se implementó

1. `qa/v119-atomic-business-lab.cjs`: servicio **solo de laboratorio** que recibe un evento MFA sintético y proveedores inyectados de sesión primaria y autorización de recurso. Verifica las respuestas con un contrato estricto y **niega si son incorrectas, vencidas, revocadas o si el proveedor falla**.
2. Después de comprobar permisos, el backend de prueba V118 abre una sola transacción PostgreSQL con `BEGIN`; inserta la clave MFA en `mg_auth_ledger.mfa_redemptions` y la acción ficticia en `mg_v119_fictional.completed_operations`, revisa de nuevo la sesión simulada y ejecuta `COMMIT`. Ante error antes de `COMMIT`, intenta `ROLLBACK` y no reporta éxito.
3. El esquema `mg_v119_fictional` solo existe en el servicio PostgreSQL 17 temporal de GitHub Actions; su tabla usa PRIMARY KEY y RLS forzado con política de inserción limitada al rol `mg_auth_ledger_writer`. Las propuestas V110/V111 también se ejecutaron **exclusivamente en ese contenedor temporal**.
4. Los tests usan un login PostgreSQL de bajo privilegio y el wrapper V118, descartando cada conexión al terminar. El proveedor de sesión/ACL es **un doble de pruebas**, **no** una lectura a `auth.sessions` ni una integración con las aplicaciones reales.
5. Dependencias `pg` instaladas con `npm ci` y lockfile ya incluido en V117.

## Evidencia de 18 pruebas

| Familia | Resultado |
| --- | --- |
| Entorno PostgreSQL 17 sintético sin conexión Supabase | PASS |
| RLS y ausencia de acceso de roles públicos | PASS |
| Ledger + efecto empresarial ficticio en el mismo commit | PASS |
| Evento MFA duplicado no crea segundo efecto | PASS |
| Sesión revocada antes de la acción | PASS |
| Comprobante vencido | PASS |
| Autorización de recurso denegada | PASS |
| Proveedor de sesiones no disponible | PASS |
| Error después de inserción ledger causa rollback | PASS |
| Colisión de clave empresarial causa rollback del ledger | PASS |
| Error después de insertar operación causa rollback conjunto | PASS |
| Revocación **simulada** entre comprobaciones causa rollback | PASS |
| Dos transacciones concurrentes, exactamente un éxito | PASS |
| 16 transacciones concurrentes, exactamente un éxito | PASS |
| Confirmación de commit perdida: rechazo sin repetición, incluso si la escritura se persistió | PASS |
| Input extra/rol/JWT falsificado no se acepta | PASS |
| Rol escritor no puede SELECT/UPDATE/DELETE sobre la operación ficticia | PASS |
| Código sin conexión Auth, secrets, DDL ni API externas | PASS |

## Límites de seguridad — puertas sin resolver

- **No existe comprobación real y autoritativa de revocación**: `readPrimarySession` es un proveedor simulado. Una revocación que sucede **después de la última comprobación y antes del commit** puede escapar. La garantía estricta entre Auth y operación empresarial requiere un diseño transaccional/coordinado, revisión independiente y pruebas adversarias de carrera.
- **La operación empresarial es ficticia** y está en la misma base de datos que el ledger solo dentro de CI. Si un módulo real utiliza otro servicio, un segundo datastore o una API externa, una única transacción PostgreSQL **no** asegura atomicidad distribuida; se necesita patrón idempotente/recuperación auditado.
- **El evento se suministra mediante fixture confiable**; no es una validación completa de la cadena de prueba MFA real V101/V102 o la procedencia de un HMAC en Supabase. No recibir nunca la clave como autorización directa desde un cliente.
- Si se pierde la confirmación de `COMMIT`, se responde fallo cerrado, se destruye la conexión y no se reintenta automáticamente. **Esto no garantiza que el commit se haya revertido**, como confirma el ensayo.
- Los roles en CI son ficticios; no hay principal backend real, conexión TLS de Supabase ni almacenamiento/rotación de secretos.
- Imágenes de servicio por etiqueta requieren revisión/pinning de digest y control de cadena de suministro.
- Siguen pendientes aprobación DBA/Seguridad humana independiente; revisión de exposición Data API y ACL QA; autorización separada y limitada para DDL en `MG WEB STUDIO AUTH QA`; aceptación formal de los 32 controles V67.

**Decisión:** V119 completada satisfactoriamente **para el laboratorio**. PR #7 permanece **abierto y en borrador**; no fusionar ni publicar. Supabase QA y producción no recibieron migraciones, cambios de roles ni SQL V119. **V67 32 PENDING / 0 PASS — PRODUCCIÓN NO_GO**.

## Próxima prioridad para terminar sin ampliar fases innecesarias

Cerrar la **revisión DBA/Seguridad independiente** y diseñar una vía mínima para validación real de sesiones revocadas, sin conceder `SELECT` directo de `auth.sessions` a clientes ni modificar proyectos de terceros. Preparar una decisión explícita para un ensayo autorizado **solo en QA** después de revisar límites y rollback, antes de considerar producción.
