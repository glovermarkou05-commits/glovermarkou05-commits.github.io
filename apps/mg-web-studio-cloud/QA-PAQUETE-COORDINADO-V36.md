# MG WEB STUDIO CLOUD — V36 | Paquete coordinado de cambios reversibles (C03)

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Alcance:** coordinar los diseños de **C01/V34** (Home canónica) y **C02/V35** (estados de propuestas).  
**Dictamen:** **PASS estático; NO GO** para ejecutar SQL, modificar Supabase, staging, publicación, producción, IA de pago o cargos.

## 1. Qué se revisó y evitó duplicar

Se inspeccionaron antes de cambiar archivos:
- Esquemas históricos: `db/schema_core.review.sql`, `db/v13-propuestas-scopes.review.sql` y `db/v13-endurecimiento-rls-legado.review.sql`.
- Contrato previo `db/v20-contratos-propuestos.review.sql`; guías V34 y V35.
- Adaptadores puros `shared/mg-home-compat-v34.js` y `shared/mg-proposal-status-compat-v35.js`.
- Simulador de recuperación en memoria V22, plan maestro V33, y manifiesto V18 (staging no autorizado).

**V36 no creó otro motor de migración ni modificó los contratos previos.** Consolida su orden técnico, dependencias, control documental de seguridad, criterios de reversión y validación automatizada de solo lectura.

### Riesgo detectado en la revisión

El archivo `db/v13-endurecimiento-rls-legado.review.sql` **contiene sentencias SQL activas** (por ejemplo, `begin;` y `revoke insert,update,delete ...`), a pesar de la extensión `.review.sql` y el encabezado «NO EJECUTAR».

V36 lo identifica explícitamente como **fuente histórica potencialmente ejecutable**, pero **no** lo convierte en migración ni lo incluye como script para ejecutar. El validador V36 falla si el manifiesto intenta marcarlo como ejecutable o reclasificarlo como «solo comentarios». También falla si alguno de los cuatro documentos de diseño V20, V34, V35 y V36 incluye una línea SQL activa.

## 2. Entregables V36

| Archivo | Propósito |
|---|---|
| `staging/v36-coordinated-changes.review.json` | Manifest de siete fuentes SQL, dos mapeos de estado, Home `slug='home'`, dependencias y ocho fases futuras, **todas bloqueadas** |
| `db/v36-paq-coordinado.review.sql` | Propuesta **íntegramente comentada**: inventario, doble lectura, Home publicada, cambio de estados, concurrencia, roles, restauración, validación y aprobación |
| `staging/v36-preflight.cjs` | Verificador de solo lectura; compara evidencias con SQL histórico y manifiestos V18/V33, identifica SQL activo en documentos de revisión y conserva **NO GO** |
| `tests/coordinated-review-v36.test.cjs` | Pruebas correctas y mutaciones adversas del manifiesto, permisos, rollback, SQL de revisión y aprobaciones |
| `QA-PAQUETE-COORDINADO-V36.md` | Este informe |

No se generó un script de migración ejecutable, un comando de aplicación o un archivo con credenciales. V36 **no ejecutó** los archivos `*.review.sql`.

## 3. Ocho fases de una eventual implementación autorizada

| Orden | Código | Qué falta probar |
|---|---|---|
| 0 | P00 | Aprobar ambiente separado, proveedor/región, presupuesto y responsables |
| 1 | P01 | Inventariar el **esquema realmente instalado**, respaldarlo y probar restauración |
| 2 | P02 | Implementar lectura dual de estados históricos y ruta Home desde servidor autenticado |
| 3 | P03 | Proteger exactamente una Home en sitios publicados incluso frente a escrituras concurrentes |
| 4 | P04 | Migrar solo dos etiquetas de `mg_site_proposals.status` en transacción versionada; preservar decisiones y eventos |
| 5 | P05 | Probar MFA, RLS, grants, SECURITY DEFINER, scopes, CAS, idempotencia, auditoría y outbox |
| 6 | P06 | Ensayar rollback coordinado y recuperación sin dobles entregas |
| 7 | P07 | Decisión humana independiente para publicación tras QA |

Todas están marcadas `BLOCKED_NOT_AUTHORIZED`, nunca `DONE`. Los 16 controles V18 siguen `pending`. La inclusión de una fase no concede permiso para ejecutarla.

## 4. Compatibilidad y preservación histórica

- Home interna es `home`; la URL pública canónica es `/`. `UNIQUE(site_id,slug)` **no garantiza la existencia** de Home en un sitio publicado.
- Solo dos valores de `public.mg_site_proposals.status` tienen mapeos históricos: `submitted_for_review → submitted` y `applied_to_draft → applied`.
- Los cuatro estados restantes, `mg_proposal_reviews.decision` y `event_type` en notificaciones/outbox se conservan. El evento `changes` **no** se convierte en estado `needs_changes`.
- Un downgrade futuro exige detener escrituras, versionar consumidores, preservar IDs/tenant/revisión/historial y contar con backup/restauración real. La conversión inversa es solo un componente de rollback, no un rollback garantizado.
- Los eventos ficticios `proposal_created` y `proposal_revised` de V27/V30 **no se añaden** por defecto a los CHECK históricos de eventos V13.
- Los SQL fuente V13/V20/V34/V35, el plan V33 y la rama `main` quedaron intactos.

## 5. QA efectivamente ejecutado en esta sesión

Los archivos se recuperaron de GitHub en la rama autorizada y las suites se evaluaron mediante un arnés JavaScript que sustituye `node:fs`, `node:path`, `node:assert/strict` y `process`. **No se ejecutó Node en el computador del usuario, SQL, migraciones, PostgreSQL, Supabase, navegador real ni servicios externos.**

| Suite efectivamente evaluada | Comprobaciones |
|---|---:|
| **V36 — Nuevo preflight y mutaciones adversas** | **174/174** |
| V35 — Contratos de estados de propuestas | 203/203 |
| V35 — Interfaz DOM simulada | 30/30 |
| V34 — Contratos de Home | 161/161 |
| V34 — Interfaz DOM simulada | 35/35 |
| V33 — Plan maestro y preflight NO GO | 146/146 |
| V22 — Migración reversible en memoria | 20/20 |
| V21 — SQL/API histórico | 25/25 |
| V20 — Contratos canónicos | 114/114 |
| V26 — Preparación técnica | 91/91 |
| V26 — Preflight CLI NO GO | 11/11 |
| **Total evaluado en esta sesión** | **1.010/1.010** |

**Interpretación:** son comprobaciones de sintaxis/documento y de comportamientos ficticios. No demuestran atomicidad de PostgreSQL, seguridad de RLS, privacidad real, permisos de producción ni entrega externa.

### Ajustes antes del PASS

El primer preflight V36 identificó que el documento comentado no nombraba explícitamente el estado SQL `published` en la regla de protección de Home; se añadió el caso y el test completo obtuvo **174/174**. Todos los cambios permanecieron en la rama de trabajo.

## 6. Reproducción local opcional (solo lectura)

```powershell
node apps/mg-web-studio-cloud/tests/coordinated-review-v36.test.cjs
node apps/mg-web-studio-cloud/staging/v36-preflight.cjs
node apps/mg-web-studio-cloud/tests/proposal-status-compat-v35.test.cjs
node apps/mg-web-studio-cloud/tests/home-compat-v34.test.cjs
```

El comando `staging/v36-preflight.cjs` **debe terminar con código 2** si el inventario está completo y mantiene NO GO; código 1 indica que falta evidencia o el contrato fue alterado. Ninguno de esos códigos autoriza migraciones.

## 7. Próximo paso útil y criterio de salida

**C01–C03 cuentan ya con un paquete técnico revisable en GitHub**, pero **ningún contrato SQL ha sido corregido en una base real**. Para pasar de diseño a implementación faltan decisión y autorización específica de un entorno segregado (proveedor, región, límite de gasto, responsable, cuenta), después inventario y backups verificables. Los bloqueos `HOME_SLUG_CONFLICT` y `STATUS_CONTRACT_MISMATCH` continúan abiertos en fuentes históricas.

Recomendación siguiente: **V37 — revisión integral de preparación para ejecución aislada**, priorizando seguridad de permisos y dependencias reales, y preparando una aprobación legible para el propietario **sin crear ni conectar staging**. No volver a multiplicar simuladores. Después, y solo si se autoriza, el desarrollo puede proceder a backend y PostgreSQL real.

**Restricciones respetadas:** no se gastaron créditos Lovable; no se ejecutó SQL; no se modificó Supabase, `main`, producción ni proyectos ajenos; no se activaron IA paga, cron, notificaciones externas o cobros.
