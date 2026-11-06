# MG WEB STUDIO CLOUD — V94A | Decisión propuesta sobre fuente canónica de recuperación

**Fecha:** 2026-11-01 · **Clasificación:** DECISIÓN TÉCNICA PROPUESTA / NO EJECUTABLE / SIN APROBACIÓN DE MIGRACIÓN.  
**Proyecto exclusivo:** MG Web Studio Cloud · **PR:** [#7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) (borrador).  
**Estado:** `G1 = PENDING`; `REC-02/REC-03 = PENDING`; `V67 = 32 PENDING / 0 PASS`; `PRODUCTION = NO_GO`.

## 1. Problema a resolver

Para probar V94B no se puede concatenar indiscriminadamente `schema_core.review.sql`, `modelo-contenido-compartido.review.sql` y V45, ni convertir un borrador existente en migración automática. V57 sí trazó el cuerpo exacto V45 aplicado históricamente en STAGING; su archivo fuente sigue rotulado como borrador y **no** es todavía un procedimiento de reconstrucción autorizado. V90 restauró exclusivamente un pequeño fixture; V53 pasó 56/56 en STAGING, nunca contra una restauración integral MG.

## 2. Selección de referencia, no de ejecutable

| Pieza | Clasificación para V94 | Decisión **propuesta** |
| --- | --- | --- |
| `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt` | **BASELINE HISTÓRICO MG**, blob `135ff2c25d935d87e5c8e9e0f9189705cd40b411` | Tomar como **origen documental principal** de los 16 objetos MG, índices, restricciones, RLS, políticas y grants históricos; NO renombrar/copiar a migraciones ejecutables ni reutilizar ciegamente el SQL de STAGING. |
| `docs/V57-TRAZABILIDAD-V45.md` | Procedencia | Conservar vínculo entre el archivo y versión histórica `20261020181753` (sin repetir esa migración en STAGING). |
| `supabase/migrations/20261020191612_mg_web_studio_v54_postgres_public_table_sequence_defaults.sql` | **DELTA HISTÓRICO** | Documentar como cambio posterior limitado a defaults de TABLAS/SECUENCIAS del propietario `postgres` en `public`; **NO** equivale a ACL completas de roles ni defaults de funciones/`supabase_admin`. |
| `supabase/migrations/20261020183045_mg_web_studio_v53_enable_pgtap_staging.sql` | Dependencia técnica exclusiva de STAGING | Tratar pgTAP como herramienta de test cuya instalación en un ambiente nuevo requiere análisis y autorización, no como parte necesaria de un release productivo. |
| `tests/v53-rls-runtime.test.sql` | Prueba histórica | Preservar 56 aserciones, alcance de roles, fixtures y `ROLLBACK`. Solo aplicar a copia restaurada tras un ensayo nuevo autorizado. |
| `db/schema_core.review.sql` | **DISEÑO HISTÓRICO EXCLUIDO** del baseline V94 | NO concatenar ni ejecutar junto a V45: **7 tablas solapadas**, políticas y grants distintos. Su tabla `public.mg_domains` no aparece en los 16 objetos del baseline V45. |
| `db/modelo-contenido-compartido.review.sql` | **EXTENSIÓN FUTURA/NO RECONCILIADA** | Cuatro tablas no incluidas en V45 (`mg_site_identity`, `mg_site_products`, `mg_site_promotions`, `mg_site_content_releases`). No añadir a V94B solo para ampliar cifras: requieren decisión de alcance independiente. |
| `auth.users`, `auth.uid()`, `anon`, `authenticated`, `service_role` | **DEPENDENCIAS EXTERNAS MG** | No son DDL canónico MG. Un fixture de laboratorio nunca demuestra por sí mismo el comportamiento de Supabase Auth ni MFA reales. |

**Alcance propuesto del baseline:** 16 tablas MG (12 `public`, 4 `mg_private`), 11 declaraciones `CREATE INDEX`, 12 declaraciones `CREATE POLICY`, 16 `ENABLE ROW LEVEL SECURITY`. Estos son **recuentos de inspección textual**, no el resultado de un parser PostgreSQL ni un catálogo leído en runtime.

## 3. Conflictos detectados en los diseños antiguos

- **Siete tablas duplicables** entre `schema_core.review.sql` y V45: `public.mg_profiles`, `public.mg_organizations`, `public.mg_memberships`, `public.mg_sites`, `public.mg_pages`, `mg_private.mg_staff_roles`, `mg_private.mg_audit_events`.
- **Diferencia de permisos:** `schema_core.review.sql` incluye `GRANT INSERT` y `GRANT UPDATE` directos a `authenticated` para sitios/páginas (y actualización de perfil), mientras que V45, tras `REVOKE`, concede `SELECT` a `authenticated` y reserva escritura a `service_role`. Reproducir los grants antiguos abriría un riesgo de privilegios y desviaría la prueba RLS de V53.
- **Objeto no cubierto por V45:** `mg_domains` existe en el diseño inicial, no en V45. No asumir pérdida de producción ni ejecutarlo como reparación; documentar como fuera del baseline histórico revisado.
- **Cuatro tablas adicionales** del borrador de contenido compartido tampoco constan en V45; mantenerlas separadas hasta especificar qué producto requieren y cómo se autorizan.
- V45 **no crea funciones** según inspección textual, pero hace llamadas a `auth.uid()`: la reproducción de políticas depende de objetos externos y permisos de función del ambiente, todavía sin certificación.
- V54 no corrige `PUBLIC EXECUTE`, defaults de funciones ni privilegios efectivos de `supabase_admin`. El responsable de seguridad debe evaluarlos en un entorno autorizado antes de cerrar G1/G2/DATA-01.

## 4. Estrategia de recuperación recomendada

**A. Cadena de custodia de fuentes (se puede avanzar documentalmente):** congelar blobs SHA; identificar cada objeto MG, orden de dependencias (Auth y roles antes de referencias, tablas e índices/policies, luego defaults), versiones históricas V45/V53/V54 y material adicional separado; mantener el registro inmutable para evitar renombrar scripts de prueba como migraciones.

**B. Fuente ejecutable canónica (NO creada, NO autorizada):** tras dictamen técnico de compatibilidad, diseñar un artefacto específico de restauración **nuevo**, versionado y revisado, con checks de objetos ya existentes, owners y grants; el mecanismo no debe reejecutar V45 sobre STAGING ni tocar otros proyectos. No usar `schema_core.review.sql` para completar V45 silenciosamente.

**C. Laboratorio V94B (NO autorizado):** un runner aprobado con dos PG17 descartables y datos 100 % sintéticos, dependencias `auth.users` y `auth.uid()` limitadas a prueba, roles representativos y pgTAP en `extensions`; reproducir y restaurar **los 16 objetos MG**; comprobar catálogo de índices, RLS, políticas, restricciones y grants; ejecutar V53 sobre destino restaurado con `ROLLBACK`; probar borrado final. Una compatibilidad simulada de Auth no aprueba por sí sola `AUTH-01..03` ni `MFA`.

**D. Revisión independiente:** cotejar logs sanitizados, scripts, commit preciso, SHA de fuentes, 56 aserciones o ajustes de prueba autorizados, diferencias esperadas y ausencia de residuos. Sin firma humana real, V67 sigue PENDING.

## 5. Condiciones de salida de la fase documental

| Gate | Evidencia mínima para cierre | Estado |
| --- | --- | --- |
| G1 — Canonical DDL | Catálogo de objetos y hashes completo; dependencias y alternativas reconciliadas; estrategia de recuperación aprobada por revisor técnico | **PENDING** (hay selección *propuesta*, no aprobación) |
| G2 — Auth + pgTAP | Compatibilidad de roles, extensiones y funciones necesaria en laboratorio nuevo | **PENDING** |
| G3 — Fixtures y limpieza | Definición de fixture, rollback, cero residuos y cotejo real de restauración | **PENDING** |
| G4 — Autorización V94B | Permiso expresamente limitado a contenedores PG17 desechables, SQL, `pg_dump`/`pg_restore` y pgTAP | **NOT AUTHORIZED** |
| G5 — Aislamiento | Revisión del runner, redes, recursos, credenciales ausentes y limpieza | **PENDING** |
| G6 — Revisor | Revisión independiente verificable, sin firmas inventadas | **UNASSIGNED** |
| G7 — Producción | Aceptación formal de los 32 V67 + rollback + autorización específica de lanzamiento | **NO_GO** |

## 6. Protección operativa

Este documento **NO crea migraciones**, conexiones, SQL ejecutable, workflows, autenticación, snapshots de STAGING, autorizaciones, aprobaciones de producción ni firmas humanas. **No ejecutar migraciones sobre STAGING ni sobre el contenedor BAZAR-ONLINE.** Permanecen inalterados `main`, la web publicada, Ventry, MG CLUB+, FINZY y los demás proyectos.

**Conclusión:** V45 es el baseline histórico más defendible para el primer ensayo MG, pero la fuente canónica portable no está aprobada. La ruta de menor duplicación consiste en validar documentalmente su inventario y sus permisos, designar revisor independiente y autorizar V94B solo cuando esté preparado un entorno de prueba aislado.
