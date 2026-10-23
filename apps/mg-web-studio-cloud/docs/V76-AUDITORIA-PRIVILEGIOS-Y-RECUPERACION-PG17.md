# MG WEB STUDIO CLOUD — V76 | Auditoría offline PostgreSQL 17, privilegios y recuperación

**Rama:** `feature/mg-digital-v5-web-services`  
**Fecha:** 23/10/2026  
**Alcance:** evaluación estructural de una **fotografía sintética** de privilegios + revisión previa de un laboratorio hipotético de recuperación. **No se conectó PostgreSQL ni se ejecutó SQL, restore, backup, migración, GRANT o REVOKE.**  
**Dictamen:** desarrollo y regresión sintética **PASS**; despliegue, STAGING, PostgreSQL y recuperación real **NO GO**.

## 1. Entregables

1. `server/pg-security-review-v76.cjs`: exporta `reviewPgSecuritySnapshotV76(snapshot)` y `createSyntheticPgSnapshotV76()`. No importa drivers y no recibe `query`; solo revisa una estructura de datos local y devuelve hallazgos de código fijo.
2. `server/pg-recovery-plan-v76.cjs`: exporta `reviewRecoveryPreflightV76(plan)` y `createSyntheticRecoveryPlanV76()`. Solo valida que el plan **no reclame** restauraciones, mediciones RPO/RTO ni aprobaciones inexistentes. No inicia ni restaura ningún servidor.
3. `tests/pg-security-review-v76.test.cjs`: **31 casos nativos** de roles y concesiones, estructura, RLS, acceso público, exposición de columnas, falta de evidencia y sanitización.
4. `tests/pg-recovery-plan-v76.test.cjs`: **16 casos nativos** que exigen objetivo ficticio, sin red ni restauración, y aprobaciones separadas.
5. `.github/workflows/mg-web-studio-v76-pg-security.yml`: ejecuta V76 y las regresiones V70–V75 con Node 22 y el control de red de V70, permisos GitHub `contents: read` y credenciales de checkout no persistentes.
6. `docs/V76-AUDITORIA-PRIVILEGIOS-Y-RECUPERACION-PG17.md`: este informe.

## 2. Política revisada — contrato de mínima exposición

La auditoría de laboratorio espera una fotografía `SYNTHETIC_PG17_CATALOG`, con versión mayor de PostgreSQL **17**, campos obligatorios y cobertura de los recursos especificados. Para una futura revisión real habrá que recopilar datos del catálogo con un operador expresamente autorizado; **no está implementado** un lector del catálogo ni se ha probado esa obtención.

### Rol de consulta de sesión

El perfil conservador de comparación se llama `mg_session_reader` e incluye:

- `LOGIN` sin `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION` ni `BYPASSRLS`.
- Sin `INHERIT` ni membresías adicionales, de modo que una concesión heredada no pueda confundirse con permisos mínimos. El nombre es un **ejemplo de diseño**, no un rol creado en Supabase.
- En `auth.sessions`, acceso `USAGE` sobre el esquema sin `CREATE`; la política de comparación pretende `SELECT` **solo** en `id`, `user_id` y `not_after`, sin `SELECT` sobre toda la tabla ni `SELECT` de columnas ajenas.
- Ninguna concesión pública de lectura sobre `auth.sessions` o su esquema dentro de esta fotografía ideal. Antes de cambiar permisos reales debe estudiarse la configuración administrada de Supabase, la herencia efectiva de `PUBLIC` y la factibilidad de `SELECT` por columnas.
- La revisión V76 **no puede demostrar** que las ACL reales son éstas. La imagen de datos fue inventada para pruebas de esquema. Tampoco prueba que el usuario podría ejecutar efectivamente el `SELECT` V75.

### Modelo multiempresa examinado

El inventario fijo de esta **subauditoría** está limitado a `public.mg_organizations`, `public.mg_sites`, `public.mg_memberships` y `public.mg_membership_site_scopes`. Para la fotografía de ejemplo V76 exige `RLS` habilitado y que el lector dedicado de sesiones no sea propietario de estas tablas, ni tenga concesiones públicas señaladas en la fotografía.

**Activar RLS no demuestra aislamiento:** las políticas pueden ser excesivamente permisivas; propietarios, roles con `BYPASSRLS`, funciones `SECURITY DEFINER`, vistas, privilegios heredados y rutas alternativas podrían saltarse el aislamiento. La revisión real deberá incluir pruebas negativas con **dos empresas ficticias**, dos usuarios, revocación, consulta cruzada, políticas `USING`/`WITH CHECK`, `security_invoker` en vistas y análisis de permisos efectivos. Estas verificaciones no ocurrieron en V76. Tampoco se auditaron todas las tablas del producto; la cobertura real requiere inventario completo y verificación de objetos adicionales.

### Resultado estructural y estado operativo

Una fotografía de ejemplo puede producir:

```json
{
  "evidenceClass": "SYNTHETIC_PG17_CATALOG",
  "structuralChecksPassed": true,
  "realCatalogVerified": false,
  "effectivePrivilegesProven": false,
  "tenantIsolationProven": false,
  "postgresConnected": false,
  "v67OperationalChecksPassed": 0,
  "v67OperationalChecksPending": 32,
  "productionAuthorized": false,
  "decision": "NO_GO"
}
```

Los hallazgos solo contienen **códigos definidos por el programa**, no contraseñas, SQL externo, correos ni valores proporcionados por el usuario. La evaluación está deliberadamente diseñada para que `structuralChecksPassed:true` no pueda convertirse en `GO`.

## 3. Recuperación PostgreSQL 17 — planificación, NO restauración

`createSyntheticRecoveryPlanV76()` genera una propuesta con objetivo `UNBOUND_LOCAL_PG17`, datos `SYNTHETIC_ONLY`, origen `GENERATED_FIXTURE`, red desactivada, restauración aún no realizada, checksum no comprobado, RPO/RTO no medidos y cuatro autorizaciones distintas en `PENDING` (base de datos, red, restauración y producción). La revisión exige definición documental de recursos y rollback.

El informe de esta propuesta conserva, sin excepción:

- `backupRestored:false`
- `backupChecksumVerified:false`
- `pointInTimeRecoveryTested:false`
- `rpoRtoMeasured:false`
- `v67RecoveryChecksPassed:0`, `v67RecoveryChecksPending:4`
- `decision:NO_GO`

El ejemplo de recursos/rollback **es un campo de planificación**, no demuestra que exista capacidad de almacenamiento, política de retención, respaldo válido, recuperación de WAL/PITR o tiempos reales de recuperación.

Antes de un ensayo de PostgreSQL 17 en un laboratorio **físico o contenedorizado** debe aprobarse explícitamente la ubicación del destino, recursos, identidad de operador, datos ficticios, política de red, procedimiento de rollback, aislamiento, controles de borrado y criterios verificables de éxito. Hasta entonces, no crear una nueva base, restaurar una copia ni aplicar SQL.

## 4. Verificación en Node.js con GitHub Actions

**Evidencia primaria:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39979491888

**Run ID:** `39979491888` · **Job ID:** `120502716029` · **Commit probado:** `a71f7a411ce9f50854736d22fab1ce231348ca4c`. GitHub concluyó `completed / success` el 23/10/2026 con **Node.js v22.23.3**.

| Suite | Pruebas | Correctas | Fallos |
| --- | ---: | ---: | ---: |
| **V76**: inspección sintética de privilegios y preflight de recuperación | **47** | **47** | **0** |
| V75: lector `auth.sessions` inyectado | 38 | 38 | 0 |
| V74: JWKS y contratos de sesión | 39 | 39 | 0 |
| V73: plazos y límites de proveedores | 34 | 34 | 0 |
| V72: rotación de claves y revocación simuladas | 28 | 28 | 0 |
| V71: JWT criptográfico con claves efímeras | 44 | 44 | 0 |
| V70: siete suites nativas del backend HTTP sintético | 92 | 92 | 0 |
| **Total de pruebas ejecutadas** | **322** | **322** | **0** |

El flujo no incluye despliegue. El guard V70 intercepta numerosas APIs de red de Node durante la ejecución de tests; **no equivale a un firewall ni a un sandbox del sistema operativo**. GitHub Actions sí usa red para el checkout y para seleccionar Node antes de las pruebas. Estas pruebas verifican lógica local y contratos, no comportamiento de PostgreSQL ni de una restauración auténtica.

## 5. Controles V67 todavía pendientes

**32 verificaciones operativas siguen PENDING:** HTTP 14, carga/concurrencia 3, observabilidad 4, autenticación 3, datos 2, recuperación 4 y operaciones 2. Ninguna prueba estática V76 pasa automáticamente uno de esos controles.

La auditoría real debe recabar evidencias de **ACL/roles/políticas efectivas**, ejecución de SQL solo lectura autorizada, dos organizaciones ficticias con acceso cruzado denegado, fuente primaria de sesión y revocaciones, pruebas de parser HTTP sobre loopback autorizado, métricas, copias con checksum y restauración verificable. Los resultados de V70–V76 no sustituyen ninguna de estas evidencias.

## 6. Próximo paso — V77 propuesto

Preparar un **paquete de evidencias de PostgreSQL 17 de solo lectura**: diseño de consultas de catálogo seguras, lista de permisos exigidos al operador, procedimientos de validación RLS multiempresa y un plan de autorización para el laboratorio de restauración. Primero revisarlo sin ejecutarlo; cualquier acceso real a Supabase o a una instancia Postgres requerirá autorización separada.

**Condiciones operativas sin cambios:** rama de desarrollo únicamente; sin publicación; sin créditos Lovable; sin conexión, migraciones, cambios de roles, consultas reales, backup o restauración en Supabase/STAGING/producción. **NO GO**.
