# MG Web Studio Cloud — V104 | Inspección real, solo lectura, de Auth y permisos

**Fecha:** 2 de noviembre de 2026 (Ecuador).  
**Entorno:** exclusivamente `MG WEB STUDIO AUTH QA` (proyecto nuevo, independiente, ya autorizado para su creación). **No se almacenan IDs, hosts, secretos ni credenciales en este expediente.**  
**Alcance ejecutado:** inventario de esquemas, columnas y claves foráneas; permisos del catálogo `pg_catalog`; avisos de seguridad; migraciones de aplicación. **Ningún SELECT sobre filas `auth.users`, `auth.sessions`, factores, códigos OTP o tokens.**

## Resultado comprobado

| Elemento | Evidencia |
| --- | --- |
| Proyecto | `ACTIVE_HEALTHY`, región `sa-east-1`; PostgreSQL `17.11.0.011` |
| Tablas en `auth` | **27** |
| Tablas en `public` | **0** |
| Migraciones de aplicación registradas | **0** |
| Avisos de seguridad reportados por el Advisor | **0** (no equivale a auditoría completa) |
| Filas estimadas/informadas por inventario en `auth.users` y tablas MFA | **0**; no se leyeron registros |
| Cambios en permisos, SQL de escritura, identidades, MFA, proyectos antiguos | **Ninguno** |

## Estructura MFA verificada en el esquema real del laboratorio

- `auth.sessions`: `id`, `user_id`, `factor_id`, `aal`, `not_after`, `refreshed_at`, `oauth_client_id` y otras columnas. La existencia de estos atributos no acredita revocación de una sesión hasta verificar su operación y las políticas del servicio.
- `auth.mfa_factors`: `id`, `user_id`, `factor_type`, `status`, `last_challenged_at` y columnas de secreto reservadas. **No se consultó su contenido.**
- `auth.mfa_challenges`: `id`, `factor_id`, `created_at`, `verified_at` y otros campos internos; **NO contiene `session_id`**. Tiene FK de `factor_id` a `auth.mfa_factors`.
- `auth.mfa_amr_claims`: `session_id`, `authentication_method`, `created_at`, `updated_at`, `id`; FK `session_id` → `auth.sessions`.
- `auth.users`: `id`, metadatos y campos protegidos propios del servicio. **No se inspeccionaron filas ni contraseñas**.

Esto confirma, en la versión administrada realmente creada, la diferencia entre una reclamación AMR asociada a una sesión y un desafío MFA asociado a un factor. **No existe un vínculo directo `mfa_challenges.session_id`**, tal como anticipó V101. La correlación V102 debe demostrarse por el flujo autorizado de Auth y la sesión renovada, no por un JOIN inventado.

## Seguridad efectiva — privilegios directos en las tablas focalizadas

Se ejecutó **una sola sentencia SELECT de catálogo** sobre `pg_catalog.pg_class`, `pg_catalog.pg_namespace`, `pg_catalog.pg_roles` y funciones `has_schema_privilege` / `has_table_privilege`. **No se consultaron datos de negocio o identidad**.

**Roles examinados:** `anon`, `authenticated`, `service_role`.  
**Tablas examinadas:** `auth.users`, `auth.sessions`, `auth.mfa_factors`, `auth.mfa_challenges`, `auth.mfa_amr_claims`, `auth.oauth_clients` y `auth.webauthn_credentials`.  
**Resultado 21 de 21 combinaciones rol/tabla**:

- `USAGE` del esquema `auth`: **true** para los 3 roles.
- Permisos directos de tabla **SELECT, INSERT, UPDATE y DELETE: false** en las 21 combinaciones. En particular, **`service_role` NO tiene SELECT directo** sobre `auth.sessions` ni `auth.mfa_amr_claims` en el laboratorio.
- `relrowsecurity` activo en las primeras 5 tablas indicadas; **desactivado** en `oauth_clients` y `webauthn_credentials`. Esto **no demuestra exposición pública**, porque esos roles no poseen los permisos de tabla. No alterar RLS de tablas internas administradas.

**Implicación:** una implementación V98–V102 que intente consultar directamente tablas internas desde `service_role` **no está autorizada ni sustentada por los permisos verificados**. No conceder `SELECT`, no añadir `SECURITY DEFINER`, no divulgar secretos. Hay que diseñar un mecanismo de verificación de sesión/MFA utilizando interfaces soportadas y una frontera backend revisada por seguridad.

## Límite de esta inspección

La ausencia de avisos de seguridad de Supabase no implica que el proyecto esté certificado. Tampoco se ha demostrado que `auth.mfa_amr_claims.updated_at` refleje realmente un desafío de MFA recién confirmado en el flujo concreto del proveedor, ni que la renovación JWT conserve `session_id` bajo todas las variantes. Para ello se requiere una prueba de Auth con identidades ficticias expresamente autorizada.

La lectura fue acotada al laboratorio nuevo; **no se accedió a STAGING inactivo, FINZY, BAZAR-ONLINE, Ventry o MG CLUB+**. No se ejecutaron migraciones, se crearon usuarios o se reintentaron los 100 tests V102 ya aprobados.

## Riesgos y siguientes decisiones

1. **G104-A — revisión del mecanismo de acceso:** seleccionar un camino oficial de Auth para verificar sesión actual, revocación y MFA sin conceder permisos `auth` a roles públicos ni asumir `service_role` como superusuario de esquema.
2. **G104-B — prueba MFA autorizada:** crear cuentas sintéticas nuevas **solo tras autorización separada**, aprobar enrolamiento, desafío y verificación TOTP, registrar la relación sesión/usuario y probar logout/revocación. No usar usuarios reales, SMS productivos ni correos ajenos.
3. **G104-C — repetición distribuida:** resolver consumo único entre workers para V102 antes de cualquier uso de producción.
4. **G104-D — revisor independiente:** asignar una persona distinta del implementador en [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8); revisar Auth, ACL, evidencia MFA y emitir acta real.

**Estado:** V104 inspección de catálogo y permisos **COMPLETADA**, proveedor Auth real **AÚN SIN ENSAYO**, **V67 32 PENDING / 0 PASS**, PR #7 borrador y producción `NO_GO`.
