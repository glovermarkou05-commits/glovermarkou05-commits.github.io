# MG WEB STUDIO CLOUD — V40 | Paquete inicial de PostgreSQL para revisión

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Entorno previsto:** MG WEB STUDIO CLOUD - STAGING (Supabase Free; São Paulo, `sa-east-1`).  
**Estado:** **BORRADORES SQL / NO GO PARA EJECUTAR, MIGRAR, DESPLEGAR O PUBLICAR**.

## 1. Objetivo y punto de partida verificado

Tras V39 se comprobó mediante consultas de metadatos de solo lectura que el STAGING nuevo estaba `ACTIVE_HEALTHY`, PostgreSQL 17, sin tablas de aplicación en `public`, sin migraciones registradas, sin Edge Functions desplegadas y sin ramas de DB. Esta evidencia era puntual y **no acredita que el entorno siga vacío el día de una futura aplicación**. Antes de ejecutar cualquier migración se debe verificar nuevamente la base real, los roles, privilegios y esquema.

V40 pasa de descripciones conceptuales a **tres archivos con SQL DDL concreto**, guardados deliberadamente con extensión **`.sql.txt`** y fuera del directorio `supabase/migrations/`. Son **borradores que contienen sentencias SQL activas si se copian**, pero **no** constituyen una migración aprobada ni fueron ejecutados.

## 2. Entregables y orden propuesto

| Paso | Archivo | Qué define |
|---|---|---|
| **01** | `db/v40-drafts/01_core_schema.sql.txt` | Esquema multiempresa: perfiles, organizaciones, membresías, sitios, páginas, scopes por sitio, roles privados de personal y auditoría. **8 tablas** |
| **02** | `db/v40-drafts/02_proposals_audit.sql.txt` | Borradores versionados, propuestas, revisiones, decisiones, notificaciones, confirmaciones de lectura, outbox privado e idempotencia. **8 tablas** |
| **03** | `db/v40-drafts/03_readonly_rls.sql.txt` | Revocación de accesos de navegador, **12 políticas `SELECT`** y permisos de servicio privado para backend futuro; sin políticas de escritura para `authenticated` |
| Control | `staging/v40-sql-review-package.review.json` | Manifiesto con orden, fuentes, identificadores de revisión, exclusiones y bloqueos |
| Control | `staging/v40-review-preflight.cjs` | Inspección estática con salida siempre `NO GO`, sin ejecutor SQL ni red |
| QA | `tests/sql-review-v40.test.cjs` | Pruebas positivas y alteraciones adversas (grants, RLS, Home, estados, publicación, autorización y SQL peligroso) |

Las tablas propuestas tienen habilitación explícita de RLS en el texto, pero **eso no verifica ninguna política real**. En los borradores no se crean usuarios, organizaciones de clientes, registros empresariales ni datos sintéticos.

## 3. Decisiones de seguridad incluidas

1. **No publicar sitios todavía:** `mg_sites.status` solo admite `draft`, `review` y `suspended`. `published` **queda deliberadamente bloqueado** hasta contar con protección transaccional y pruebas reales que garanticen una única página Home. `UNIQUE(site_id,slug)` no obliga a que exista Home.
2. **Home canónica:** `slug='home'`, ruta pública futura `/`; el esquema impide almacenar `slug=''`. En V40 no se implanta todavía un router web público.
3. **Estados V20 desde el inicio:** como V39 encontró cero tablas de `public`, el diseño inicial propone los seis estados `draft, submitted, needs_changes, rejected, approved, applied` directamente, sin aplicar V13 ni migrar filas heredadas. Antes de ejecutar se debe revalidar el inventario.
4. **Eventos distintos de estados:** las decisiones `approved, changes, rejected` y los eventos `submitted, approved, changes, rejected, applied` conservan los nombres V13. `changes` no se convierte en `needs_changes`. `proposal_created` y `proposal_revised` de simuladores anteriores no se agregan por defecto al outbox real.
5. **Acceso de navegador solo a lectura:** se revoca acceso a `anon` y escritura directa a `authenticated`, concediendo únicamente `SELECT` limitado por RLS. La política de sitios permite a OWNER/ADMIN de organización activa leer sus sitios y exige asignación explícita para EDITOR/VIEWER.
6. **Datos privados:** `mg_private` no se concede a `anon` ni `authenticated`; las funciones `SECURITY DEFINER` del borrador V13 **no se copiaron**.
7. **Servidor futuro:** el rol `service_role` dispone de permisos explícitos propuestos para servicios futuros; **eso no equivale a autorización de negocio**, porque puede eludir RLS. La futura API debe verificar de forma independiente usuario autenticado, tenant, sitio, rol, MFA, CAS e idempotencia antes de cualquier operación.
8. **Sin SQL destructivo ni seeds:** no se incluyen `DROP`, `TRUNCATE`, `DELETE`, inserciones iniciales, migración histórica ni rutinas privilegiadas.

**Límite importante:** el diseño no incluye aún dominios, identidad/personalización comercial, catálogo de productos, promociones, releases publicados, emails reales, creación/alta de usuarios ni pasarela de pago. Forman parte de fases posteriores, no del esquema mínimo de validación.

## 4. Checklist previo a cualquier ejecución real

**No completado — requiere revisión y permiso separados:**

- [ ] Confirmar nuevamente **ID exacto del STAGING**, cuenta, plan Free y ausencia de tablas/migraciones inesperadas, sin afectar proyectos ajenos.
- [ ] Acordar el modo de recuperar un entorno nuevo y **realizar una prueba de backup/restauración** usando datos ficticios; Free no debe suponerse protegido con copias automáticas.
- [ ] Revisión independiente del SQL por DBA y seguridad: dependencias `auth.users`, restricciones compuestas, owner, `GRANT`, defaults, RLS, recursión de políticas, permisos especiales, índices y transacciones.
- [ ] Generar los archivos de migración finales con **`supabase migration new`**, siguiendo los comandos `--help` de la versión local del CLI. **No se inventó ni generó aquí una migración registrada.**
- [ ] Autorizar **expresamente el conjunto exacto de sentencias y el proyecto STAGING** antes de usar una herramienta de aplicación SQL.
- [ ] Realizar validación inicial con parser de PostgreSQL real; detenerse si existe conflicto de objetos o permisos.
- [ ] Probar con **dos tenants ficticios y roles reales** la lectura y denegación entre organizaciones, asignación de scopes, sesión caducada, MFA, RLS y Data API.
- [ ] Probar denegación real de INSERT/UPDATE/DELETE a `anon` y `authenticated`; revalidar grants de funciones, secuencias y roles.
- [ ] Probar coherencia de propuestas/revisiones/notificaciones/outbox, errores parciales, CAS y restauración antes de autorizar backend.
- [ ] **No** habilitar estado `published` ni desplegar el sitio hasta aprobar por separado el control de Home publicada y su concurrencia.

**Rollback/recovery:** los borradores contienen transacciones delimitadas, lo que permitiría revertir *errores antes del COMMIT* en una futura ejecución adecuada. Si ya se confirma una fase, el rollback **no** queda garantizado por esas delimitaciones: se necesita un procedimiento de restauración probado o una migración inversa revisada y autorizada. No se entrega `DROP ... CASCADE` automático.

## 5. QA efectivamente ejecutado en esta sesión

Se utilizaron archivos obtenidos desde la rama de GitHub y arnés de JavaScript con dependencias `fs/path/assert` simuladas. Se evaluó la estructura **textual** de las propuestas, no se compiló ni ejecutó SQL en PostgreSQL.

| Suite | Comprobaciones correctas |
|---|---:|
| **V40 — Nueva suite de esquema, RLS y alteraciones adversas** | **187/187** |
| V36 — Control coordinado y cuarentena SQL histórico | 174/174 |
| V37 — Autorización, permisos y NO GO | 195/195 |
| **Total de la sesión** | **556/556** |

Un test adverso inicial encontró que el verificador comprobaba la FK empresa/sitio en cualquier tabla en vez de hacerlo en `mg_pages` específicamente. Se corrigió y **se repitió la suite completa V40 con 187/187 correctas**.

El verificador observó en los borradores **16 `CREATE TABLE`**, **16 sentencias de activación RLS** y **12 políticas `SELECT`**. Estos recuentos **no son evidencia de que tales objetos existan ahora en Supabase**.

## 6. Próxima decisión y condición de avance

**V41 recomendada:** auditoría manual del paquete V40 y preparación de **pruebas reales de PostgreSQL sobre el STAGING aislado**, incluida restauración, roles, RLS y fallos. La autorización para crear el proyecto y revisarlo en solo lectura **no permite ejecutar las sentencias propuestas aquí**.

El siguiente permiso debería referirse al **STAGING exclusivo, las tres propuestas V40, la estrategia de recuperación y el alcance concreto de pruebas**. Solo después de ese permiso se podrán convertir en migraciones auténticas mediante el CLI y aplicarlas.

**Estado final V40: DOCUMENTO REVISADO ESTÁTICAMENTE / SQL NO EJECUTADO / STAGING SIN APP INSTALADA / PRODUCCIÓN NO GO.**

No se modificaron `main`, Lovable, proyectos Supabase existentes, producción, correo, pagos o IA facturable.
