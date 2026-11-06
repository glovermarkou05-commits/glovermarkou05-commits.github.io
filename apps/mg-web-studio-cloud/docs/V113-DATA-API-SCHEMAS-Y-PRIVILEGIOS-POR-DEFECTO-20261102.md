# MG WEB STUDIO CLOUD · V113 | Exposición Data API, guardado y privilegios predeterminados

**Entorno:** Supabase exclusivo `MG WEB STUDIO AUTH QA`, referencia `tbfhiqkivsoeuudlpkgi`, región `sa-east-1`.  
**Fecha:** 2026-11-02 (America/Guayaquil; hora técnica del runner puede ser UTC del día 03).  
**Naturaleza:** evidencia de capturas/confirmación del propietario + catálogo PostgreSQL de **solo lectura**. **Sin DDL, ni modificación de roles, privilegios, Auth o configuraciones de otros proyectos.**

## 1. Configuración Data API confirmada por el propietario

En el Dashboard **Integrations > Data API > Settings** el usuario compartió dos capturas donde se observa:

- **Exposed schemas**: `2 of 2 schemas exposed`; seleccionados `graphql_public` y `public`, no `mg_auth_ledger`.
- **Automatically expose new tables**: interruptor visible en estado desactivado, después de que el asistente pidiera su modificación.
- **Exposed tables / functions**: interfaz indica que no existen objetos disponibles en esa vista.
- **Extra search path**: `public`, `extensions`.
- El usuario posteriormente confirmó **«guardado»** al solicitarle pulsar Save.

Esto constituye **evidencia de interfaz y declaración del propietario de que guardó**. Este agente **no tiene un conector para leer directamente el estado persistido del interruptor Data API**; no confundir con auditoría de SQL. No tocar `graphql_public` ni `public` o `Harden Data API` por inercia.

Referencias del producto:
- https://supabase.com/docs/guides/api/using-custom-schemas
- https://supabase.com/docs/guides/api/securing-your-api

## 2. Comprobaciones independientes de solo lectura (Supabase QA)

- `get_project`: `MG WEB STUDIO AUTH QA` = `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.011`.
- `list_tables` de los esquemas `public` y `mg_auth_ledger`: **0 tablas**.
- Conteos de Auth: **0 usuarios, 0 sesiones, 0 factores MFA**.
- `pg_namespace`: `mg_auth_ledger` **no existe**.
- `pg_roles`: `mg_auth_ledger_writer` **no existe**.
- `pg_class`: `mg_auth_ledger.mfa_redemptions` **no existe**.
- `get_advisors(type=security)`: lista de avisos vacía; **no constituye auditoría integral**.

### Hallazgo importante: ACL predeterminadas de `public`

El catálogo `pg_default_acl`, en `public`, muestra **6 entradas**, agrupadas bajo propietarios `postgres` y `supabase_admin`. Las entradas incluyen permisos predeterminados sobre tablas (`r`), secuencias (`S`) y rutinas (`f`) donde se mencionan los roles `anon`, `authenticated` y `service_role`. Por ejemplo, las entradas de tipo tabla bajo `supabase_admin` incluyen derechos amplios de esos roles; las del propietario `postgres` contienen permisos distintos.

La consulta a `has_schema_privilege` confirma que `anon`, `authenticated`, `service_role` tienen **USAGE=true**, **CREATE=false** en el esquema `public`.

**Interpretación estricta:** desactivar **Automatically expose new tables** es un ajuste de configuración Data API, pero no permite concluir que `pg_default_acl` haya quedado vacío o que PostgreSQL ya no podrá otorgar permisos por defecto a objetos creados en `public` bajo determinados roles propietarios. Deben auditarse por separado los grants efectivos, la titularidad que crea cada objeto, RLS, los esquemas publicados y los privilegios predeterminados antes de publicar cualquier nueva tabla en `public`.

**Este hallazgo no exige alterar `public` ahora:** el QA está vacío de tablas de usuario y el ledger MFA se diseñó en `mg_auth_ledger`, que no existe aún ni está listado en Data API. Los privilegios de `public` **no se trasladan automáticamente** a otro esquema privado. **No ejecutar `ALTER DEFAULT PRIVILEGES` global, REVOKE global ni cambios de `public` sin análisis de compatibilidad y autorización adicional.**

## 3. Situación V110 / V111 y controles pendientes

- Las propuestas V110 y V111 permanecen en `apps/mg-web-studio-cloud/proposals/`, no como migraciones de Supabase.
- V110: 13/13 PASS en PostgreSQL17 efímero; ledger UNIQUE y RLS privada.
- V111: 12/12 PASS en PostgreSQL17 efímero; escritor `NOLOGIN`, sólo `INSERT`, sin SELECT, múltiples conexiones.
- V112: 11/11 PASS en PostgreSQL17 efímero; reversión guardada y abortada ante datos o dependencias.
- V113: configuración Data API comprobada visualmente, usuario confirma guardar, y catálogo Supabase de solo lectura auditado con el **hallazgo ACL de public**.

**Sigue pendiente** la revisión humana DBA/Seguridad de acceso a DB y exposiciones `public`, un principal backend real aislado para `NOLOGIN`, análisis de `WITH CHECK(true)`, fuente autoritativa de sesión revocada y coordinación con transacción comercial.

## 4. Próximo paso seguro

1. Anotar G112-04 como **«verificado visualmente y guardado según usuario»**, sujeto a una relectura del Dashboard antes del despliegue. No afirmar acceso directo a la preferencia persistida.
2. Revisar con DBA el diseño privado V110/V111 y este hallazgo de ACL de `public` para decidir si cualquier intervención en `public` sería necesaria. **No ejecutar cambios de ACL sin motivo probado**.
3. Preparar una lista de verificación / paquete de cambio **para Supabase QA únicamente**, sin aplicarlo hasta contar con revisión técnica y autorización **específica** para crear esquema, tabla, rol y política.
4. Mantener [PR #7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) **draft** y la [incidencia de seguridad #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) abierta hasta revisión independiente.
5. No repetir V107 TOTP real sin objetivo específico; QA queda vacío de usuarios/sesiones/factores.

**Resultado V113:** auditoría Data API y permisos predeterminados **documentada**, configuración guardada **según el usuario**, laboratorio sin objetos V110/V111, **SQL no aplicado**, V67 **32 PENDING / 0 PASS**, producción `NO_GO`.
