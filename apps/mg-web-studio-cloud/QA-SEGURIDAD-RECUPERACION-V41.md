# MG WEB STUDIO CLOUD — V41 | Auditoría documental de seguridad y recuperación

**Fecha:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Alcance:** los tres borradores SQL V40 + manifiesto V40 + línea base de STAGING V39.  
**Dictamen: REVISIÓN ESTÁTICA COMPLETADA. NO GO para SQL, migraciones, backend y producción.**

## 1. Hallazgos y prioridad

**12 observaciones abiertas: 5 bloqueos P0 y 7 riesgos P1.** Son controles pendientes de prueba/corrección, **no 12 vulnerabilidades explotadas en un entorno real**.

| ID | Prioridad | Riesgo observado en los archivos | Criterio de salida |
|---|---|---|---|
| V41-01 | **P0** | Grants por defecto para futuros objetos no revisados; V40 revoca privilegios de tablas nombradas, pero no determina `pg_default_acl` ni el rol creador | Inspección de propietarios/defaults y hardening versionado con prueba negativa |
| V41-02 | **P0** | Plan Free sin backup diario administrado; los tres borradores confirman transacciones **separadas** | Copia/recreación aprobada y restauración probada; resolver confirmaciones parciales |
| V41-03 | **P0** | La autorización previa solo cubre crear y examinar STAGING | Permiso humano explícito para SQL concreto, proyecto, responsable, coste y rollback |
| V41-04 | **P0** | Aún no se han ejecutado parser PostgreSQL, RLS/roles ni pruebas reales | Pruebas en entorno aislado autorizado con identidades ficticias y denegaciones |
| V41-10 | **P0** | El inventario V39 es una instantánea, no asegura ausencia futura de tablas | Revalidar objetos/roles/costos antes de instalar |
| V41-05 | P1 | `mg_private.mg_audit_events.organization_id` opcional y sin FK a organización | Decidir FK de tenant y retención de eventos de sistema |
| V41-06 | P1 | Outbox sin unicidad del evento de negocio; posible duplicación futura si backend no lo compensa | Diseñar unicidad/idempotencia/atomicidad, bloquear worker |
| V41-07 | P1 | `service_role` tiene DML y puede eludir RLS | Nunca exponer clave en browser; servidor valida MFA, rol, tenant y permisos |
| V41-08 | P1 | No está implementada regla exactly-one-Home en sitio publicado | Continuar bloqueando `published` hasta prueba concurrente |
| V41-09 | P1 | El manifiesto V40 afirma genéricamente `allTenantScopedObjectsHaveCompositeFk:true`, aunque existen relaciones solo por organización y auditoría sin FK | Sustituir afirmación por matriz objetiva de FK por tabla |
| V41-11 | P1 | MFA, caducidad/revocación y scopes reales no ensayados | QA con dos tenants ficticios y sesiones reales |
| V41-12 | P1 | No hay custodia, cifrado ni caducidad de backups ficticios aprobados | Política de recuperación con responsables y restauración independiente |

**Cuidado con los alcances:**
- El riesgo V41-01 se refiere a **futuros** objetos creados bajo determinados roles, no demuestra que V40 ya conceda acceso anónimo indebido. Los borradores actuales ya contienen `REVOKE` y RLS, que requieren validación real.
- La falta de FK en una columna de auditoría **no prueba** por sí sola una fuga entre tenants; documenta una decisión de integridad que el modelo debe resolver.
- La ausencia de un índice único específico de outbox **no prueba** envíos duplicados: todavía no hay worker ni backend desplegado.
- El diseño V40 bloquea `published` deliberadamente; esta mitigación se conserva.

## 2. Fuentes oficiales verificadas

La documentación vigente de Supabase explica que **GRANT y RLS son controles diferentes**, que algunos proyectos reciben privilegios predeterminados sobre objetos nuevos de `public` y que conviene verificar o revocar expresamente los defaults del propietario correcto. También recomienda probar todas las operaciones permitidas/denegadas. Se consultó el changelog para detectar cambios de plataforma; no se identificó un cambio que autorizara modificar el esquema sin verificación.

- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — políticas y grants, configuración de privilegios predeterminados.
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — permisos, roles, políticas y pruebas negativas.
- [Database Backups](https://supabase.com/docs/guides/platform/backups) — backup diario para planes pagos; el plan Free debe realizar exportaciones propias y verificarlas.
- [Changelog Supabase](https://supabase.com/changelog).

Ninguna recomendación SQL de la documentación se ejecutó en una cuenta real durante V41.

## 3. Entregables

| Archivo | Uso |
|---|---|
| `staging/v41-security-recovery.review.json` | Inventario formal de 12 riesgos, 5 P0, estados todos abiertos, seis pasos bloqueados, fuentes y alcance |
| `db/v41-default-privileges.review.sql` | **100% comentarios**: ejemplos y procedimiento para decidir hardening de defaults/roles, sin DDL activo |
| `PLAN-RECUPERACION-STAGING-V41.md` | Recuperación en Free, datos sintéticos, cifrado, hash, prueba de restore y gestión de fases confirmadas |
| `staging/v41-review-preflight.cjs` | Verificador de fuentes y estado NO GO, solo lectura |
| `tests/security-recovery-v41.test.cjs` | Ensayos estáticos y alteraciones adversas sobre permisos, resultados ficticios y aprobaciones |
| `QA-SEGURIDAD-RECUPERACION-V41.md` | Presente informe ejecutivo |

## 4. QA realizado en V41

La suite nueva `tests/security-recovery-v41.test.cjs` obtuvo **146 de 146 comprobaciones correctas** en un arnés JavaScript aislado tras recuperar los archivos desde GitHub. Se probaron casos correctos y modificaciones intencionales de aprobación, prioridades, fuentes, riesgos, permisos y restauración ficticia. El verificador `staging/v41-review-preflight.cjs` devuelve `NO_GO` aun cuando la documentación es coherente. **No se realizó validación de PostgreSQL, pgTAP, restore, RLS real o ejecución SQL.**

Dos pruebas adversas se ajustaron antes del resultado final para comprobar correctamente el nombre del hallazgo de `service_role` y todas sus referencias de permiso. No se modificaron los tres borradores V40 ni el proyecto STAGING para resolver esos falsos negativos de la suite.

**Resultado:** 146/146 comprobaciones documentales, **0 ejecuciones SQL**, **0 restauraciones reales**, **0 pruebas con roles reales**, **0 autorizaciones para desplegar**.

## 5. Orden concreto antes de pedir permiso para instalar V40

1. **V42 — cerrar por revisión en GitHub los riesgos P0 solucionables en código:** ajustar la propuesta sobre `pg_default_acl`, relaciones FK verificables, alcance real de permisos, plan de fases confirmadas y prueba de recuperación. Mantener archivos fuera de migraciones ejecutables.
2. **Acordar responsable, política de backup y límites de la cuenta:** datos sintéticos únicamente, copia protegida fuera de GitHub y plan de restauración independiente.
3. **Revisar los tres SQL definitivos y volver a observar STAGING**, con inventario de roles/grants, sin presuponer que V39 es vigente.
4. **Solicitar autorización SQL separada** sobre versión/hashes concretos, operación, destino, responsables y recuperación, antes de ejecutar nada.
5. **Solo después de autorización:** parser PostgreSQL/pgTAP, RLS/roles de dos tenants, negativas INSERT/UPDATE/DELETE, atomicidad, backup/restauración y evaluación del resultado.
6. **Backend, publicación y producción:** decisiones humanas independientes, NO GO mientras no haya pruebas reales.

No basta con aprobar la ficha JSON, afirmar `PASS` estático o disponer de un proyecto Supabase `ACTIVE_HEALTHY`.

**Restricciones V41:** `main` y otros proyectos sin modificar, STAGING sin SQL ejecutado ni despliegues, cero uso Lovable, cero pagos activados y ningún secreto o dato de cliente copiado a GitHub.
