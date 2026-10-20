# MG WEB STUDIO CLOUD — Etapa V43 | Diagnóstico de catálogo y autorización SQL separada

**Fecha:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Proyecto:** `MG WEB STUDIO CLOUD - STAGING` (São Paulo, Free).  
**Resultado:** **V43 completada en GitHub; NO GO para ejecutar consultas SQL, migraciones, backend o producción**.

## 1. Objetivo y por qué V43 no ejecutó SQL

En V42 se preparó un DDL unificado de 16 tablas, 16 habilitaciones de RLS y 12 políticas SELECT. Incluye `ALTER DEFAULT PRIVILEGES FOR ROLE postgres`, **pero todavía no hay evidencia de que `postgres` sea el verdadero creador ni de que sus defaults coincidan con lo supuesto**. Tampoco hay un backup/restauración probados o un permiso de aplicar DDL.

Esta etapa crea un diagnóstico **de catálogo**, con siete `SELECT` y transacción `REPEATABLE READ READ ONLY` terminada por `ROLLBACK`. Está diseñado para consultar únicamente metadatos de PostgreSQL, sin datos de clientes ni operaciones de escritura, y **no se ejecutó**. Su eventual uso necesita una autorización específica, separada del permiso para crear tablas.

## 2. Entregables nuevos

| Archivo | Uso | Estado |
|---|---|---|
| `db/v43-drafts/CATALOG_ONLY_SELECT.review.sql.txt` | Siete SELECT de catálogo sobre identidad del ejecutor, owners, defaults, roles, objetos, funciones y tablas de public | No ejecutado |
| `staging/v43-approval-package.review.json` | Versiones concretas de GitHub, autorizaciones independientes, controles abiertos y pruebas pendientes | Sin aprobaciones |
| `staging/v43-preflight.cjs` | Control **sin conexión**: compara SHA-1 de blob de Git y extensión de fuentes, revisa consultas permitidas y niega toda ejecución | PASS documental, NO GO |
| `tests/pre-sql-gates-v43.test.cjs` | Pruebas contra falsificación de permisos, alteración de SQL, funciones con efectos colaterales y pruebas inexistentes | PASS simulado |
| `QA-CATALOGO-Y-AUTORIZACION-V43.md` | Este informe y la decisión que falta | Preparado |

El control de integridad usa el hash real de los archivos **tal como Git los guarda** (`blob SHA-1`); una modificación de contenido invalida el paquete de aprobación. No se publican contraseñas ni claves en GitHub.

### Versiones fijadas para revisión

| Fuente | SHA del blob GitHub |
|---|---|
| V42 DDL unificado | `e1831c28aea9500c3571e2e3b7a4a4bed96dcc19` |
| V43 Catálogo SELECT | `b66d015f5fc21b3b43f36bb046192191f1a67d97` |

Estas huellas permiten saber exactamente qué archivo fue revisado. **No implican que su SQL sea seguro o que PostgreSQL lo haya validado**.

## 3. Qué devolvería el futuro diagnóstico, una vez autorizado

1. Base actual, rol de ejecución y versión real del motor.
2. Propietarios de los esquemas `public` y `mg_private`.
3. Privilegios por defecto `pg_default_acl`, **globales y por esquema**; revisar ambos evita suponer que una revocación por esquema elimina cualquier concesión global.
4. Existencia y privilegios generales de `postgres`, `anon`, `authenticated` y `service_role`.
5. Objetos MG presentes, owners, RLS y permisos.
6. Funciones MG, propietarios, uso de `SECURITY DEFINER` y privilegios EXECUTE.
7. Tablas existentes en `public` para detectar colisiones antes de instalar.

Ninguna consulta obtiene filas de organizaciones, usuarios, facturas o clientes. Los resultados podrían incluir **nombres internos de roles, base y objetos**, por lo que deberían revisarse sin publicarlos íntegramente en el repositorio.

## 4. Dos permisos distintos que no deben confundirse

**Permiso A — SOLO DIAGNÓSTICO:** autorizar exclusivamente el archivo V43 de siete SELECT del catálogo PostgreSQL, dentro de la transacción `READ ONLY` en el STAGING ya creado, sin modificar objetos, usuarios, datos ni configuraciones. **No está concedido todavía**.

**Permiso B — INSTALACIÓN DDL:** autorización futura, separada, del V42 unificado tras revisar sus resultados de catálogo, acordar el propietario/privilegios, asegurar una recuperación probada, confirmar el alcance de cambios y estudiar las pruebas reales de RLS. No podrá inferirse a partir del permiso A. **No está concedido todavía**.

Aun con B, quedan por separado las autorizaciones de despliegue de backend, notificaciones y publicación en producción.

## 5. Seguridad y recuperación que continúan abiertas

- **V41-01:** rol creador y privilegios predeterminados reales de los nuevos objetos — requiere el resultado del diagnóstico y revisión humana.
- **V41-02:** backup/restauración en el plan Free — falta responsable, método, objetivo de recuperación y ensayo aislado; una transacción única no reemplaza el restore posterior al COMMIT.
- **V41-03:** autorización SQL exacta — ahora existen dos archivos inequívocos, pero ambos continúan sin permiso.
- **V41-04:** parser PostgreSQL, roles/MFA/RLS, funciones, concurrencia, grants y aislamiento real — sin pruebas.
- **V41-10:** la inspección de tablas y migraciones es puntual y debe repetirse inmediatamente antes de instalar.

Los demás hallazgos V41 (integridad, outbox, `service_role`, Home publicada, sesión/MFA y custodia) también requieren soluciones/probanzas. **Ningún hallazgo P0 se marca cerrado por V43**.

Supabase confirma en [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) que RLS y GRANT son barreras independientes y que los permisos predeterminados deben inspeccionarse y endurecerse según el proyecto. La documentación de [Database Backups](https://supabase.com/docs/guides/platform/backups) recomienda exportaciones externas periódicas para Free.

## 6. QA ejecutado y evidencia real

Las suites fueron obtenidas desde GitHub y evaluadas con arnés JavaScript en memoria. **No se ejecutó Node en el PC del usuario, ni una sesión PostgreSQL, ni un test RLS real**.

| Suite | Comprobaciones |
|---|---:|
| V43: origen SHA, consultas permitidas y puertas de aprobación | **133/133** |
| V42: SQL unificado y controles contra alteraciones | 38/38 |
| V41: seguridad y recuperación | 146/146 |
| V40: SQL base, permisos y esquemas | 187/187 |
| **Total de la sesión** | **504/504** |

Se validó con cálculo real (JavaScript puro) que el hash Git del SQL V42 y el de V43 **coinciden con los hashes devueltos por GitHub**.

**Verificación de Supabase por metadatos, sin SQL:** `MG WEB STUDIO CLOUD - STAGING` permanece `ACTIVE_HEALTHY`, región `sa-east-1`, con **0 tablas en el esquema `public`** y **0 migraciones registradas** en el momento de la consulta. Esto no confirma que todos los esquemas estén vacíos y no reemplaza el diagnóstico de privilegios del catálogo.

## 7. ¿Cuánto falta para terminar?

El plan maestro V33 mantiene **8 bloques operativos obligatorios**, que siguen sin implementación real: S01 identidad/MFA, S02 PostgreSQL/RLS, D01 transacciones/CAS/idempotencia/outbox, D02 auditoría, D03 worker/notificaciones, R01 recuperación, Q01 QA real y P01 aprobación de producción. La creación del STAGING (G01) sí está hecha; C01–C03 están preparados documentalmente, no instalados.

No se puede derivar una estimación seria de días, créditos o porcentaje global de un conteo de pruebas estáticas. Además, las funciones de dominio, contenidos compartidos, catálogo y publicación requieren su propia validación funcional.

## 8. Siguiente paso solicitado

**Pedir al propietario una única aprobación específica de bajo riesgo: ejecutar solo las siete consultas de catálogo del V43 en el STAGING identificado**, sin otros SQL ni escritura. Revisar el resultado para ajustar el DDL V42 y el plan de permisos antes de plantear un permiso B de instalación.

**Estado final:** **revisión V43 finalizada; datos STAGING intactos; SQL ejecutado: 0; restauración real: 0; migraciones: 0; backend: no desplegado; producción: NO GO.**
