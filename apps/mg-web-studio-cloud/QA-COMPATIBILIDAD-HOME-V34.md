# MG WEB STUDIO CLOUD — V34 | Compatibilidad Home entre SQL, API y navegación

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Tarea del plan maestro:** `C01` — propuesta técnica, adaptación de datos ficticios y revisión de interfaz.  
**Dictamen:** **PASS en revisión estática y simulación. NO GO para PostgreSQL/staging/producción.**

## 1. Diagnóstico confirmado al revisar los archivos reales

La diferencia descrita en V19 NO requiere ampliar la expresión regular actual para permitir `home`. En `db/schema_core.review.sql`, la tabla `public.mg_pages` usa una regex que **ya acepta `home`** y no acepta `""`. El índice `UNIQUE(site_id,slug)` impide duplicar el mismo slug dentro de un sitio, pero **no exige que exista Home**.

El simulador antiguo V14 usa `slug:""` para Inicio. V20 define correctamente: `slug='home'` persistido y ruta pública `/`, con `/home` denegada como ruta no canónica; el contrato normaliza documentos heredados. Los borradores SQL V1/V13 y V14 no se modificaron deliberadamente para preservar pruebas y diferencias históricas.

**Bloqueo aún abierto:** una base real debe garantizar que un sitio publicado tenga exactamente una Home y que posteriores cambios concurrentes no puedan borrarla ni renombrarla. La verificación de documento JavaScript no sustituye ese control SQL/servidor. El informe V19 seguirá detectando `HOME_SLUG_CONFLICT` mientras las muestras V14 sigan históricas; V34 crea un adaptador, pero no hace una migración.

## 2. Entregables implementados en GitHub

| Archivo | Para qué sirve |
|---|---|
| `shared/mg-home-compat-v34.js` | Adaptador puro de documentos de prueba y URL; `prepareDraft`, `resolvePublicPath`, `inspectCoreSchema`, `inspectStoredRows` y `inspectPublicationDraft` |
| `db/v34-home-publication.review.sql` | **Solo comentarios, todas las líneas inactivas**: estrategia revisable de Home publicada, concurrencia, grants, RLS y rollback, sin DDL ejecutable |
| `revision-home-v34.html` | Vista local de casos Home antiguo/canónico/faltante/duplicado, ruta `/`, ruta `/home` y revisión de condiciones, sin acceso de red ni cambios |
| `laboratorio-contratos-v20.html` | Única modificación al HTML existente: un enlace a la revisión V34 |
| `tests/home-compat-v34.test.cjs` | 161 pruebas estáticas de contratos, esquemas, rutas, seguridad de revisión y duplicados |
| `tests/home-compat-v34-ui.test.cjs` | 35 comprobaciones DOM simuladas de la nueva pantalla, sin navegador real |
| `QA-COMPATIBILIDAD-HOME-V34.md` | Informe presente |

**Alcance real:** el adaptador V34 no hace escrituras de negocio ni ofrece autenticación: todos sus resultados llevan `mayWrite:false`, `mayPublish:false`, `go:false`. `inspectCoreSchema` analiza texto, no ejecuta PostgreSQL ni demuestra semántica RLS.

## 3. Casos cubiertos

| Entrada o escenario | Salida comprobada |
|---|---|
| Documento heredado con una página `slug=""` | En la copia normalizada de revisión se convierte a `home` |
| Documento ya canónico `slug="home"` | Se mantiene `home`, sin segunda Home |
| URL pública `/` | Resuelve el slug `home` |
| URL `/contacto` | Resuelve la página `contacto` |
| URL `/home` | Error `RESERVED_HOME`; nunca se trata como segunda Home |
| Duplicado `""` + `home` | `DUPLICATE_SLUG` |
| Falta de Home en documento de publicación | `MISSING_HOME` |
| Sitio publicado con filas SQL ficticias sin Home | `PUBLISHED_HOME_MISSING` |
| Duplicación de slug de fila persistida | `DUPLICATE_STORED_SLUG` |
| Cruce empresa/sitio al leer filas | `CROSS_TENANT_OR_SITE_ROW` |
| SQL sin índice, FK compuesta, RLS o con acceso anon | Advertencia de estructura incompatible |
| Publicación de sitio suspendido | Bloqueada en el modelo ficticio |
| Bloqueos pendientes del mundo real | Se mantienen `HOME_EXISTENCE_UNPROVEN` y `NO GO` |

La revisión SQL V34 documenta la futura protección contra borrar Home durante o después de la publicación, mediante **controles verificables dentro de una transacción y bloqueos de concurrencia**, sujetos a pruebas con roles y PostgreSQL reales. Es importante que cualquier escritura de páginas respete el mismo mecanismo; un `SELECT FOR UPDATE` solo al publicar no es suficiente si otros escritores pueden saltárselo.

## 4. QA efectivamente ejecutado en esta sesión

Las suites fueron ejecutadas como funciones JavaScript usando los textos descargados desde GitHub y sustitutos de `fs`, `path`, `assert` y DOM; no se ejecutó Node en el PC del usuario, ni SQL, navegador, backend o Supabase.

| Suite ejecutada | Comprobaciones correctas |
|---|---:|
| V34 contratos Home nuevos | **161/161** |
| V34 interfaz DOM nueva | **35/35** |
| V20 contratos anteriores | 114/114 |
| V20 interfaz DOM anterior, tras agregar enlace | 36/36 |
| V21 compatibilidad SQL/API anterior | 25/25 |
| V33 plan maestro, dependencias y NO GO | 146/146 |
| V26 preparación técnica | 91/91 |
| V26 CLI de revisión | 11/11 |
| **Total verificado en la etapa V34** | **619/619** |

La suite V20 UI se interrumpió primero por omisión de `prototipo.html` en el arnés; se repitió con las dependencias necesarias y pasó **36/36**. La primera prueba V34 señaló un nombre de campo distinto para el requisito de transacción de publicación; se normalizó y pasó **161/161**. Ninguno de esos fallos indica un problema probado en PostgreSQL.

No se reejecutó toda la historia V9–V32 y no se sumaron estadísticas históricas como si se hubieran ejecutado ahora.

## 5. Qué NO está solucionado en un servidor real

1. No hay migración aplicada ni datos persistidos en una base exclusiva comprobada. La prueba V34 confirma un esquema **propuesto**, no su existencia real.
2. El control de Home presente en un sitio publicado sigue **sin implementarse en PostgreSQL**: falta un procedimiento/trigger revisado y pruebas de concurrencia, revocación, restores y escrituras directas.
3. Los `GRANT INSERT/UPDATE` sobre `mg_pages` propuestos para `authenticated` requieren revisión para evitar bypass de invariantes desde Data API. RLS por sí sola no valida el mínimo de una Home.
4. El adaptador `prepareDraft` acepta legado de demo; el backend real deberá controlar el origen, evitar duplicados y **no confiar en roles enviados por navegador**.
5. La incompatibilidad de estados de propuesta `STATUS_CONTRACT_MISMATCH` pertenece a `C02` y permanece abierta.
6. No existe autorización para habilitar staging, correr SQL, publicar, activar IA de pago, facturación o cobros.

## 6. Próxima tarea: C02 / V35

Preparar en GitHub **el cambio revisable de estados V13 → V20** (`submitted_for_review` a `submitted`, `applied_to_draft` a `applied`) y todas sus referencias API, auditoría, outbox, notificaciones, exportaciones y rollback **sin ejecutar SQL**. Tras C01 y C02, preparar C03 (migraciones revisables) y considerar las pruebas reales exclusivamente con autorización separada.

## 7. Reproducción local opcional, sin servicios

```powershell
node apps/mg-web-studio-cloud/tests/home-compat-v34.test.cjs
node apps/mg-web-studio-cloud/tests/home-compat-v34-ui.test.cjs
node apps/mg-web-studio-cloud/tests/contracts-v20-ui.test.cjs
```

Todos los cambios se limitaron a la rama `feature/mg-digital-v5-web-services` y a este proyecto. **`main`, Supabase y otros proyectos no se modificaron**. No se consumieron créditos Lovable, no hubo publicaciones, SQL ejecutado ni gastos.
