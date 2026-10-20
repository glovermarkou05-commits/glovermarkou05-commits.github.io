# MG WEB STUDIO CLOUD — V55 | Auditoría de funciones y recuperación

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Proyecto:** MG WEB STUDIO CLOUD - STAGING · `yefcgjtovfnsqtdjdsod` · PostgreSQL 17.11.0.003  
**Estado:** inspección de solo lectura; sin cambios de esquema, backup, restauración, publicación ni gasto de servicios.

## Auditoría de funciones en `public`

La consulta al catálogo devolvió **0 funciones** en `public`: 0 `SECURITY DEFINER`, 0 ejecutables por `anon` y 0 ejecutables por `authenticated`. No existe una función pública de la aplicación para remediar actualmente.

Persiste un riesgo de **creación futura**: los defaults de funciones creadas por `postgres` en `public` incluyen grants explícitos a `anon` y `authenticated`; PostgreSQL además concede EXECUTE a `PUBLIC` por defecto. El cambio por esquema de V54 no retira ese grant global. Antes de crear una función en un esquema expuesto, la migración que la cree debe establecer y verificar sus grants efectivos. Una política global requiere revisar impacto en todos los esquemas del rol creador; queda pendiente.

## Defaults ACL que quedan

| Creador en `public` | TABLES | SEQUENCES | FUNCTIONS |
|---|---|---|---|
| `postgres` | `anon/authenticated` retirados; `service_role` se conserva | `anon/authenticated` retirados; `service_role` se conserva | Sin cambios; grants explícitos a `anon/authenticated/service_role` |
| `supabase_admin` | Sin cambios; incluye `anon/authenticated/service_role` | Sin cambios; incluye `anon/authenticated/service_role` | Sin cambios; incluye `anon/authenticated/service_role` |

La sesión disponible es `postgres`, no superusuario ni miembro de `supabase_admin`; el rol interno `supabase_admin` sí es superusuario. La documentación de Supabase lo identifica como rol interno de administración. No se intentó cambiar de rol, otorgar membresía ni tocar esos defaults. Cualquier tratamiento requiere una vía soportada por Supabase y una revisión de impacto.

## Recuperación: decisión para continuar sin activar servicios pagos

V41 sigue vigente: `RECOVERY_NOT_TESTED`; no se ha generado ni restaurado un respaldo. La herramienta conectada ofrece una operación de restauración, pero no una consulta de inventario de backups; no se llamó porque puede modificar el proyecto. La consola de Supabase permite consultar las copias disponibles sin iniciar una restauración.

Supabase indica que el plan Free debe exportar periódicamente mediante Supabase CLI; las copias diarias administradas son para planes Pro, Team y Enterprise. No se propone activar PITR, subir de plan ni crear otro proyecto. La opción siguiente sin servicio pago es preparar una exportación lógica del STAGING y ensayar la restauración en un PostgreSQL 17 local aislado, si está disponible. Antes de ejecutar: verificar CLI y cliente compatibles, cifrar el archivo fuera de GitHub, confirmar que solo contiene datos sintéticos y aprobar el destino y la prueba. Comparar después esquema, migraciones, extensiones, conteos y pruebas RLS. RPO/RTO continúan sin validar hasta completar ese ensayo.

## Registro de etapas actualizado

| Etapa | Estado |
|---|---|
| V46 | 72/72 comprobaciones estáticas reportadas |
| V47 | 8/8 pruebas locales reportadas |
| V48 | Recuperación documentada; ensayo pendiente |
| V49–V52 | Revisión estática, instalación V45 y auditoría del catálogo documentadas |
| V53 | pgTAP en STAGING; RLS 56/56; fixtures revertidos |
| V54 | Defaults futuros de tablas/secuencias para `postgres/public` mitigados y verificados |
| V55 | Auditoría read-only: no hay funciones en `public`; se documentan defaults pendientes |
| Siguiente | Definir vía soportada para `supabase_admin`, revisar política de funciones nuevas y probar recuperación en destino aislado |
| Producción/publicación | **NO GO** |

## Fuentes oficiales

- [Supabase: Postgres Roles](https://supabase.com/docs/guides/database/postgres/roles) — `supabase_admin` es un rol interno.
- [Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups) — exportación CLI en plan Free; copias administradas diarias en planes pagos.
- [PostgreSQL 17: ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html) — los REVOKE por esquema no eliminan grants globales.

**V55 resultado:** `READ_ONLY_AUDIT_COMPLETE`; SQL/migraciones nuevas: 0; backup/restauraciones: 0; producción: **NO GO**.
