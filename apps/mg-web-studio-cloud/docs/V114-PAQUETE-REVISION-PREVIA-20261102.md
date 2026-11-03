# V114 · Paquete de revisión SQL para MG WEB STUDIO AUTH QA

**Fecha:** 2026-11-02 (Ecuador). **Estado:** preparado, sin instalar. **Destino único:** `MG WEB STUDIO AUTH QA`, proyecto `tbfhiqkivsoeuudlpkgi`. El PR #7 continúa en borrador.

## Archivos verificados por integridad

Las siguientes propuestas están en `apps/mg-web-studio-cloud/proposals/` y NO son migraciones desplegadas:

| Propuesta | Git blob SHA |
| --- | --- |
| V110: `v110-private-mfa-ledger-review-only.sql` | `ca85055caed9c19989c7f3179a8593311affd86f` |
| V111: `v111-insert-only-ledger-writer-review.sql` | `549733a35805296c5588dfca4c6344a704ef2c7c` |
| V112: `v112-rollback-guarded-review-only.sql` | `38491dcd67b345028a18cc9432b297f2f611d9f6` |

El manifiesto `proposals/v114-qa-review-manifest.json` y el validador `qa/v114-review-package.cjs` verifican exactamente esos archivos y el destino. Solo admite la operación **`--dry-run`**, que no conecta a ninguna base ni ejecuta SQL.

[CI GitHub Actions V114](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41578247747): **23/23 PASS**, cero fallos; salida `INTEGRITY_PASS; 3 files pinned; 6 gates PENDING; SQL=NOT_EXECUTED; V67=NO_GO`. La batería comprueba sustitución de proyecto, rama, PR, autorización simulada, archivos alterados y acciones no permitidas. El hash de un archivo no es una firma de revisión humana.

## Preparación del laboratorio

El inventario anterior confirmó QA `ACTIVE_HEALTHY` con PostgreSQL 17.11, cero usuarios/sesiones/factores MFA, y **sin esquema, tabla ni rol del ledger**. La configuración Data API muestra `public` y `graphql_public`; el usuario desactivó exposición automática de tablas y confirmó guardar. El estado persistido del interruptor no está disponible desde la consulta SQL; debe revisarse nuevamente en Dashboard.

Se identificaron seis entradas de concesiones predeterminadas para futuros objetos de `public`; no deben confundirse con permisos del esquema privado `mg_auth_ledger`. No se ejecutó ningún cambio de permisos globales.

## Puertas que siguen pendientes

1. Revisión independiente de seguridad/DBA de diseño de esquema, propiedad, RLS, permisos por defecto de `public` y aislamiento Data API.
2. Identidad real y conexión privada para el rol de escritura, sin entregar secretos al cliente.
3. Autorización explícita del propietario, acotada al DDL V110–V111 **únicamente en Supabase Auth QA**.
4. Plan de respaldo, continuidad, retención y reversión aprobada ante incidentes.
5. Verificación final del Dashboard Data API y ausencia del esquema privado entre los expuestos.
6. Revisión humana separada del autor de los controles MFA y de la integración de revocación/negocio.

## Siguiente decisión

El paquete permite revisar el DDL y verificar su integridad, **no instalarlo**. Solo tras cerrar los puntos anteriores se podrá solicitar aprobación específica de una ejecución controlada en QA, seguida de pruebas reales de permisos y transacciones. El procedimiento de reversión no debe utilizarse con eventos, dependencias o conexiones en curso.

**PR #7: draft. V67: 32 PENDING / 0 PASS. Producción: NO_GO.** No se han modificado FINZY, MG CLUB+, Ventry, BAZAR-ONLINE ni otros proyectos.

Referencias: [Supabase Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [Data API Security](https://supabase.com/docs/guides/api/securing-your-api), [incidencia de seguridad #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8).
