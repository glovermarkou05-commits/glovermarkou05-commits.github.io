# MG WEB STUDIO CLOUD | V110 — Ledger privado transaccional: PostgreSQL 17 real en CI desechable

**Fecha de gestión:** 2026-11-02 (America/Guayaquil). **Estado:** `PG17_DISPOSABLE_VERIFIED` — no aplicada a Supabase.  
**Pruebas CI:** [GitHub Actions #41572297764](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41572297764), **13 de 13 PASS, 0 FAIL**, servicio `postgres:17`.  
**Alcance limitado:** propuesta SQL + tests reales contra PostgreSQL efímero del runner. **No se ejecutó SQL en `MG WEB STUDIO AUTH QA`**, no se crearon tablas, políticas, roles ni usuarios allí, ni se modificó proyecto productivo, FINZY, MG CLUB+, Ventry o BAZAR-ONLINE.

## 1. Propósito y protección de aislamiento

V109 definió `consumeEventAtomically` y probó su contrato con mocks. V110 demuestra la viabilidad del **primitivo transaccional de unicidad de Postgres** con conexiones independientes, sin afirmar que el lector de sesión, la integración de identidad o los efectos comerciales estén resueltos.

Archivo de propuesta **no ejecutable como migración sin revisión adicional**:

`proposals/v110-private-mfa-ledger-review-only.sql`

La CI solamente ejecuta ese archivo en un PostgreSQL 17 efímero provisto por GitHub Actions, con roles `anon`, `authenticated`, `service_role` **simulados localmente en ese contenedor**, sin claves ni acceso a Supabase. **El archivo no se guardó en la carpeta de migraciones para evitar que algún pipeline despliegue por accidente un diseño todavía pendiente de autorización.**

La propuesta crea el esquema privado `mg_auth_ledger` y tabla `mfa_redemptions`, restringe `PUBLIC`, `anon`, `authenticated`, `service_role` mediante `REVOKE`, y habilita + fuerza RLS **sin políticas** (denegación para no propietarios). No crea RPC, vista, Edge Function, `SECURITY DEFINER`, usuarios Auth o conexión comercial.

Columnas: `event_key` (hash HMAC en minúsculas de 64 hex), `verified_at`, `consumed_at`, `retain_until`. **Nunca almacenar `sub`, correo, sesión JWT, OTP, secreto TOTP, refresh token ni secreto HMAC**. El índice único es la clave primaria `event_key`; el hash HMAC, calculado por el backend, debe usar clave secreta compartida por todos los servidores.

## 2. Restricciones Postgres propuestas

- `PRIMARY KEY(event_key)`: el mismo evento no puede registrarse dos veces por inserciones confirmadas.
- `event_key ~ '^[0-9a-f]{64}$'`: solo HMAC de longitud y formato previstos.
- La verificación puede adelantarse hasta 300 segundos al consumo; una pequeña tolerancia de reloj de 3 segundos favorece consistencia; **no se autoriza por ello un JWT**.
- `retain_until >= verified_at + interval '310 seconds'`: mantener lápida después de toda la ventana de vigencia MFA y 10 segundos extra, sin permitir liberar inmediatamente una clave consumida.
- `FORCE ROW LEVEL SECURITY`, sin políticas de acceso: no operativo para aplicación sin un diseño separado de rol servidor/políticas y auditoría DBA.
- `CREATE SCHEMA` y `CREATE TABLE` deliberadamente no idempotentes; una segunda ejecución falla en vez de ocultar cambios o mutar silenciosamente una instalación previa.

**Primitivo propuesto:** `INSERT ... ON CONFLICT (event_key) DO NOTHING RETURNING event_key`. Solo la conexión que inserta obtiene la fila; en caso de conflicto la devuelve vacía. **Aceptar el resultado únicamente después del commit confirmado**, no después de que el cliente enviara la sentencia ni ante timeout incierto.

La prueba real utiliza rol local `postgres` privilegiado exclusivamente dentro de CI desechable, no el futuro rol de la aplicación. **Las pruebas todavía no certifican la identidad del backend de producción ni los grants mínimos para un rol de servicio revisado.**

## 3. Evidencia real de PostgreSQL 17 (13/13 PASS)

Suite `tests/v110-pg17-private-ledger.test.cjs` mediante `.github/workflows/mg-web-studio-v110-pg17-ledger-disposable.yml`.

| Caso | Resultado |
| --- | --- |
| PostgreSQL 17 efímero, sin variables de conexión Supabase | PASS |
| Esquema privado y solo una tabla esperada | PASS |
| Roles `anon/authenticated/service_role` sin uso del esquema ni SELECT/INSERT/UPDATE/DELETE | PASS |
| RLS activado y forzado; **0 políticas** | PASS |
| Acceso de `anon` a tabla denegado | PASS |
| Inserción única secuencial, segundo intento sin fila | PASS |
| **Dos conexiones independientes simultáneas**: exactamente 1 inserción | PASS |
| **Dieciséis conexiones independientes simultáneas**: exactamente 1 inserción, 15 conflictos | PASS |
| `BEGIN; INSERT; ROLLBACK`: permite el siguiente intento legítimo | PASS |
| Rechazo de clave que no es hash hex minúsculo de 64 caracteres | PASS |
| Rechazo de expiración/retención menor a mínimo | PASS |
| Rechazo de prueba MFA anterior a la ventana permitida | PASS |
| Esquema de columnas sin información de identidad o secretos | PASS |

GitHub Actions muestra algunos mensajes PostgreSQL `permission denied` y `CHECK constraint violation`: **son errores deliberados de casos adversarios**, capturados y aceptados por el test. La suite finalizó con `13 pass / 0 fail`.

## 4. Lo que NO certifica esta prueba

1. **Supabase real no recibió ninguna modificación.** V110 no es una migración autorizada para el laboratorio. Una prueba reproducible de Postgres demuestra el mecanismo subyacente, pero no los privilegios administrados concretos en Supabase.
2. `readPrimarySession` V109 no está conectado a una lectura **autoritaria de revocación** de `auth.sessions`. V104 demostró que `service_role` no tenía SELECT directo; no abrir la tabla Auth.
3. Todavía no existe un rol backend con privilegios mínimos, más una política RLS y topología de acceso revisadas. El rol `postgres` de CI representa únicamente el ejecutor de pruebas.
4. La operación comercial (`publish`, miembros, facturación) debe integrarse con el gasto del evento en **una transacción idempotente o una máquina recuperable**, para que una caída entre operaciones no genere estado inconsistente. El ledger aislado no resuelve por sí solo ese problema.
5. Retención, eliminación controlada, rotación de clave HMAC, carreras entre cierre de sesión y consumo y caídas de nodos deben probarse dentro del entorno real bajo revisión.
6. Los roles del contenedor GitHub son **simulaciones** del nombre de roles Supabase. No se debe inferir que esto constituye una auditoría de permisos end-to-end de su Data API.
7. Se mantiene la revisión independiente humana del [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) y la matriz V67 **32 PENDING / 0 PASS**. No fusionar PR #7 ni publicar.

## 5. Puertas que requieren aprobación antes de aplicar a Supabase QA

**G110-A: revisión DBA/Seguridad del DDL y del riesgo de acceso.** Confirmar exclusión de `mg_auth_ledger` de esquemas expuestos por Data API, políticas RLS cerradas, ownership real y privilegios mínimos. Aprobar diseño de retención y revisión independiente.

**G110-B: autorización específica del propietario para SQL en `MG WEB STUDIO AUTH QA`.** El consentimiento anterior cubría el proyecto vacío y el ciclo de cuenta TOTP, no la creación de una tabla o cambio de RLS.

**G110-C: construir adaptador real `consumeEventAtomically`**, con rol de backend autorizado, transacción y garantía de commit; probar dos conexiones realmente independientes en QA, sin publicar claves.

**G110-D: corroboración autoritativa de sesión y transacción comercial**. Probar que una sesión revocada no habilita un token todavía firmado, aislamiento entre tenants y recuperación tras fallos.

**G110-E: revisión independiente de V67**, sin convertir automáticamente 13 pruebas PG17 en aprobaciones de controles productivos.

**Cierre V110:** **SQL de propuesta y 13 pruebas reales de PostgreSQL 17: terminado y aprobado en CI efímero.** **No desplegado en Supabase, sin ledger compartido operativo de aplicación, V67 32 PENDING / 0 PASS, PR #7 draft, producción NO_GO.**
