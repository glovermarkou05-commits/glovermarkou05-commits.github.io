# MG WEB STUDIO CLOUD — Etapa V32 | Integridad y fallos combinados

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Decisión:** **PASS solo en simulaciones y revisiones estáticas; NO GO** para SQL, Supabase, staging, backend auténtico, publicación, mensajería o pagos.

## 1. Revisión y diseño no duplicado

Se inspeccionaron los módulos `mg-proposal-flow-v27.js` (siete acciones y auditoría), `mg-audit-trail-v24.js` (cadena no criptográfica), `mg-outbox-reconciliation-v30.js` (outbox/notificaciones y su `reconcile`), `mg-observability-v31.js` (indicadores y checkpoint) y `mg-backend-contract-v29.js` (contrato sin implementación real). Los controles existentes ya operan por separado; V32 los compara **entre sí** con un inspector independiente y de solo lectura. Ninguno se sustituyó ni modificó.

## 2. Entregables de esta etapa

- `shared/mg-flow-integrity-v32.js`: `inspect(input)` cruza **instantánea de propuestas + ledger V24 + fuente declarada de V30 + outbox V30 + métricas V31 + contratos V29/V31**. `inspectMatrix(matrix)` valida la documentación NO GO de 24 pruebas futuras.
- `staging/v32-combined-faults.review.json`: **24 escenarios de aceptación futura**, todos `NOT_EXECUTED`, con banderas de ejecución desactivadas y producción `NO_GO`.
- `tests/flow-integrity-v32.test.cjs`: verificaciones con fallos aislados y combinados, regresión de checkpoints, permisos y contratos.
- `QA-INTEGRIDAD-FALLOS-COMBINADOS-V32.md`: este informe.

## 3. Hallazgos detectables en el simulador

| Caso | Diagnóstico de V32 |
|---|---|
| Propuesta con estado diferente a su último evento permitido | `PROPOSAL_LAST_STATE_DRIFT` |
| Propuesta sin ningún evento de origen | `PROPOSAL_WITHOUT_ALLOWED_EVENT` |
| Auditoría permitida sobre propuesta inexistente | `COMMITTED_TARGET_NOT_FOUND` |
| Ledger V27 diferente del ledger declarado para V30 | `LEDGER_SOURCE_DRIFT` |
| No existe plan de destinatarios de evento permitido | `INCOMPLETE_DELIVERY_PLAN` |
| Plan duplicado o que referencia auditoría no permitida | `DUPLICATE_DELIVERY_PLAN` / `PLAN_NOT_COMMITTED` |
| Falta notificación/outbox para destinatario expresamente esperado | `MISSING_EXPECTED_OUTBOX` |
| Outbox no previsto por plan de entrega | `UNEXPECTED_OUTBOX_DELIVERY` |
| Evento con acción o scope divergente | `OUTBOX_COMMITTED_SCOPE_DRIFT` |
| Revisión del outbox mayor que revisión actual | `OUTBOX_REVISION_AHEAD` |
| Avisos huérfanos, registros de auditoría inválidos, duplicados | `RECONCILIATION_INVALID` / `AUDIT_CHAIN_INVALID` |
| Entrega desaparecida o estado de lectura revertido entre checkpoints | `CHECKPOINT_REGRESSION` |
| Contrato backend o configuración de monitoreo manipulados | `BACKEND_CONTRACT_CHANGED` / `MONITORING_PLAN_CHANGED` |

**Caso adicional probado:** un evento de auditoría **rechazado** (`outcome=denied`) utilizado como supuesto origen de un mensaje se detecta como fuente inválida y entrega inesperada. Esto impide considerarlo una operación confirmada en el ensayo.

El inspector solo devuelve **códigos y cantidades agregadas**. No devuelve IDs de empresa, usuario, propuesta o evento; tampoco mensajes, credenciales, contraseñas ni datos privados. No envía avisos, modifica estados ni efectúa reparaciones.

## 4. Importantes límites de confianza

- El `ledger`, los snapshots y el **plan de destinatarios** son suministrados por el arnés de pruebas. Que concuerden no prueba que los registros hayan sido confirmados por un servidor ni que el plan sea completo o legítimo.
- La comprobación de una entrega ausente **exige que esa entrega esté declarada en `plans`**. Si el plan omite un destinatario y esa omisión también se refleja en outbox, V32 no puede inferir de forma independiente que falta el mensaje. El plan tendría que generarse desde obligaciones de negocio verificadas por un backend real.
- No existe transacción única V27/V30. Una falla entre cambios de propuesta, auditoría, outbox y registro idempotente aún podría perder datos; V32 detecta ciertas inconsistencias *a posteriori*, no ofrece atomicidad ACID ni rollback.
- FNV-1a de V24 no es sello criptográfico; no se descarta manipulación coordinada del origen y datos revisados.
- V30 y V31 solo usan tiempos, reservas y notificaciones ficticias. No hay worker, entrega real, reconciliación Postgres, proveedor de mensajería, seguridad RLS ni MFA.
- La matriz V32 contiene **24 escenarios de aceptación futura NO EJECUTADOS**. Se conservan además los escenarios pendientes V28, V30 y V31 y las 16 precondiciones V18; pasar la simulación no equivale a cerrar esos bloqueos.

## 5. QA ejecutado en esta sesión

Se leyeron los archivos guardados en GitHub y se ejecutaron suites JavaScript mediante un arnés aislado que sustituye `node:fs`, `node:path` y `node:assert/strict`. **No se ejecutaron PostgreSQL, Node en el equipo del usuario, HTTP, servicios externos, SQL, Supabase, cron, Lovable ni navegador real.**

| Suite | Correctas |
|---|---:|
| V20 — Contratos | 114/114 |
| V21 — Compatibilidad SQL/API | 25/25 |
| V22 — Migraciones en memoria | 20/20 |
| V23 — Seguridad multiempresa ficticia | 81/81 |
| V24 — Auditoría ficticia | 70/70 |
| V25 — Integración | 91/91 |
| V26 — Preparación técnica | 91/91 |
| V26 — Diagnóstico CLI | 11/11 |
| V27 — Ciclo de propuestas | 213/213 |
| V28 — Casos límite | 105/105 |
| V29 — Contratos de backend | 341/341 |
| V30 — Eventos y notificaciones | 119/119 |
| V31 — Observabilidad | 173/173 |
| **V32 — Fallos combinados** | **158/158** |
| **Total evaluado en esta sesión** | **1.612/1.612** |

Se corrigió en el propio inspector una validación que exigía redundante `input.delivery` en vez de usar `rehearsal.snapshot()`, y se ajustó la referencia al campo `status` de V20 antes de la ejecución exitosa. Durante la regresión V20 un arnés de lectura omitió un archivo de prueba V14; se volvió a ejecutar con todas sus dependencias y pasó **114/114**. Se documentan estos ajustes para diferenciar errores de los tests de errores de un sistema real.

### Reproducción local opcional

```powershell
node apps/mg-web-studio-cloud/tests/flow-integrity-v32.test.cjs
node apps/mg-web-studio-cloud/tests/outbox-reconciliation-v30.test.cjs
node apps/mg-web-studio-cloud/tests/observability-v31.test.cjs
node apps/mg-web-studio-cloud/staging/v26-preflight.cjs
```

El preflight V26 mantiene `NO GO` (exit code 2 esperado con inventario válido).

## 6. Lo que falta antes de cualquier entorno real

1. Autorizar explícitamente proveedor, región, proyecto segregado, plan, presupuesto, responsables y alcance; **ningún archivo JSON constituye esa autorización**.
2. Resolver las incompatibilidades SQL/API de estados y Home, redactar migración versionada con rollback e historial protegido.
3. Implementar servidor con identidad comprobada, MFA real, revocación y pertenencia tenant/sitio derivada de la sesión.
4. Construir **una única transacción PostgreSQL** para propuesta, versión, auditoría, operación idempotente y outbox; probar CAS y concurrencia.
5. Derivar planes de notificación del estado de negocio confiable, sin permitir que un cliente indique libremente destinatarios.
6. Implementar controles de RLS/GRANT/SECURITY DEFINER, pruebas con sesiones reales, auditoría privada separada y protección criptográfica.
7. Diseñar workers con fencing, consumo idempotente, DLQ protegida, conciliación frente a una fuente transaccional completa y recuperación de fallas sin reenvíos.
8. Ejecutar en entorno autorizado pruebas reales de navegador, múltiples procesos, base de datos, backups/restauración y respuesta a incidentes.
9. Exigir autorización independiente antes de activar cobros, IA paga o producción.

## 7. Siguiente etapa

**V33 — Matriz maestra de pendientes y criterios de salida por módulos**. Priorizar los bloqueos acumulados V13–V32 para detener la expansión infinita de simuladores, preparar una secuencia de implementación verificable y decidir qué puede cerrarse por GitHub y qué requiere permisos/infraestructura. Solo lectura, sin gastos.

**Restricciones conservadas:** rama `main` intacta, sin SQL ejecutado, Supabase sin cambios, Lovable sin uso, ninguna publicación, mensajes externos, IA paga, cobros o cambios en otros proyectos.
