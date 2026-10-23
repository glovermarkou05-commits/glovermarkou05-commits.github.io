# MG WEB STUDIO CLOUD — V78 | Protocolo de autorización de laboratorio PostgreSQL 17

**Fecha:** 23 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Dictamen:** V78 desarrollada y probada con datos sintéticos. **NO GO** para acceso a bases reales, creación de laboratorio, apertura de puertos, cambios SQL, restauración, publicación y producción.

## Propósito

Formalizar la preparación del laboratorio de PostgreSQL 17 que permitirá comprobar, **en una etapa futura y con autorización explícita**, privilegios efectivos, RLS multiempresa, revocación de sesiones y recuperación. La V78 no crea ni habilita infraestructura: solo produce manifiestos de solicitud y un procedimiento manual inmutable. Los **32 controles operativos V67** continúan pendientes.

## Archivos entregados

- `server/pg-lab-authorization-v78.cjs`: `createPgLabAuthorizationRequestV78()` crea la solicitud **no aprobada**. `reviewPgLabAuthorizationRequestV78(input)` verifica únicamente la estructura sintética, sin conferir autorización real.
- `server/pg-lab-runbook-v78.cjs`: `createPgLabRunbookV78()` declara diez pasos humanos y `reviewPgLabRunbookV78(input)` rechaza cualquier estado que no sea `PENDING`. No incluye ejecutor SQL, migraciones ni conexiones.
- `tests/pg-lab-authorization-v78.test.cjs`: **27 pruebas**.
- `tests/pg-lab-runbook-v78.test.cjs`: **18 pruebas**.
- `.github/workflows/mg-web-studio-v78-lab-approval.yml`: CI de solo lectura con precarga de guarda de red V70.
- Este informe técnico y la secuencia de aprobación.

## 1. Seis permisos que deben mantenerse separados

| Permiso | Alcance propuesto | Estado al cierre de V78 |
| --- | --- | --- |
| `database` | Identificar/provisionar laboratorio PG17 descartable | **PENDING** |
| `network` | Definir y autorizar reglas de conectividad, TLS, DNS y puertos | **PENDING** |
| `sqlRead` | Ejecutar consultas de catálogo de solo lectura previamente inspeccionadas | **PENDING** |
| `tenantFixtures` | Crear los datos ficticios de dos organizaciones en un destino expresamente autorizado | **PENDING** |
| `restore` | Restaurar una copia sintética con procedimiento independiente | **PENDING** |
| `production` | Cualquier operación de producción/publicación | **PENDING** |

**Importante:** aunque el usuario apruebe futuras inspecciones de solo lectura, ello no habilita automáticamente accesos a bases, red, escrituras para fixtures, restauración o producción. Cada permiso exige destino, rol, alcance y medidas de rollback concretos; V78 no admite cambiar `PENDING` a `APPROVED` mediante un archivo JSON, una prueba o una respuesta de un servidor.

## 2. Recursos, aislamiento y datos

La solicitud de ejemplo contempla como **requisitos orientativos** para un laboratorio futuro:

- PostgreSQL **17** en destino `UNPROVISIONED_LOCAL_PG17`, todavía **no provisionado**.
- **10 GiB de espacio libre, 4 GiB de memoria y 2 núcleos de CPU**, sujetos a revisión antes de iniciar. **No se midió** el equipo actual ni se verificó la disponibilidad de esos recursos.
- Solo datos `SYNTHETIC_ONLY`, dos organizaciones `ORG_A` y `ORG_B`, identidades y sesiones ficticias.
- Host y operador `UNASSIGNED`; credenciales `NOT_ISSUED`; conexiones abiertas **0**; red `DISABLED`; acceso a producción desactivado.
- Documentos de rollback y eliminación de fixtures en estado `DRAFT_ONLY`; ningún borrado, respaldo o restauración ejecutado.

La aprobación posterior deberá indicar dónde se ejecutará el laboratorio, cómo se aislarán los puertos, capacidad realmente medida y quién conservará las evidencias. **No utilizar datos de clientes reales, bases STAGING ni credenciales privilegiadas en las simulaciones.**

## 3. Procedimiento manual de diez pasos

| Orden | Paso de revisión | Prerrequisito |
| --- | --- | --- |
| PRE_01 | Inventario de destino aislado, recursos medidos, propietario y origen de datos | `database` |
| PRE_02 | Revisión de firewall, DNS/TLS, puertos, timeout y cancelación | `network` |
| PRE_03 | Auditoría de rol de lectura, herencia, GRANT efectivos y políticas RLS | `sqlRead` |
| PRE_04 | Plan de creación de dos organizaciones y usuarios exclusivamente ficticios | `tenantFixtures` |
| RUN_05 | Revisión de las siete consultas de catálogo V77 antes de ejecutarlas | `sqlRead` |
| RUN_06 | Plan de resultados esperados para los 12 casos de aislamiento V77 | `tenantFixtures` |
| RUN_07 | Plan de pruebas de sesión revocada, rol desconocido y acceso cruzado | `tenantFixtures` |
| END_08 | Revisión de rollback y eliminación de datos ficticios | `database` |
| END_09 | Solicitud independiente de prueba de restauración, checksum y RPO/RTO | `restore` |
| END_10 | Conciliación independiente de los 32 controles operativos V67 | `production` |

Los diez pasos siguen en estado **PENDING**, aunque el código que construye la lista haya superado pruebas unitarias. El procedimiento **no ejecuta acciones ni confirma resultados**. Cualquier fallo crítico de permisos, pertenencia de datos, procedencia de evidencias o capacidad de recuperación supondrá detener la operación, registrar el incidente y denegar la promoción.

## 4. Seguridad PostgreSQL que aún requiere evidencia

V77 preparó siete consultas de lectura sobre versión, roles, herencias, privilegios de `auth.sessions`, columnas y RLS, pero **nunca se ejecutaron en un motor PostgreSQL**. La revisión verdadera deberá contrastar las ACL efectivas, `PUBLIC`, propiedad de tablas, políticas `USING`/`WITH CHECK`, funciones `SECURITY DEFINER`, vistas, configuración RLS y contexto SQL realmente utilizado.

La existencia de una sesión en `auth.sessions` no demuestra por sí sola cumplimiento de todos los límites por inactividad o políticas de Auth. La consulta V75 tiene que examinarse contra el esquema y la configuración del laboratorio antes de utilizarla. Referencias oficiales: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [Sesiones de usuario](https://supabase.com/docs/guides/auth/sessions).

Tampoco se ha probado ninguna restauración real de PostgreSQL 17, checksum de backup, recuperación puntual ni mediciones RPO/RTO. Las pruebas de HTTP sobre TCP, carga, observabilidad, autorización real, datos y operaciones de V67 continúan pendientes.

## 5. Evidencia nativa de GitHub Actions

**Ejecución verificada:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39983987364  
**Run ID:** `39983987364` · **Job ID:** `120518277184`  
**Commit probado:** `01f18d72ec37dcea4f1c379358f950ba5c64a4d3`  
**Entorno:** Node.js `v22.23.3`, GitHub-hosted Linux runner  
**Resultado:** `completed / success`

| Suite | Pruebas aprobadas | Fallos |
| --- | ---: | ---: |
| **V78:** autorización y runbook manual | **45** | **0** |
| V77: consultas de evidencia y matriz multiempresa | 38 | 0 |
| V76: seguridad y recuperación sintéticas | 47 | 0 |
| V75: consulta de sesión y JWT | 38 | 0 |
| V74: JWKS y contrato Auth | 39 | 0 |
| V73: límites de proveedores | 34 | 0 |
| V72: rotación y sesiones simuladas | 28 | 0 |
| V71: verificación criptográfica JWT | 44 | 0 |
| V70: siete suites de regresión | 92 | 0 |
| **Total de tests ejecutados** | **405** | **0** |

El número **405** expresa casos de test ejecutados, no controles operativos o garantías independientes. GitHub Actions usa red para obtener el checkout y configurar Node, pero las pruebas se ejecutan bajo la guarda V70 de APIs de red; esto **no equivale a un sandbox de sistema operativo**. No se usaron credenciales ni recursos Supabase, no se ejecutó SQL, no se consumieron créditos Lovable y no se publicó la web.

## 6. Próximo paso responsable

El siguiente hito debe obtener un **laboratorio local PostgreSQL 17 explícitamente autorizado**, o, si aún no hay equipo/espacio suficiente, primero verificar su capacidad y acordar una ubicación aislada. Solo después de confirmar destino, identidad del operador, datos ficticios, permisos diferenciados y política de red se podrá ejecutar un control operacional real y comenzar a descontar los **32 pendientes**.

**Dictamen final:** V78 completada a nivel de preparación y pruebas sintéticas: **405/405 PASS**. Las autorizaciones siguen **PENDING**, los 32 controles V67 siguen **PENDING**, y despliegue/producción permanecen **NO GO**.
