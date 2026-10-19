# MG WEB STUDIO CLOUD — V35 | Compatibilidad de estados V13/V20

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Tarea del plan maestro:** C02 (diseño de estados y referencias, sin ejecución).  
**Dictamen:** **PASS exclusivamente en simulaciones y revisión de texto; NO GO** para PostgreSQL, staging, SQL real, Supabase, producción y servicios con costo.

## 1. Qué se revisó

- `db/v13-propuestas-scopes.review.sql` — enum de `public.mg_site_proposals.status`, `public.mg_proposal_reviews.decision`, `public.mg_proposal_notifications.event_type` y `mg_private.mg_proposal_outbox.event_type`.
- `shared/mg-contracts-v20.js` — seis estados canónicos y transición de acciones.
- `shared/mg-sql-api-compat-v21.js` — incompatibilidad de SQL frente a V20.
- `shared/mg-proposal-flow-v27.js` — ciclo ficticio de siete acciones.
- `shared/mg-outbox-reconciliation-v30.js` y `staging/v29-backend-contract.review.json` — eventos, auditoría y contratos de backend futuros.
- `staging/v33-master-roadmap.review.json` — tareas C02 y C03; `QA-COMPATIBILIDAD-HOME-V34.md` — C01 y bloqueo Home pendiente en SQL real.

**Hallazgo:** los estados históricos de propuestas contienen exactamente dos etiquetas diferentes a V20; `decision` y `event_type` usan otros vocabularios que **no deben convertirse indiscriminadamente**.

| Campo | V13 observado | V20 propuesto | Tratamiento |
|---|---|---|---|
| `mg_site_proposals.status` | `submitted_for_review` | `submitted` | Alias de lectura, futura conversión de filas |
| `mg_site_proposals.status` | `applied_to_draft` | `applied` | Alias de lectura, futura conversión de filas |
| Demás estados de propuestas | `draft`, `needs_changes`, `rejected`, `approved` | Iguales | Sin cambios |
| `mg_proposal_reviews.decision` | `approved`, `changes`, `rejected` | Iguales | **No** convertir `changes` a `needs_changes` |
| Notificaciones/outbox `event_type` | `submitted`, `approved`, `changes`, `rejected`, `applied` | Contrato clásico compatible | Preservar semántica de evento |

**Alcance adicional:** V27/V30 simulan acciones `create` y `revise` con eventos `proposal_created` y `proposal_revised`, pero los enums V13 no admiten esos nombres como eventos de notificación/outbox. La futura extensión requiere diseño explícito del productor, consumidor, autorización y versión de evento; V35 no amplía checks reales.

## 2. Entregables V35 en GitHub

- `shared/mg-proposal-status-compat-v35.js`: adaptador JavaScript puro de datos ficticios: normalización de alias, inventario limitado de propuestas, detección de estados inválidos, revisión estática de los cuatro CHECK V13, verificación separada de `decision`/`event_type`, proyección **solo conceptual** de etiquetas para contratos V13/V20 y ensayo de transiciones con V20. Devuelve `go:false`, `mayWrite:false` y `mayRunSQL:false`.
- `db/v35-estados-propuestas.review.sql`: **solo comentarios**. Secuencia futura de inventario, backup, control de concurrencia, equivalencias, CHECK de transición, transacción, rollback, RLS y verificación de referencias históricas. **No contiene sentencias SQL activas.**
- `revision-estados-v35.html`: laboratorio local con selector de estados, vista de alias y proyección de etiqueta de escritura a un contrato hipotético. No guarda ni se conecta a ninguna API.
- `laboratorio-contratos-v20.html`: se agregó un enlace al laboratorio V35, conservando la navegación y acciones existentes.
- `tests/proposal-status-compat-v35.test.cjs`: ensayos positivos/negativos de compatibilidad y no ejecución.
- `tests/proposal-status-compat-v35-ui.test.cjs`: interfaz con DOM simulado, sin navegador real.
- `QA-COMPATIBILIDAD-ESTADOS-V35.md`: presente informe.

## 3. Criterios comprobados

Se cubrieron los ocho nombres de entrada válidos (seis canónicos y dos alias), nombres desconocidos, minúsculas/mayúsculas, esquemas V13 malformados, CHECK de review/eventos cambiados, duplicados, revisiones no válidas, filtros de empresa/sitio en fixtures, proyectos V13/V20 propuestos, decisiones con permisos ficticios, aprobación, cambios, aplicación y revisión. `changes` genera estado `needs_changes` **pero conserva el evento** `changes`.

Los documentos fuente V13/V20 no se modificaron. La proyección de escritura a `canonical-v20-proposed` **nunca afirma que existe tal esquema**: `actualTargetVerified:false` y `realWritesPerformed:0`. La aplicación de una propuesta sigue sin implicar publicación.

## 4. Pruebas efectivamente ejecutadas en esta etapa

Todas se ejecutaron con los archivos leídos desde GitHub y un arnés JavaScript aislado que sustituyó `fs`, `path`, `assert` y el DOM. **No** hubo SQL ejecutado, proyecto Supabase consultado, servidor, navegador real ni Node en el equipo del usuario.

| Suite | Comprobaciones correctas |
|---|---:|
| V35 — Alias, CHECK y compatibilidad nuevos | **203/203** |
| V35 — UI DOM simulada nueva | **30/30** |
| V20 — Contratos canónicos | 114/114 |
| V20 — Laboratorio DOM anterior | 36/36 |
| V21 — Compatibilidad SQL/API | 25/25 |
| V27 — Ciclo de propuestas | 213/213 |
| V29 — Diseño backend | 341/341 |
| V30 — Outbox/notificaciones | 119/119 |
| V33 — Plan maestro y NO GO | 146/146 |
| V34 — Compatibilidad Home | 161/161 |
| V34 — Revisión Home DOM | 35/35 |
| **Total de esta sesión V35** | **1.423/1.423** |

Un test V35 inicial esperaba la palabra `ROLLBACK` en mayúsculas dentro de comentarios SQL; se corrigió el test para comparar sin distinción de mayúsculas. Luego se recuperó el archivo de GitHub y se ejecutaron las **203 pruebas** correctamente. No se suman estadísticas de suites históricas no reejecutadas.

## 5. Qué sigue pendiente y por qué NO GO

1. **`STATUS_CONTRACT_MISMATCH` permanece en V13.** El propio test V21 debe continuar reportando la incompatibilidad mientras no exista una migración coordinada realmente aprobada y ejecutada.
2. Los contratos de V35 no verifican tablas o datos reales. Los recuentos y los ejemplos son fixtures construidos para revisión.
3. Falta la secuencia real de cambios bajo transacción, compatibilidad de clientes simultáneos, backfill, CHECK definitivo, rollback y restauración, sin perder ids, revisiones, decisiones, historial de notificaciones, outbox, auditoría o idempotencia.
4. Permisos de servidor, MFA, RLS, SECURITY DEFINER, CAS, actor verificado y alcance por sitio siguen sin pruebas PostgreSQL reales.
5. **`HOME_SLUG_CONFLICT`** permanece abierto en los orígenes V14/V19 y la garantía de Home publicada del SQL original no se ha implementado; V34 solo preparó el diseño.
6. Los 16 controles de preparación V18 y los escenarios reales de V28/V30/V31/V32 siguen pendientes.
7. No existe autorización para staging, ejecutores SQL, publicación, IA de pago, créditos Lovable ni cobros. Un documento de revisión no habilita esas acciones.

## 6. Continuidad recomendada: V36 / C03

Con propuestas técnicas C01 (Home, V34) y C02 (estados, V35) preparadas, la tarea siguiente es **C03 — paquete de cambios coordinados y reversibles**, con inventario de dependencias SQL, plan de despliegue escalonado, checklist de seguridad y pruebas estáticas. Mantener todas las sentencias de aplicación como documentos de revisión hasta una autorización explícita de staging, proveedor, región y presupuesto.

### Repetición local opcional (sin conexión)

```powershell
node apps/mg-web-studio-cloud/tests/proposal-status-compat-v35.test.cjs
node apps/mg-web-studio-cloud/tests/proposal-status-compat-v35-ui.test.cjs
node apps/mg-web-studio-cloud/tests/sql-api-compat-v21.test.cjs
```

**Restricciones conservadas:** cambios solo en `feature/mg-digital-v5-web-services` dentro de MG WEB STUDIO CLOUD; `main`, Supabase, producción y otros proyectos intactos; sin SQL ejecutado, publicaciones, IA de pago ni consumo Lovable.
