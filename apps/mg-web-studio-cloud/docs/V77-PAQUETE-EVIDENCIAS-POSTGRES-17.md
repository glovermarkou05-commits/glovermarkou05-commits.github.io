# MG WEB STUDIO CLOUD — V77 | Paquete de evidencias PostgreSQL 17, sin conexión

**Fecha:** 23/10/2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** **V77 COMPLETADA EN DESARROLLO Y PRUEBAS NATIVAS SIMULADAS**. **NO GO** para PostgreSQL real, Supabase, recuperación de backups y producción.

## Alcance

Se prepararon **siete consultas de catálogo PostgreSQL de solo lectura** y una **matriz fija de 12 escenarios de aislamiento y privilegios**. Los archivos son plantillas y controles de validación; **no hay cliente PostgreSQL, conexión, ejecución SQL, uso de credenciales ni restauraciones**. Ninguna de las 360 pruebas realizadas equivale a demostrar una ACL efectiva, una política RLS real o una recuperación de datos.

### Archivos incorporados

- `server/pg-catalog-evidence-v77.cjs`: expone `createPgCatalogEvidenceV77()` y `reviewCatalogEvidenceEnvelopeV77()`. El primer método devuelve consultas fijas, sus parámetros acotados y metadatos de revisión; el segundo revisa solo un manifiesto **sintético**, sin aceptar que una supuesta respuesta externa transforme el estado en autorización real.
- `server/tenant-evidence-matrix-v77.cjs`: expone `createTenantEvidenceMatrixV77()` y `reviewSyntheticScenarioChecklistV77()`. Las 12 pruebas permanecen **PENDING**. Los métodos no generan peticiones HTTP ni SQL.
- `tests/pg-catalog-evidence-v77.test.cjs`: 22 comprobaciones.
- `tests/tenant-evidence-matrix-v77.test.cjs`: 16 comprobaciones.
- `.github/workflows/mg-web-studio-v77-pg-evidence.yml`: ejecución aislada Node.js V77 + regresiones V70–V76 en GitHub Actions.
- `docs/V77-PAQUETE-EVIDENCIAS-POSTGRES-17.md`: informe y protocolo de revisión.

## Siete consultas preparadas

| ID | Evidencia prevista | Parámetros |
| --- | --- | --- |
| `pg_version` | Versión del servidor PostgreSQL | Ninguno |
| `role_attributes` | Flags del rol propuesto, incl. SUPERUSER y BYPASSRLS | `$1::name`, nombre fijo de rol |
| `role_memberships` | Roles de los que es miembro e herencia indirecta | `$1::name` |
| `session_access` | Privilegios de esquema, tabla y columnas de `auth.sessions` | `$1::name` |
| `session_columns` | Existencia y tipos visibles de `id`, `user_id` y `not_after` | `$1::text[]` |
| `tenant_rls_tables` | RLS habilitado, FORCE RLS, clase de relación y propietario | `$1::text[]`, cuatro tablas |
| `tenant_rls_policies` | Expresiones `USING` y `WITH CHECK` para revisión de políticas | `$1::text[]` |

Las consultas están escritas con `SELECT` y parámetros fijos. **No se permite interpolar SQL desde una solicitud, ejecutar un paquete recibido por correo ni copiar credenciales en el informe.** La lista de tablas revisadas comprende `mg_organizations`, `mg_sites`, `mg_memberships` y `mg_membership_site_scopes`.

### Límites de la evidencia de catálogo

Aunque se ejecutaran las siete consultas después de recibir autorización, **por sí solas no probarían todos los permisos efectivos**. Habría que confirmar ACL de columna y tabla frente a herencia y `PUBLIC`, vistas y funciones (incluidas `SECURITY DEFINER`), rutas de API expuestas, propietario efectivo, política de `search_path`, y que el rol y la sesión utilizados corresponden al operador y a la fuente aprobada. `information_schema` puede filtrar la información visible según los permisos del operador: la ausencia de filas **no demuestra** que un objeto no exista. Las consultas son un punto de partida para recopilación, no una auditoría exhaustiva ni un informe de cumplimiento.

Una conexión de laboratorio requeriría comprobar versión y compatibilidad con el esquema de `auth.sessions` realmente instalado antes de ejecutar estas consultas. Las expresiones SQL aún **no han sido validadas por un motor PostgreSQL real**. La fuente de datos y los resultados deberán ser revisados independientemente; el evaluador sintético nunca convierte sus salidas en `GO`.

## Doce escenarios pendientes del laboratorio multiempresa

| Caso | Actor / destino | Resultado previsto |
| --- | --- | --- |
| TENANT_01 | Usuario de empresa A, sitio propio y alcance vigente | Permitir según permisos |
| TENANT_02 | Usuario A intenta leer sitio B | Denegar |
| TENANT_03 | Usuario B intenta leer sitio A | Denegar |
| TENANT_04 | Anónimo intenta leer sitio A | Denegar |
| TENANT_05 | Membresía revocada de A | Denegar |
| TENANT_06 | Alcance de sitio eliminado para A | Denegar |
| TENANT_07 | Usuario A intenta enumerar sitios B | Denegar |
| TENANT_08 | JWT firmado pero sesión revocada | Denegar |
| RLS_09 | Rol anónimo intenta leer `auth.sessions` | Denegar |
| RLS_10 | Rol lector específico de sesiones | Solo columnas autorizadas |
| RLS_11 | Lector de sesiones intenta leer `auth.refresh_tokens` | Denegar |
| RLS_12 | Contexto SQL de empresa A intenta acceder a filas de B | Denegar |

Los 12 escenarios están en estado **PENDING**, sin sesiones reales creadas, sin solicitudes enviadas ni consultas ejecutadas. Los resultados «Permitir/Denegar» son **expectativas** para el ensayo futuro, no evidencias logradas.

## Evidencia de GitHub Actions

**URL:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39982254359  
**Run ID:** `39982254359`  
**Job ID:** `120512273247`  
**Commit probado:** `6daf2d3523783412a770370a2e9f326ed040430d`  
**Node.js:** `v22.23.3`, runner Linux  
**Resultado:** `completed / success`

| Batería | Correctas | Fallos |
| --- | ---: | ---: |
| V77: consultas de catálogo y matriz multiempresa | 38 | 0 |
| V76: privilegios simulados y plan de recuperación | 47 | 0 |
| V75: lector `auth.sessions` y JWT original | 38 | 0 |
| V74: contratos de claves/sesiones | 39 | 0 |
| V73: controles de recursos | 34 | 0 |
| V72: rotación y sesión revocada simuladas | 28 | 0 |
| V71: verificación criptográfica JWT | 44 | 0 |
| V70: regresión de siete suites | 92 | 0 |
| **Total de ejecuciones** | **360** | **0** |

Los 360 casos son **ejecuciones de tests**, no 360 controles independientes. Las suites se ejecutaron con la precarga V70 que bloquea APIs Node de red enumeradas, sin cliente o credencial Supabase, y sin publicaciones. El runner GitHub puede utilizar red para checkout y provisión de Node; la protección no es un sandbox de sistema operativo.

## Protocolo de aprobación antes de ejecutar nada

Antes de una auditoría PostgreSQL con datos ficticios se requieren confirmaciones distintas y registradas:

1. **Destino autorizado:** instancia PostgreSQL 17 de laboratorio, con propietario conocido, aislada, datos exclusivamente sintéticos y versión/esquema verificados.
2. **Identidad de operación:** rol de auditor de solo lectura, sin credenciales embebidas en el código, sin permisos de escritura, sin `service_role` público.
3. **Política de red:** origen, destino, firewall, TLS, control DNS, conexión, timeout y cancelación. **No** se habilita red desde la plantilla V77.
4. **Inventario y capturas:** número de tablas, vistas, roles, funciones `SECURITY DEFINER`, RLS efectivo, políticas, historial de migraciones, herencias y privilegios `PUBLIC`. No se debe registrar ningún token ni contraseña.
5. **Dos empresas ficticias:** registrar pruebas permitidas y denegadas mediante contextos SQL y JWT realmente controlados; comprobar qué rol PostgreSQL y claims están activos en cada consulta.
6. **Restauración:** si se desea después, autorización independiente de backup/restauración, capacidad local, integridad, rollback y mediciones RPO/RTO. La V77 no crea, ejecuta ni habilita ninguna restauración.
7. **Dictamen independiente:** comparar evidencia cruda con los criterios V67, conservar incidencias y resultados negativos, y aprobar cada cambio operacional de forma separada.

**Estado de V67:** 32/32 controles operativos **PENDING** (14 HTTP, 3 carga, 4 observabilidad, 3 Auth, 2 datos, 4 recuperación, 2 operaciones). **V77 no marca ninguno como superado**.

## Próxima etapa — V78 propuesta

Consolidar la **checklist de autorización y ejecución del laboratorio**: inventario de recursos, permisos efectivos esperados, aislamiento de las pruebas con dos empresas sintéticas y revisión de los SQL sin ejecutarlos. Después, una autorización explícita podrá habilitar únicamente los pasos aprobados, nunca una conexión automática ni la publicación.

**Dictamen V77:** paquete, matriz y automatización implementados y verificados; **360/360 PASS** en pruebas nativas con datos sintéticos. PostgreSQL real, Supabase/STAGING, restore, HTTP real y producción: **NO GO**.
