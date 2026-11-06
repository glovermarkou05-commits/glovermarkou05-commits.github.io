# MG WEB STUDIO CLOUD — V111 | Rol MFA mínimo: INSERT sin SELECT

**Corte:** 2026-11-02, zona horaria Ecuador (el runner CI puede registrar 2026-11-03 en UTC).  
**Dictamen técnico:** `DISPOSABLE_PG17_INSERT_ONLY_PASS` — **solo contenedor efímero**, sin instalación en Supabase.  
**Evidencia:** [GitHub Actions #41573681765](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41573681765): **12 pruebas PASS, 0 FAIL**.

## 1. Motivo de la revisión

V110 demostró atomicidad de `INSERT ... ON CONFLICT DO NOTHING RETURNING` usando el superusuario `postgres` **solo en contenedor CI**, pero ese modelo no concede por sí solo un acceso mínimo de aplicación.

PostgreSQL documenta que las variantes `ON CONFLICT` pueden requerir `SELECT` en las columnas de arbitraje y que `RETURNING` requiere `SELECT` sobre las columnas devueltas: [SQL INSERT (PostgreSQL)](https://www.postgresql.org/docs/17/sql-insert.html). Para evitar conceder lectura de comprobantes MFA al backend, V111 escoge **`INSERT` normal, `UNIQUE` y conflicto SQLSTATE `23505`**.

La operación confiable se interpreta:
- **COMMIT confirmado de un INSERT válido:** un evento fue redimido.
- **`23505` / colisión de clave única:** el evento ya se gastó; **denegar**, no regenerar otra clave.
- **Timeout, desconexión, commit desconocido:** **denegar y conciliar**, nunca devolver aceptación ni repetir ciegamente.
- **Rollback:** no hay consumo; un nuevo intento puede ganar, sujeto a revisión de política de reintentos.
- No usar `SELECT`, `RETURNING`, ni `ON CONFLICT` con permisos adicionales.

## 2. SQL de revisión, NO migración

`proposals/v111-insert-only-ledger-writer-review.sql` **exclusivo de CI** amplía el esquema privado de V110 en una base desechable:

- Crea rol `mg_auth_ledger_writer` **NOLOGIN, NOINHERIT, NOBYPASSRLS, NOSUPERUSER**, sin facultad de crear usuarios o bases.
- Concede `USAGE` solo sobre `mg_auth_ledger`.
- Concede exclusivamente `INSERT(event_key, verified_at, retain_until)` en `mg_auth_ledger.mfa_redemptions`. No INSERT a `consumed_at` — se calcula en DB.
- Agrega una única política RLS `FOR INSERT TO mg_auth_ledger_writer WITH CHECK (true)`; las restricciones de clave hash, ventana temporal y retención siguen respaldadas por `CHECK` y `PRIMARY KEY` de V110.
- No concede `SELECT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` ni privilegios a roles del API.
- Conserva `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` del esquema base V110.
- No crea usuario Auth, secreto, cuenta, función `SECURITY DEFINER`, vista, RPC, Edge Function, rol con inicio de sesión o endpoint publicable.

**Atención:** `WITH CHECK (true)` es suficiente únicamente para un backend confiable que ya verificó identidad/sesión, autorización tenant/sitio y procedencia MFA. El rol escritor **no valida por sí solo** esos hechos; si su proceso se compromete, puede crear claves sintéticas y provocar denegaciones de servicio. Por eso el rol requiere una frontera backend auditada, credenciales aisladas, limitación de tasa y controles operativos adicionales antes de su uso real.

**Nota sobre acceso:** la creación del rol `NOLOGIN` solo demuestra permisos de la función de base de datos tras `SET ROLE` **desde el superusuario efímero de CI**. No se ha configurado en el proyecto Supabase un principal servidor con membresía en ese rol. Diseñar tal enlace requiere aprobación DBA y un modelo claro de identidad de servicio, control de conexiones y custodia de credenciales.

## 3. Resultados de integración PG17 real

`tests/v111-pg17-insert-only-ledger.test.cjs` corre contra PostgreSQL 17 independiente en GitHub Actions, sin librerías de aplicación ni claves Supabase.

| Prueba | Resultado |
| --- | --- |
| PostgreSQL 17 temporal; sin URL/clave Supabase | PASS |
| Rol escritor sin LOGIN, SUPERUSER o BYPASSRLS | PASS |
| `USAGE` privado e `INSERT` por columna; sin SELECT/UPDATE/DELETE ni otros privilegios | PASS |
| `anon`, `authenticated`, `service_role` sin acceso ni membresía del rol escritor | PASS |
| RLS activado/forzado y **solo política INSERT** | PASS |
| Inserción simple válida y segundo intento rechazado por índice único | PASS |
| Dos conexiones restringidas simultáneas: exactamente una inserta | PASS |
| **Dieciséis conexiones restringidas simultáneas**: una inserta y quince fallan | PASS |
| Rollback del escritor no consume evento | PASS |
| Escritor no puede consultar, actualizar, borrar ni truncar el ledger | PASS |
| La variante `ON CONFLICT ... RETURNING` no sirve para rol sin SELECT | PASS |
| Las restricciones impiden hash inválido y evidencia vencida | PASS |

**CI:** [run #41573681765](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41573681765), 12/12 PASS.

La suite comprueba la transacción concreta con `SET ROLE mg_auth_ledger_writer` desde un superusuario efímero de prueba. No simula claves de API reales ni suplanta credenciales productivas.

## 4. Acceso, alcance y evidencias negativas

Los roles públicos no reciben `USAGE` en el esquema privado. Las tablas están fuera del esquema `public` de PostgreSQL; cuando se ejecute sobre Supabase, **será obligatorio verificar también la configuración de esquemas expuestos de Data API**, no asumir que un nombre privado basta.

V111 todavía **NO**:
1. Aplica SQL ni crea roles/políticas en `MG WEB STUDIO AUTH QA`.
2. Proporciona a V109 una función `consumeEventAtomically` real conectada a servidor con control de errores de commit.
3. Implementa una fuente autoritativa de comprobación de sesión revocada frente a JWT todavía firmado.
4. Prueba la coordinación entre ledger y publicación/miembros/facturación en la **misma transacción** o mecanismo recuperable.
5. Garantiza limpieza automática de tombstones, rotación de HMAC o protección distribuida bajo caídas de workers.
6. Obtiene una revisión independiente humana del [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) ni desbloquea los 32 controles V67.

## 5. Puertas para siguiente fase — V112

1. Revisión de DBA sobre el **diseño V110+V111**, especialmente el rol escritor y la política `FOR INSERT`; confirmar ausencia de exposición por Data API y grants reales.
2. Obtener **autorización específica del propietario** antes de ejecutar DDL SQL en el Supabase QA. `continuemos` no es aprobación de un cambio privilegiado real.
3. Solo tras aprobación: respaldo/inventario del laboratorio, aplicación del DDL revisado, inspección real de permisos por 4 roles, pruebas paralelas en QA con clave ficticia y cleanup, y advisors de seguridad. No usar usuarios ni MFA real otra vez por inercia.
4. Probar el adaptador de backend con SQL parametrizado, excepción `23505`, validación autoritativa de sesión, transacción de efecto comercial e idempotencia.
5. Firmar revisión independiente y recién entonces valorar controles V67; no fusionar ni publicar hasta completarlos.

**Estado:** V111 **12/12 PG17 CI PASS**, **Supabase QA sin DDL aplicado**, PR #7 draft, V67 **32 PENDING / 0 PASS**, producción **NO_GO**.
