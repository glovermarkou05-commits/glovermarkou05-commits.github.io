# MG WEB STUDIO CLOUD — V94A | Conciliación estática V45 ↔ V53 ↔ V54

**Fecha:** 01/11/2026 · **Alcance:** GitHub, solo lectura de código y revisión documental.  
**Dictamen:** COINCIDENCIA ESTÁTICA PARCIAL; **DDL CANÓNICO NO CONCILIADO**; **PG17/SQL/RESTORE NO AUTORIZADOS**; **V67 32 PENDING / 0 PASS; producción NO_GO**.  
**PR:** [#7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) hacia `feature/mg-digital-v5-web-services` (borrador, no fusionar).

## 1. Fuentes y huellas GitHub

| Etiqueta | Archivo en `apps/mg-web-studio-cloud/` | Blob SHA GitHub |
| --- | --- | --- |
| V45 | `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt` | `135ff2c25d935d87e5c8e9e0f9189705cd40b411` |
| V53 | `tests/v53-rls-runtime.test.sql` | `18a10e935ef1487524da93f3e49ee849ba3784bf` |
| V54 | `supabase/migrations/20261020191612_mg_web_studio_v54_postgres_public_table_sequence_defaults.sql` | `a4b7221a4c38696a1c2abeef79a56ee68e151a5a` |
| Core review | `db/schema_core.review.sql` | `02912849894f6968560211d596002d409f6a1d3a` |
| Contenido review | `db/modelo-contenido-compartido.review.sql` | `ef5e44d96d9a5c85e463c771d228c86ebfb199df` |
| Procedencia | `docs/V57-TRAZABILIDAD-V45.md` | `b0e2447ce4db9e70a5e4cd038904e9cf191a6bfc` |

**Método:** inspección textual de definiciones `CREATE TABLE`, nombres de columnas en `INSERT INTO`, `CREATE POLICY`, cabeceras, declaraciones de concesiones y dependencias. **No se usó parser SQL de PostgreSQL ni hubo conexión a una base**. El recuento es indicativo de cobertura de texto, nunca prueba de ejecución.

## 2. Coincidencias observadas sin SQL

- V45 contiene **16 `CREATE TABLE` distintos**: **12** en `public` y **4** en `mg_private`.
- V45 declara **12 `CREATE POLICY`**, correspondientes a controles RLS para tablas públicas. No se encontró una definición `CREATE FUNCTION` en este fichero; sí múltiples llamadas a `auth.uid()`, cuya implementación depende del entorno de Auth.
- V53 contiene **12 destinos `INSERT INTO public.mg_*` distintos** y uno externo (`auth.users`).
- **12 de 12 tablas MG destinatarias de INSERT V53** existen en el SQL V45. **0 nombres de columnas de esas inserciones faltan** en las 12 definiciones textuales V45. Esto **no valida** tipos, `NOT NULL`, FK, integridad, extensiones o permisos en tiempo de ejecución.
- V53 referencia `extensions.plan(56)`, el rol `authenticated`, valores sintéticos en `auth.users`, afirmaciones de acceso de `anon` y `service_role`, y termina con `ROLLBACK`. **Las 56 aserciones pasaron en STAGING histórico (V53), no sobre un PG17 restaurado con esquema completo**.
- V53 consulta `mg_private.mg_audit_events` mediante la función de privilegios de PostgreSQL, sin insertar datos en tablas privadas; no cubre en runtime todos los grants/operaciones del esquema privado.

## 3. Incompatibilidades y dependencias pendientes

| Riesgo | Observación | Cierre requerido |
| --- | --- | --- |
| Fuente canónica V45 | El archivo `.sql.txt` está rotulado “DO NOT EXECUTE/DO NOT REGISTER AS MIGRATION”, pero V57 reconcilió que ese cuerpo **fue aplicado históricamente** en STAGING con versión `20261020181753`. | Seleccionar fuente de recuperación revisada, versionada y con hashes; prohibido reaplicar por error en STAGING. |
| Solapamiento de diseños | `schema_core.review.sql` define **7 tablas también presentes en V45**: `mg_profiles`, `mg_organizations`, `mg_memberships`, `mg_sites`, `mg_pages`, `mg_staff_roles`, `mg_audit_events`. | No concatenar ni aplicar ambos SQL sin conciliación por objeto/versión. |
| Diseños fuera de V45 | `modelo-contenido-compartido.review.sql` define otras cuatro tablas (`mg_site_identity`, `mg_site_products`, `mg_site_promotions`, `mg_site_content_releases`), **no incluidas** en las 16 del V45 inspeccionado. | Decidir formalmente si forman parte del esquema de recuperación objetivo; no introducirlas solo para pasar V53. |
| Dependencia de Auth | V53 inserta en `auth.users` con campos del esquema Supabase (`aud`, `role`, `email_confirmed_at`, `raw_app_meta_data`, `raw_user_meta_data`, `is_anonymous`) y usa claims simulados y roles `authenticated`, `anon`, `service_role`. | Laboratorio plenamente ficticio y compatible con esos objetos; sin cuentas ni secretos de clientes. |
| Extensión pgTAP | La suite llama a `extensions.plan/is/ok/finish`; la migración V53 habilitó `pgtap` **solo en STAGING**. | Definir esquema y versión de extensión para el laboratorio PG17 sin alterar STAGING. |
| Grants existentes y futuros | V45 revoca/grant a nivel de objetos y declara que **no** corrige ACL por defecto. V54 cambia solo defaults de **TABLAS y SECUENCIAS de rol `postgres` en `public`**. | Auditar `supabase_admin`, defaults de FUNCIONES, `PUBLIC EXECUTE`, roles efectivos, `SECURITY DEFINER` heredados, funciones no presentes en V45 y tablas futuras. |
| Cumplimiento de rollback | V53 contiene `BEGIN`/`ROLLBACK`, pero eso no prueba cero residuos tras un restore completo. | Medir en origen/destino efímeros y confirmar integridad y limpieza con pruebas aprobadas. |
| REC-02 / REC-03 | V90 recuperó fixture pequeño de cuatro filas en dos PG17 efímeros; no instaló el esquema MG V45 completo. | En V94B, si se autoriza, ensayo nuevo de origen/destino aislados, pgTAP V53 restaurado y cotejo de objetos y grants. |

## 4. Decisión de gates

- **G1 = PENDING (avanzó el cotejo de nombres/columnas, pero no hay migración canónica ni revisión PostgreSQL).**
- **G2 = PENDING (roles, `auth.users`, extensiones y servicios Supabase no recreados).**
- **G3 = PENDING (fixture completo y prueba de limpieza no ejecutados).**
- **G4 = NOT_AUTHORIZED (no iniciar PG17, SQL, dump, restore ni pgTAP).**
- **G5 = PENDING (runner/aislamiento/red no evaluados para el nuevo esquema).**
- **G6 = UNASSIGNED (sin revisor técnico independiente, firma ni custodia aprobada).**
- **G7 = NO_GO (V67: 32 PENDING y publicación prohibida).**

Las 14 evidencias de laboratorio V85–V90 ya inventariadas en V91/V93 se deben **presentar a revisor independiente**, no ejecutar de nuevo sin causa técnica. Esta conciliación documental **no cambia** ningún estado V67.

## 5. Continuación priorizada (sin duplicación)

1. Determinar artefacto DDL canónico **por objeto** a partir de V45/V54 y la trazabilidad V57; documentar tablas, índices, constraints, policies, owners, grants, defaults y funciones externas. No crear migración ejecutable sin aprobación de estrategia.
2. Diseñar fixture sintético mínimo de `auth.users`/roles/extensiones y checklist de validación `56/56` aplicable únicamente a un PG17 recuperado (sin comandos ejecutados).
3. Preparar límites del futuro job (dos contenedores desechables, alcance sin credenciales externas, datos `example.invalid`, cierre con borrado, tiempo/capacidad acotados, captura de hashes, y error seguro). Un workflow no se activa ni despliega por esta nota.
4. Exigir nueva autorización expresa para V94B y revisión de seguridad antes de cualquier operación de SQL o restauración. Nunca conectar el contenedor de BAZAR-ONLINE, STAGING real o producción.

**Resultado de esta revisión:** exclusivamente documentos en rama de borrador y cálculo estático de coincidencias. **No se ha ejecutado SQL, PostgreSQL, restauración ni pruebas nuevas en base de datos.**
