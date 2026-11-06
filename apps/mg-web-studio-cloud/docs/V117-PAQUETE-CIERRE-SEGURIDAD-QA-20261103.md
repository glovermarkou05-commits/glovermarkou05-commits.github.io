# MG Web Studio Cloud V117 — expediente de seguridad para cierre y siguiente decisión

**Fecha:** 2026-11-03 (Ecuador). **Ámbito:** PR #7, rama docs/mg-web-studio-v94-preflight-20261101.
**Resultado:** revisión automatizada offline y comprobación separada de solo lectura en Supabase QA; **ningún DDL, DML, migración o cambio de configuración ejecutado**. Estado formal **V67 = 32 PENDING / 0 PASS**, **PR #7 draft y producción NO_GO**.

## Evidencia técnica que YA está cerrada

- V107/V108: ciclo Auth TOTP real en proyecto QA específico, limpieza confirmada y siete tablas Auth con cero filas. No repetir.
- V109: contrato de sesión actual / autorización de recurso / consumo único, 21/21 pruebas con proveedores simulados.
- V110: esquema privado y unicidad en PG17 desechable, 13/13.
- V111: escritor NOLOGIN con permiso INSERT solamente, 12/12 en PG17 desechable.
- V112: reversión controlada en PG17 desechable, 11/11.
- V114: manifiesto de tres propuestas SQL fijadas por SHA, 23/23, **no ejecutadas** en Supabase.
- V115: adaptador SQL de pool inyectado, 22/22 offline.
- V116: integración V115 en PG17 17.11 real desechable, **11/11**; dos y dieciséis conexiones competidoras; cortes, rollback, commit de respuesta incierta y rol insert-only. [Ejecución V116](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41582746736).
- V117: validador automatizado de **consistencia de fuentes** y puertas de revisión humana; **no equivale** a una auditoría independiente ni valida el estado de Supabase vivo.

## Estado observado directamente en Supabase QA — 2026-11-03

Consulta de solo lectura con el conector Supabase, sobre el **único** proyecto QA `tbfhiqkivsoeuudlpkgi`, sin recuperar datos de usuarios:
- `get_project`: `ACTIVE_HEALTHY`, `sa-east-1`, PostgreSQL `17.11.0.011`.
- `list_tables` sobre `public` y `mg_auth_ledger`: cero tablas.
- Consultas **SELECT de conteos agregados**, sin filas personales: `auth.users=0`, `auth.sessions=0`, `auth.mfa_factors=0`.
- Catálogo de objetos: `mg_auth_ledger` ausente, rol `mg_auth_ledger_writer` ausente y tabla `mg_auth_ledger.mfa_redemptions` ausente.
- Security advisor: sin avisos reportados, lo cual **no equivale a autorización, aprobación de seguridad o auditoría completa**.

No se ejecutaron operaciones de escritura ni de cambios de permisos, esquema o Data API. El estado de exposición/autoexposición persistido en el Dashboard requiere comprobación separada antes de cualquier DDL.

## Requisitos restantes concretos para salir de NO_GO

1. **DBA + Seguridad independiente:** aprobar/no aprobar explícitamente el DDL V110/V111 y la solución de rol en Supabase. V111 define `mg_auth_ledger_writer NOLOGIN`, mientras V115 exige que `current_user` sea `mg_auth_ledger_writer`. El superusuario de V116 usa `SET ROLE` **solo en el CI desechable**: no es topología válida de producción. DBA debe documentar y probar un principal backend privado, privilegios mínimos, pertenencia y restablecimiento de roles por sesión. **No resolver ampliando permisos de `auth.sessions`, anon, authenticated ni service_role.**
2. **Conexión del backend:** elegir con DBA entre conexión directa persistente y pooler en modo sesión según red IPv4/IPv6; probar aislamiento de sesión, TLS de servidor verificado, límites de pool, credenciales en almacén seguro, rotación y recuperación. La selección de modo transacción no se autoriza mientras dependa de un SET ROLE persistente por sesión. Fuente: [Supabase Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) y [Pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits).
3. **Revocación real:** establecer una vía oficial de lectura autoritativa de sesiones sin exposición indebida de `auth.sessions`. Un JWT firmado/AAL2 no demuestra por sí solo sesión no revocada.
4. **Efecto de negocio:** evitar gasto de comprobante MFA si el commit de publicación, miembros o facturación no está coordinado; diseñar transacción atómica o máquina idempotente recuperable, incluyendo commit con respuesta perdida.
5. **Configuración Supabase QA:** volver a leer visualmente Data API exposed schemas, switch de autoexposición, ACL predeterminadas en `public` y permisos efectivos del esquema privado antes de cambios. No alterar ACL globales por defecto. Fuente: [Supabase Securing your API](https://supabase.com/docs/guides/api/securing-your-api).
6. **Cadena de suministro:** V116 utiliza un `package-lock.json` con dependencias transitivas e integridad SHA-512 y `npm ci`, generado exclusivamente desde registros npm públicos. Mantener **pendientes** el pinning de imágenes por digest, SBOM y la revisión independiente de dependencias productivas.
7. **Propietario y revisor:** autorización explícita separada para DDL **solo** en `MG WEB STUDIO AUTH QA`; plan de rollback/respaldo y revisión de los 32 controles V67, con firmas de persona distinta del autor. Issue #8 abierto.

## Decisión para acelerar

El lockfile se incorporó en V117; el siguiente trabajo técnico sin modificar servicios reales es **ensayar un principal backend de privilegio mínimo con aislamiento de sesión en un laboratorio descartable**. No crear una fase de producción ficticia. El avance final queda condicionado al DBA, la revisión independiente y la autorización específica del propietario.

**Comando local opcional para validar solamente el expediente:**
`node apps/mg-web-studio-cloud/qa/v117-security-handoff.cjs --dry-run`

El script no usa red, claves, base de datos, ni ejecuta SQL. La salida NO_GO y las puertas de revisión nunca representan GO automático.
