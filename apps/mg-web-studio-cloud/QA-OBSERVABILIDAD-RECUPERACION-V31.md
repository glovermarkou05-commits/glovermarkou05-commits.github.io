# MG WEB STUDIO CLOUD — V31 | Observabilidad, alertas y recuperación de eventos

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Dictamen:** **PASS estático / memoria; NO GO para staging, SQL, backend real, alertas externas y producción**.

## 1. Revisión previa, sin duplicación

Se revisó `shared/mg-outbox-reconciliation-v30.js` y su QA, el contrato V29 y el manifiesto `staging/v30-outbox-delivery.review.json`. V30 ya simula eventos, notificaciones, reintentos, leases, dead letter y conciliación, pero no proporciona análisis agregado de backlog/antigüedad, comparación de checkpoints ni plan de respuesta. V31 aporta **un analizador separado y de solo lectura** que usa el estado de V30 sin mutarlo ni conectarse a proveedores.

Se preservaron V14–V30, los SQL de revisión, los manifiestos V18/V28/V29/V30, `main` y otros productos. No se creó ningún servidor, cron, cola externa, worker ni notificador.

## 2. Archivos V31

- `shared/mg-observability-v31.js`: `summarize(rehearsal, now, thresholds)` produce métricas **agregadas**, anomalías y un plan de investigación manual a partir de `snapshot()` y `reconcile()` del simulador V30. `compare(previous, current)` examina regresiones entre snapshots (eventos desaparecidos, reversiones de lectura/entrega, intentos que retroceden, timestamps e identidades cambiadas). `inspectPlan(document)` rechaza permisos de despliegue, cobro, envío externo, cron y declaraciones de pruebas reales falsificadas.
- `staging/v31-observability.review.json`: contrato de monitoreo y recuperación **NO EJECUTABLE**: métricas agregadas, sin PII, umbrales ficticios, 20 condiciones futuras en `NOT_EXECUTED` y estado `NO_GO`.
- `tests/observability-v31.test.cjs`: 173 comprobaciones con objetos ficticios V23/V24/V30, casos adversos y alteraciones de la configuración.
- `QA-OBSERVABILIDAD-RECUPERACION-V31.md`: este informe.

## 3. Controles de observabilidad en simulación

| Condición | Respuesta de la revisión estática |
|---|---|
| `STALE_PENDING` | Contar eventos `pending` cuya antigüedad ficticia supera el umbral |
| `OVERDUE_RETRY` | Contar reintentos vencidos |
| `EXPIRED_LEASE` | Señalar reservas vencidas sin recuperarlas automáticamente |
| `DEAD_LETTER` | Alertar entregas agotadas; revisión manual restringida |
| `BACKLOG_LIMIT` | Alertar cola simulada superior al umbral configurado |
| `RECONCILIATION_MISMATCH` | Señalar inconsistencias halladas por el validador V30 |
| `AGE_IN_FUTURE` | Señalar desviaciones temporales y validar relojes |
| Comparación de checkpoints | Detectar pérdida de eventos, retroceso de intentos y lecturas/entregas, alteración de ámbito o tiempo |

Las alertas son **objetos devueltos por una función**, no notificaciones enviadas a alguien. Sus campos exponen solo `code`, `severity` y `count`; nunca identificadores de organización, destinatarios, tokens ni contenido de propuestas. Las recomendaciones (`recoveryPlan`) son únicamente instrucciones de revisión y **no ejecutan acciones**.

Los umbrales (`pendingAge=30`, `retryOverdue=20`, `backlogLimit=3`) representan unidades ficticias, **no minutos aprobados ni SLA operativo**. La priorización real, alertas, retención, on-call, deduplicación y límites deberán decidirse con autorizaciones, infraestructura y observación legítimas.

### Limitaciones importantes

- Este analizador no comprueba eventos que **nunca ingresaron al outbox** si tampoco existe una fuente externa duradera para comparar. El reconciliador V30 verifica la coherencia entre eventos observados y referencias ficticias suministradas, pero no demuestra completitud frente a toda transacción real.
- La suma de comprobación V24 no es criptográfica; la comparación de snapshots no detecta una manipulación coordinada de todos los datos ni aporta inmutabilidad.
- Las transiciones V27 y el outbox V30 están separados en memoria: no existe una transacción ACID que garantice el evento junto a la propuesta.
- El simulador V30 usa reservas y tokens predecibles; no prueba fencing, competencia multiproceso, entrega externa, deduplicación en proveedor ni recuperación tras reinicio real.
- No se puede mostrar un dashboard real, SLA, alerta en Slack/correo o notificación móvil como implementado porque **ninguno existe** en V31.
- Las 20 condiciones de V31 y las 18 de V30 permanecen **NOT_EXECUTED**; tampoco se modificaron las 30 V28 ni las 16 precondiciones V18 pendientes.

## 4. QA efectivamente ejecutado

Los archivos fueron leídos de GitHub y evaluados en un arnés JavaScript con sustitutos de `node:fs`, `node:path` y `node:assert/strict`. No hubo proceso Node del usuario, SQL, red del proyecto, Supabase, PostgreSQL, workers, servicios de correo ni publicación.

| Suite | Comprobaciones |
|---|---:|
| V20 — Contratos | 114/114 |
| V21 — SQL/API | 25/25 |
| V22 — Migración simulada | 20/20 |
| V23 — Permisos | 81/81 |
| V24 — Auditoría ficticia | 70/70 |
| V25 — Integración | 91/91 |
| V26 — Preparación técnica | 91/91 |
| V26 — CLI de solo lectura | 11/11 |
| V27 — Ciclo de propuestas | 213/213 |
| V28 — Casos límite | 105/105 |
| V29 — Contratos backend | 341/341 |
| V30 — Eventos y notificaciones | 119/119 |
| **V31 — Observabilidad y respuesta** | **173/173** |
| **Total evaluado en esta sesión** | **1.454/1.454** |

En la primera ejecución de la suite V31 se encontró un identificador local declarado dos veces en el propio archivo de tests. Se corrigió y la suite completa pasó **173/173**, sin modificación de datos reales. Una ejecución anterior de V30 en esta sesión falló por un archivo de fixture omitido en el arnés; se recuperó el manifiesto y la repetición final pasó **119/119**. Estos errores del arnés no demuestran un fallo del backend real ni se ocultan en el informe.

Las 1.454 son comprobaciones **de diseño, simulación y regresión**, no pruebas de seguridad reales de un servidor.

## 5. Criterios de la futura implementación

1. Fuente de datos duradera: cambios de propuesta, outbox, recibos e auditoría deben confirmarse juntos en PostgreSQL dentro de la misma transacción.
2. Monitor operativo real con identidad de servicio propia, permisos mínimos y datos agregados; ninguna métrica identificable en la respuesta pública.
3. Alertas con deduplicación, rate limiting, reloj confiable, asignación on-call, umbrales calibrados y trazabilidad de incidentes.
4. Recuperación de colas con fencing persistente, DLQ protegida, reintentos idempotentes, proveedor verificado y autorización manual para reparaciones críticas.
5. Reconcilador contra fuente transaccional completa y paginada, con indicadores de eventos ausentes, no solo mensajes observados.
6. Revalidación de destinatarios, empresa y sitio justo antes de entregar; bloquear filtración cruzada.
7. Pruebas de fallos de red, reinicios, envío duplicado, colas concurrentes, restauración y auditoría criptográficamente verificable.
8. Aprobar proveedor, región, plan, presupuesto y acceso antes de probar un entorno aislado; **producción requiere una autorización independiente**.

## 6. Reproducción local opcional

```powershell
node apps/mg-web-studio-cloud/tests/observability-v31.test.cjs
node apps/mg-web-studio-cloud/tests/outbox-reconciliation-v30.test.cjs
node apps/mg-web-studio-cloud/staging/v26-preflight.cjs
```

El preflight V26 mantiene `NO GO` y devuelve código 2 cuando el inventario es válido, por diseño.

## 7. Próxima etapa

**V32 — Integridad de flujos y cobertura de fallos combinados**: matriz de escenarios adversos de propuesta + auditoría + outbox + monitoreo, con evaluación solo estática/memoria y revisión documental de la futura atomicidad transaccional. No se creará ni activará infraestructura.

**Restricciones conservadas:** sin créditos Lovable, sin SQL ejecutado, sin modificar Supabase ni `main`, sin publicación, IA pagada, cobros, cron, correos reales ni cambios en otros proyectos.
