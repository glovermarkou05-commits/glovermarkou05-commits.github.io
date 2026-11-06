# MG WEB STUDIO CLOUD — V94A | Preflight documental de REC-03, sin ejecución

**Corte:** 01/11/2026 (Ecuador)  
**Proyecto:** MG Web Studio Cloud  
**Rama de preparación:** `docs/mg-web-studio-v94-preflight-20261101` (derivada de `feature/mg-digital-v5-web-services`)  
**Clasificación:** PREPARADO PARA REVISIÓN / BLOQUEADO PARA PG17, SQL Y RESTAURACIÓN / V67 NO_GO.

## 1. Objeto y límites

Preparar el único ensayo realmente faltante para `REC-02`/`REC-03`: comprobar una recuperación PostgreSQL 17 **con el esquema MG completo** y después ejecutar la batería pgTAP V53 sobre una **copia restaurada con datos ficticios**. V90 solo demostró recuperación de un fixture pequeño (`mg_v86.records`, cuatro filas). La V53 histórica pasó 56/56 en STAGING; **no** en una base recuperada.

Esta fase es **exclusivamente documental y de consulta**. Este archivo y su manifiesto no incluyen comandos de migración, credenciales, instrucciones de conexión, jobs de ejecución, aprobación de SQL ni acto de publicación. **No habilitar** PostgreSQL, red, SQL, `pg_dump`, `pg_restore`, Supabase Auth, STAGING, producción, BAZAR-ONLINE ni proyectos adyacentes con esta autorización. No registrar PASS ni firmas independientes ficticias.

## 2. Proveniencia verificada (reutilizar, no reejecutar)

| Fuente | Estado real | Implicación para REC-03 |
| --- | --- | --- |
| `docs/V93-RUTA-CRITICA-REVISION-Y-BLOQUEOS.md` | V67: 32 PENDING, 0 PASS; ocho bloques | Ninguna aceptación de producción. |
| `docs/V93-RESULTADO-PAQUETE-REVISION-INDEPENDIENTE.md` | V93: 85/85 pruebas offline y revisión humana NO realizada | Éxito del job no sustituye a revisor. |
| `docs/V57-TRAZABILIDAD-V45.md` | SQL V45 trazado y aplicado históricamente en STAGING | El fichero tiene encabezado de borrador y **no es migración canónica para recuperación**. |
| `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt` | 16 `CREATE TABLE`: 12 public, cuatro privadas | Material de revisión, **no ejecutar ciegamente** ni reaplicar en STAGING. |
| `supabase/migrations/20261020183045_mg_web_studio_v53_enable_pgtap_staging.sql` | pgTAP habilitado históricamente solo en STAGING | Instalación/extensión de sandbox necesita estrategia de compatibilidad explícita. |
| `supabase/migrations/20261020191612_mg_web_studio_v54_postgres_public_table_sequence_defaults.sql` | Defaults del rol postgres/public en STAGING | No cubre defaults de funciones y de supabase_admin; revisar aparte. |
| `tests/v53-rls-runtime.test.sql` | 56 aserciones; transacción y ROLLBACK | Requiere auth.users, authenticated, service_role, mg_private, extensions.pgtap y esquema MG completo. |
| `docs/V90-EVIDENCIAS-PG17-BACKUP-RESTORE-SINTETICO.md` | Dos PG17 efímeros con fixture V86 reducido | No satisface por sí mismo REC-02 ni REC-03. |

## 3. Matriz de dependencias de esquema

Antes de diseñar una ejecución se debe conseguir y verificar una **fuente canónica no ambigua** del estado MG V45+V54: hash de cada pieza, orden y dependencias de roles/esquemas/extensiones. No asumir que `schema_core.review.sql` + `modelo-contenido-compartido.review.sql` reconstruyen V45: son borradores de épocas diferentes y presentan posibles solapamientos. El manifiesto JSON adjunto enumera las 16 tablas del fichero V45 (12 public y cuatro en mg_private).

Revisar y cerrar, sin ejecución por ahora:

1. Inventario exacto de tablas, índices, claves foráneas, `RLS`, policies, grants, funciones `SECURITY DEFINER` y dependencias por rol.
2. Disponibilidad de `auth.users` con el subconjunto de columnas requerido por V53, y roles `authenticated`, `anon`, `service_role` en un **entorno aislado de prueba**, sin replicar cuentas reales.
3. Extensión `pgtap` en `extensions`, `pgcrypto` y otras dependencias relevantes, contrastadas con la versión y los permisos correctos de PostgreSQL 17.
4. Aplicación ordenada únicamente de DDL que resulte revisado como canónico; bloquear piezas de borrador incompatibles. No agregar ni copiar secretos, dumps de STAGING, variables reales o datos de clientes.
5. Ensayo futuro: PG17 origen desechable ⇒ respaldo ⇒ destino PG17 distinto y desechable ⇒ suite V53 en transacción reversible ⇒ comparación de objetos y ACL ⇒ limpieza comprobada.
6. Evidencia futura: hash SHA, versión exacta, recuento de tablas/objetos/roles, 56 aserciones o suite formalmente actualizada, ausencia de residuos, fallos y autorizaciones. Mantener salida sin PII.
7. Revisor independiente designado por el propietario antes de cualquier signoff; conservar `docs/V67-EVIDENCIAS-PENDIENTES.json` sin alteración hasta aprobación formal.

## 4. Gates para iniciar V94B (NO satisfechos por este documento)

| Gate | Requisito | Estado |
| --- | --- | --- |
| G1 | SQL/DDL canónico y orden, hashing y revisión técnica de compatibilidad | PENDING |
| G2 | Roles, auth, pgTAP y esquema MG completos reproducibles **sin STAGING real** | PENDING |
| G3 | Fixtures 100 % sintéticos y borrado/rollback auditable | PENDING |
| G4 | Aprobación explícita distinta para crear y usar dos PG17 temporales, SQL, dump/restore y pgTAP en laboratorio | NOT AUTHORIZED |
| G5 | Límites de runner, firewall, redes y sin credenciales externas | PENDING |
| G6 | Revisor independiente y mecanismo de custodia de evidencias autorizado | UNASSIGNED |
| G7 | V67: 32 controles aceptados formalmente antes de publicación | NO_GO |

**Decisión:** fase V94A documental preparada. V94B (ejecución real) bloqueada hasta permisos y compatibilidad. No se realizaron pruebas nuevas, restauraciones ni SQL; no se modifica la rama `main` ni se fusiona la rama de desarrollo.

## 5. Continuidad

- Responsable de coordinación: Plan Maestro MG Digital Solutions en la conversación central.
- La revisión de evidencias de 14 controles con observación de laboratorio puede adelantarse documentalmente por una persona técnica independiente; aquí no se marcan PASS.
- `AUTH-01..03`, `DATA-01..02`, `OBS-01..04`, proxy/TLS y `OPS-02` permanecen bloques separados con autorizaciones propias.
- El siguiente trabajo sin operaciones de riesgo es cerrar inventario canónico y matriz de compatibilidad; luego solicitar autorización específica del laboratorio efímero.
