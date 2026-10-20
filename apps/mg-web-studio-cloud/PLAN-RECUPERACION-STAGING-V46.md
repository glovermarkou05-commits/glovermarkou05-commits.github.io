# MG WEB STUDIO CLOUD — V46 | Recuperación y autorización antes de instalar PostgreSQL

**Fecha:** 20 de octubre de 2026  
**Alcance:** solo `MG WEB STUDIO CLOUD - STAGING`, sin aplicar cambios.  
**Estado:** **PROPUESTA DE RECUPERACIÓN NO APROBADA — SQL NO AUTORIZADO**.

## Evidencia efectiva

Una nueva consulta `SELECT` a `pg_catalog.pg_namespace` confirmó que el esquema `public` pertenece a **`pg_database_owner`**; `mg_private` aún no existe. Los roles `anon` y `authenticated` disponen de **USAGE** sobre `public`, no **CREATE**. Esto no da acceso a cualquier tabla por sí solo. El ejecutor observado en V44 fue `postgres`, lo que **no significa que sea el propietario del esquema**; `pg_database_owner` es un rol especial cuyo titular efectivo depende de la base. En V44 se habían observado seis reglas de default ACL en `public`: tres para `postgres` y tres para `supabase_admin`, pero la nueva consulta no cambió ninguna.

Metadatos de plataforma verificados: proyecto `ACTIVE_HEALTHY` en `sa-east-1`, **cero tablas en `public` y cero migraciones**. No se ha probado que todos los esquemas estén vacíos. No hay datos de clientes importados al sistema MG ni tablas MG creadas.

## Decisión de recuperación recomendada para STAGING Free

Para **la primera instalación, con datos sintéticos exclusivamente**, la estrategia menos compleja es una **reconstrucción reproducible de los objetos de MG en un destino aislado y autorizado**, además de conservar el SQL aprobado y un inventario previo. No supone eliminar/recrear automáticamente el proyecto Supabase ni alterar `auth`/`storage`. Si ya se guarda cualquier información de valor, se necesita un respaldo lógico verificado **antes** de volver a migrar.

Se propone lo siguiente, **pendiente de tu aprobación y de una prueba real**:

1. **Línea base:** verificar nuevamente el proyecto, propietario, esquemas, permisos, tablas, migraciones y costos. Guardar solo el inventario mínimo sin contraseñas ni datos personales.
2. **Código congelado:** fijar el blob Git de `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt` (`135ff2c25d935d87e5c8e9e0f9189705cd40b411`) como *candidato de revisión*, no como autorización para ejecutarlo.
3. **Plan sin datos reales:** utilizar exclusivamente organizaciones y cuentas de ensayo ficticias. Prohibido importar datos de producción o inventar clientes.
4. **Fallo antes de COMMIT:** una ejecución transaccional correcta debería revertir por completo la instalación si falla una sentencia antes de confirmar. Se comprobará en PostgreSQL y no se presumirá a partir de pruebas estáticas.
5. **Fallo después de COMMIT:** **no existe rollback automático**. Preparar y ensayar una migración inversa específica o recuperación en otro entorno aislado antes de modificar un STAGING con datos de valor. No autorizar `DROP CASCADE` ni borrado del proyecto por defecto.
6. **Respaldo lógico:** cuando existan datos ficticios, usar la CLI oficial `supabase db dump` de una versión verificada, en un equipo privado con permisos restringidos. Conservar fuera de GitHub, con cifrado y hash, esquema y datos conforme a sus opciones oficiales; los secretos se mantendrán fuera de cualquier archivo compartido. Los dumps predeterminados **excluyen** esquemas administrados (como `auth` y `storage`), por lo que NO son copia completa del proyecto, ni incluyen archivos binarios de Storage.
7. **Restauración de prueba:** únicamente en un destino separado aprobado, verificando cantidad de objetos, integridad y acceso de `anon`, `authenticated`, `service_role` y dos tenants ficticios. Revisar permisos efectivos tras restaurar, porque un esquema en otra base puede heredar defaults distintos.
8. **Custodia:** titular responsable, retención, RPO y RTO todavía **sin definir**; deben acordarse antes de decir que el plan está aprobado. Ningún procedimiento propuesto demuestra una restauración hasta ejecutarla y verificarla.

**Plan Free:** no da por supuestas copias automáticas diarias. Documentación: [Backups](https://supabase.com/docs/guides/platform/backups), [CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump).

## Condiciones de parada antes de instalar

Se **suspende** la aplicación del SQL si faltan: destino exacto; autorización del usuario sobre la versión revisada; recuperación y responsables aprobados; revisión de sintaxis PostgreSQL; prueba de grants/RLS; confirmación de que `mg_private` no existe y `public` no contiene objetos inesperados; previsión de costes sin complementos pagos; garantías de no intervención en otros proyectos. En ningún caso el archivo de revisión pasa a ser una migración por cambiar su extensión manualmente.

**Qué sí se logró en V46:** confirmar el propietario del esquema `public`, revisar restricciones del Free, fijar el candidato SQL y proponer pasos verificables.  
**Qué NO se logró:** backup real, restauración, parsing PostgreSQL real, test de roles/MFA, aplicación de tablas, despliegue o aprobación final.

## Aprobaciones todavía separadas

**A.** Revisión documental y diagnóstico de solo lectura: realizados.  
**B.** Procedimiento y responsable de restauración: **no aprobados**.  
**C.** Ensayo PostgreSQL con SQL DDL en destino autorizado: **no aprobado**.  
**D.** Instalación de las 16 tablas V45 en STAGING: **no aprobada**.  
**E.** Backend/producción, pagos y proveedores externos: **no aprobados**.

Una autorización futura debe identificar por escrito su **alcance**, proyecto correcto y **blob concreto**. La aprobación de uno de los puntos no concede autorización implícita para los demás.
