# MG WEB STUDIO CLOUD — V46 | Cierre de preinstalación de PostgreSQL

**Fecha:** 20 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Dictamen:** **V46 COMPLETADA EN GITHUB; STAGING ACTIVO; SQL REAL Y PRODUCCIÓN NO GO**.

## 1. Verificación en Supabase realizada en V46

Se consultó únicamente el esquema de metadatos PostgreSQL para recuperar la respuesta R02 que no se había conservado en V44. La consulta fue una `SELECT` sobre `pg_catalog.pg_namespace` contra **MG WEB STUDIO CLOUD - STAGING**.

**Datos confirmados:**

| Concepto | Evidencia |
|---|---|
| Propietario de `public` | `pg_database_owner` |
| Presencia de `mg_private` | No aparece; todavía no existe |
| Permiso `USAGE` de `anon` y `authenticated` sobre `public` | Concedido (uso de esquema) |
| Permiso `CREATE` de `anon` y `authenticated` sobre `public` | No concedido |
| Rol de sesión ejecutor en V44 | `postgres`; no confundir con el propietario `pg_database_owner` del esquema |
| ACL por defecto, V44 | 6 registros en `public`, repartidos entre `postgres` y `supabase_admin` |
| Estado del proyecto | `ACTIVE_HEALTHY`, São Paulo (`sa-east-1`) |
| Tablas de `public` en el momento de inspección | 0 |
| Migraciones registradas | 0 |

Este resultado es una foto puntual: **no equivale a certificar que todos los esquemas están vacíos**. El nombre de propietario no demuestra quién creará cada objeto en una migración futura. Tampoco se han leído datos de usuarios ni credenciales.

## 2. Decisión técnica sobre privilegios

Se conserva como **candidato exclusivo de revisión** la versión V45:

`db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt`

**Blob SHA en GitHub:** `135ff2c25d935d87e5c8e9e0f9189705cd40b411`.

- Propone crear **16 tablas**, habilitar RLS para cada una y crear **12 políticas SELECT** dentro de una transacción única.
- Contiene revocaciones para los objetos específicos de MG y concesión expresa y limitada a lectura para usuarios autenticados con RLS. No añade permisos DML para navegadores.
- **No** contiene `ALTER DEFAULT PRIVILEGES` para `postgres` ni `supabase_admin`.
- No permite `published`, workers, pagos ni exposición pública de claves privilegiadas.
- La estructura V45 es **solo SQL activo almacenado como `.sql.txt` para revisión**, no una migración aplicada.

**Riesgo que continúa abierto:** los privilegios automáticos de **futuros** objetos en `public`. La solución de V45 es por objeto, no un cambio global de la configuración Supabase. Cada nueva migración deberá verificar grants, RLS, propietario y defaults. **No ejecutar una revocación de `supabase_admin` de forma indiscriminada**.

Fuentes: [Supabase Securing your API](https://supabase.com/docs/guides/api/securing-your-api) y [PostgreSQL ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

## 3. Plan de recuperación propuesto, no probado

Nuevo documento: `PLAN-RECUPERACION-STAGING-V46.md`.

La recomendación para el primer entorno **sin datos propios y con datos sintéticos exclusivamente** es documentar un procedimiento de reconstrucción de los objetos MG a partir de SQL versionado, ensayado en otro entorno aislado y autorizado. Tras guardar información valiosa, deberá existir un respaldo lógico cifrado fuera del repositorio, una política de retención, responsable, objetivos RPO/RTO y una restauración probada.

Una única transacción reduce el riesgo de instalación parcial si una sentencia falla **antes de COMMIT**; no proporciona recuperación automática de errores **después de confirmar**.

El plan Free **no incluye las copias diarias automáticas de planes superiores**; Supabase recomienda `supabase db dump` más respaldo externo. Sus dumps predeterminados no incluyen los datos de `auth`/`storage` administrados ni respaldan por sí mismos objetos binarios de Storage. Los parámetros CLI deben descubrirse en la versión instalada cuando la restauración sea autorizada; aquí **no** se ha ejecutado ningún dump.

Fuentes oficiales: [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) y [CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump).

## 4. Puertas de autorización registradas

`staging/v46-preinstall-authorization.review.json` documenta nueve puertas de salida:

| Puerta | Estado |
|---|---|
| Propietario de `public` y línea base | **Evidencia real confirmada** |
| Blob exacto V45 y recuentos de DDL | **Verificación documental** |
| Perímetro de permisos por objeto | **Mitigación de diseño; defaults futuros abiertos** |
| Responsable, RPO/RTO y política Free | **Sin aprobación** |
| Copia/reconstrucción o restauración en otro destino | **No probado** |
| Parseo real de V45 en PostgreSQL | **No probado** |
| Permiso del usuario para DDL específico en STAGING | **No autorizado** |
| Prueba real `anon`/`authenticated`, RLS, MFA y dos tenants | **No probado** |
| Backend, workers y producción | **No autorizado** |

No se creó ningún recurso de restauración, no se ejecutó SQL DDL y no se publicó la aplicación.

## 5. QA comprobado

Nueva suite: `tests/preinstall-readiness-v46.test.cjs`.

**72/72 verificaciones estáticas correctas**, ejecutadas sobre los archivos obtenidos desde la rama GitHub, con pruebas adversas contra permisos inventados, ejecución falsamente declarada, propietario equivocado, respaldo presuntamente completado, `published` activado, DDL no autorizado y alteraciones de SQL.

La suite inicial detectó que la comprobación no rechazaba explícitamente la adición de `published`; se corrigió y se repitió la suite satisfactoriamente. Los resultados **no equivalen a un parser PostgreSQL real, pruebas RLS de verdad ni restauración**. El ambiente de trabajo no disponía de herramientas PostgreSQL instaladas para una validación local compatible, por lo que no se afirmó haberla realizado.

## 6. ¿Qué sigue y cuánto falta?

Se mantiene la estimación del plan maestro: **8 grandes bloques obligatorios para una versión operativa**, además de funcionalidades opcionales. La V46 no reduce de forma ficticia esta cifra, ya que el backend todavía no se ha implementado.

**Siguiente acción recomendada:** aprobar una estrategia de recuperación para datos ficticios y una prueba aislada del SQL revisado. Solo con esa aprobación concreta y evidencia de PostgreSQL se podrá considerar aplicar las 16 tablas V45 a este STAGING; será una decisión separada.

**Estado final:** `NO GO` para instalación y producción, cero SQL DDL, cero migraciones, cero pruebas reales de RLS o restauración. `main`, otros proyectos Supabase, Lovable y servicios pagos intactos.
