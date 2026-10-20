# MG WEB STUDIO CLOUD — V54 | Revisión de defaults ACL y trazabilidad

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Proyecto inspeccionado:** MG WEB STUDIO CLOUD - STAGING · `yefcgjtovfnsqtdjdsod` · PostgreSQL 17.11.0.003  
**Estado:** análisis de solo lectura; ningún ACL se modificó.

## Hallazgos confirmados

La consulta a `pg_default_acl` devolvió seis entradas en el esquema `public`: tablas, secuencias y funciones para creadores `postgres` y `supabase_admin`. Sus ACL explícitos incluyen `anon`, `authenticated` y `service_role`. Se conservaron sin cambios las entradas de `storage`, `graphql`, `graphql_public`, `realtime`, `auth` y `extensions`.

La sesión disponible ejecuta como `postgres`, que no es superusuario. `pg_has_role(postgres, supabase_admin, MEMBER)` devolvió false. No se tiene una ruta aprobada para cambiar los defaults pertenecientes a `supabase_admin`; no se intentó conceder membresía ni elevar privilegios.

PostgreSQL 17 establece que los defaults por esquema se suman a los globales: un REVOKE por esquema no elimina un privilegio concedido globalmente. En particular, EXECUTE se concede normalmente a PUBLIC para funciones nuevas. Retirar ese permiso exige un cambio global para el rol creador, con efecto en todos los esquemas donde ese rol cree funciones, o revocaciones específicas por función. Por eso el arreglo de funciones queda separado y bloqueado para revisión de impacto. [Documentación PostgreSQL 17: ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

## Propuesta de alcance para la próxima puerta

1. Preflight en STAGING de usuario efectivo, membresías, seis entradas de `public` y privilegios desglosados por ACL.
2. Si se autoriza y la capacidad del rol lo permite, retirar futuros grants explícitos de `anon` y `authenticated` sobre TABLES y SEQUENCES creadas en `public` por `postgres`. Mantener la concesión actual de `service_role` solo si sigue aprobada.
3. No modificar defaults de `supabase_admin` con la sesión actual; definir un camino privilegiado soportado primero.
4. Resolver funciones por separado: no considerar suficiente un REVOKE por esquema para PUBLIC. Hasta aprobar la estrategia, no añadir funciones a `public`; usar revocaciones por objeto revisadas o una decisión global con análisis de impacto.
5. Después de cualquier cambio autorizado, comprobar `pg_default_acl` y crear objetos temporales de prueba en una transacción para confirmar los privilegios efectivos. Ese test requerirá autorización de DDL.
6. No tocar los ACL de objetos existentes V45; defaults solo aplican a objetos futuros.

El archivo `staging/v54-default-acl-remediation.review.sql.txt` contiene el candidato comentado. Todas las líneas DDL están comentadas y no se deben registrar como migración ni ejecutar.

## Trazabilidad V45 y V53

- Se volvió a leer la fuente V45 en la rama; su blob sigue siendo `135ff2c25d935d87e5c8e9e0f9189705cd40b411`, igual al hash informado al aplicar.
- Supabase registra V45 `20261020181753` y V53 `20261020183045`.
- V53 ya tiene su fuente en `supabase/migrations/`; V45 sigue en `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt` y no se creó copia canónica. No se rebasó, sincronizó ni desplegó.
- La conciliación requiere decidir cómo incorporar V45 al historial del repositorio sin ejecutarla de nuevo en STAGING ni en otro proyecto.

## Puertas pendientes

Defaults ACL en `public`, autoridad para modificar defaults de `supabase_admin`, función pública/PUBLIC EXECUTE, reconciliación canónica V45, backend/Auth/PostgREST, EXPLAIN e índices, y prueba real de backup/restore siguen abiertos. Producción y publicación siguen **NO GO**.
