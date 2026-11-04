# MG Web Studio Cloud | V118 — Backend no administrador y sesiones PostgreSQL aisladas

**Fecha de gestión:** 2026-11-03, Ecuador (GitHub Actions registra 2026-11-04 UTC).
**Resultado:** `CI_PG17_NONADMIN_15_PASS` en PostgreSQL 17 descartable.
**Evidencia:** [GitHub Actions #41759192024](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41759192024), job `126342531969`: **15/15 PASS, 0 FAIL**.
**Repositorio:** PR #7 en borrador sobre rama `docs/mg-web-studio-v94-preflight-20261101`.

## 1. Qué se ejecutó realmente

- Se instalaron las propuestas SQL V110 y V111 **exclusivamente** dentro del contenedor PostgreSQL 17 temporal del runner de GitHub Actions, usando los roles de ejemplo `anon`, `authenticated` y `service_role` locales.
- Se creó una cuenta ficticia de conexión `mg_v118_ci_backend` con `LOGIN, NOINHERIT, NOSUPERUSER, NOCREATEROLE, NOBYPASSRLS`. No es una identidad real de Supabase. Una segunda cuenta ficticia sin membresía verificó el rechazo.
- Se otorgó a la primera cuenta membresía del rol `mg_auth_ledger_writer` (V111, `NOLOGIN`) con `ADMIN FALSE, INHERIT FALSE, SET TRUE`. Sin `SET ROLE`, el login no tiene privilegios efectivos sobre el ledger.
- El wrapper `qa/v118-scoped-writer-pool.cjs` confirma `session_user = mg_v118_ci_backend`, cambia el rol y confirma `current_user = mg_auth_ledger_writer`, **antes** de entregar la conexión al adaptador existente V115.
- **La conexión física se descarta al liberarla, también tras éxito**. V115 expone una liberación síncrona y no admite esperar a que termine `RESET ROLE` antes de devolver el cliente al pool. Esta estrategia de aislamiento es segura para el ensayo, pero **no se considera una solución eficiente o aprobada para producción**.
- Se reutilizó el `pg@8.23.1` de test instalado mediante `npm ci` y lockfile con integridad SHA-512. El superusuario `postgres` solo configuró el laboratorio e inspeccionó resultados, **no se utilizó por el adaptador en las operaciones ensayadas**.

## 2. Evidencia por familia de control

| Prueba | Evidencia |
| --- | --- |
| Entorno desechable PG17 | PASS |
| Rol de autenticación sin superusuario, herencia ni BYPASSRLS | PASS |
| Membresía restringida `SET TRUE / INHERIT FALSE / ADMIN FALSE` | PASS |
| Login sin herencia INSERT/SELECT | PASS |
| No puede asumir `postgres` ni roles públicos | PASS |
| `session_user` + `current_user` verificables y conexión descartada | PASS |
| Dos operaciones secuenciales no conservan sesión anterior | PASS |
| Rechazo del duplicado real | PASS |
| Dos solicitudes concurrentes: un commit | PASS |
| Dieciséis conexiones: un commit, 15 denegaciones | PASS |
| Usuario sin membresía rechazado | PASS |
| Resultado falso de `SET ROLE` no engaña al validador | PASS |
| No SELECT, UPDATE ni DELETE del escritor | PASS |
| Entrada inválida no toma conexión del escritor | PASS |
| Sin conexión a Supabase ni elevación a GO | PASS |

## 3. Lo que V118 NO ha resuelto

1. **DBA y seguridad independientes:** pendiente la revisión del modelo de conexión privilegiada y del DDL V110/V111 en las ACL gestionadas por Supabase.
2. **Conectividad backend real:** no hay un principal backend autorizado en `MG WEB STUDIO AUTH QA`; falta TLS verificado, almacenamiento y rotación de credenciales, pool privado, límites de conexiones y pruebas operativas de topología.
3. **Rendimiento del aislamiento:** descartar cada conexión evita contaminación del pool, pero puede ser ineficiente en producción; se requiere una revisión de diseño de pool que no permita conservar roles después de la devolución.
4. **Revocación autoritativa:** V118 no consulta `auth.sessions` ni prueba contra sesión revocada. El `SET ROLE` de SQL tampoco demuestra permiso comercial.
5. **Atomicidad de negocio:** gastar un evento MFA y luego publicar/facturar/agregar miembros todavía no forma una operación idempotente conjunta; riesgo de fallos entre commits.
6. **Cadena de suministro:** la imagen PostgreSQL sigue fijada por etiqueta, no por digest aprobado; revisión de dependencias/SBOM pendiente.
7. **V67 y autorización:** los 32 controles formales siguen `PENDING`; faltan revisión independiente, decisión DBA, verificación Data API y aprobación separada para DDL únicamente en QA. No inferir permisos desde «continuemos».

## 4. Decisión siguiente para acelerar el cierre

Proponer **V119: diseñar y ensayar revocación de sesión, autorización por recurso y recuperación idempotente**, con proveedores simulados / PostgreSQL de CI. Antes de cualquier acceso a `auth.sessions` o aplicación de DDL en el proyecto Auth QA deberán obtenerse revisión DBA/Seguridad y autorización acotada.

**Estado permanente:** PR #7 **DRAFT / NO MERGE**, `MG WEB STUDIO AUTH QA` **NO TOCADO** por V118, producción **NO_GO**, `V67 32 PENDING / 0 PASS`.

Documentación técnica: [PostgreSQL 17 GRANT](https://www.postgresql.org/docs/17/sql-grant.html), [PostgreSQL 17 SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html), [node-postgres pool.release](https://node-postgres.com/apis/pool).
