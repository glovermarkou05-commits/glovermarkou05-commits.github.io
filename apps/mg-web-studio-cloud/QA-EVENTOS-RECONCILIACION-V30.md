# MG WEB STUDIO CLOUD — V30 | Eventos, notificaciones y reconciliación

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Dictamen:** **PASS en memoria y revisión estática; NO GO para staging, backend y producción.**

## 1. Alcance y revisión de componentes existentes

Se revisaron `shared/mg-transactional-api-v14-demo.js` (outbox, avisos y eventos virtuales), `shared/mg-v15-recovery-demo.js` (snapshots), `shared/mg-proposal-flow-v27.js` (las siete transiciones), y los contratos `shared/mg-backend-contract-v29.js` / `staging/v29-backend-contract.review.json`.

V14 ya simula mensajes y un outbox en el mismo snapshot de JavaScript. V30 **no reescribe V14, V27 o V29**. Introduce un modelo independiente, específicamente para reintentos, reservas, lectura de notificaciones y detección de anomalías. Se preserva la separación entre auditoría de negocio y auditoría privada de seguridad.

## 2. Archivos nuevos

- `shared/mg-outbox-reconciliation-v30.js`: simulador puro de estados de eventos `pending`, `leased`, `retry`, `dispatched`, `dead_letter`, con deduplicación por origen/tenant/objeto/destinatario; reintentos limitados y reservas caducables. Permite lectura simulada de notificaciones solo por destinatario autorizado y revalida scopes antes de confirmar una entrega. Proporciona `reconcile()` para identificar registros inconsistentes.
- `staging/v30-outbox-delivery.review.json`: especificación de **18 condiciones futuras**, todas `NOT_EXECUTED`, y banderas de ejecución desactivadas.
- `tests/outbox-reconciliation-v30.test.cjs`: casos de integración en memoria con transiciones V27 y auditoría V24.
- `QA-EVENTOS-RECONCILIACION-V30.md`: informe presente.

## 3. Qué verifica el simulador

| Función | Resultado en memoria |
|---|---|
| Fuente de eventos | Se exige recibo simulado de operación confirmada V27 y evento permitido en el historial V24 |
| Duplicados | No se crea una segunda notificación para la misma empresa/sitio/propuesta/evento/destinatario |
| Aislamiento tenant | Destinatarios ajenos a la empresa quedan rechazados |
| Permiso por sitio | EDITOR/VIEWER necesitan scope activo y un vínculo de empresa |
| Reserva de trabajo | Impide dos reservas simultáneas del mismo evento |
| Reintentos | Intervalos de 10 y 20 unidades ficticias de tiempo; máximo tres intentos |
| Entregas agotadas | Pasa a `dead_letter` sin fingir entrega al usuario |
| Falla de trabajador | Una reserva vencida se recupera en memoria y el token anterior se invalida |
| Revocación | Se revisa permiso de destinatario al encolar, reservar, confirmar y marcar lectura |
| Lectura de avisos | Solo el destinatario ficticio autorizado puede marcar un aviso ya entregado como leído |
| Conciliación | Detecta mensajes huérfanos, fuentes no confirmadas, duplicados y avisos ausentes |

**Importante:** el arnés de pruebas marca un evento como `dispatched` al recibir un éxito **ficticio**, sin ninguna comunicación real. `deliveryPerformed:false` es deliberado. Ni el recibo V27 ni el registro V24 constituyen evidencia criptográfica fiable.

## 4. QA ejecutado

Se recuperaron los archivos guardados en GitHub y se evaluaron usando JavaScript aislado con sustitutos de `fs`, `path` y `assert`. No se ejecutó un proceso Node del usuario, PostgreSQL, Supabase, un servidor HTTP, un worker, un navegador real, un sistema de correos ni un proveedor push.

| Suite ejecutada en esta sesión | Resultado |
|---|---:|
| V20 contratos | 114/114 |
| V21 SQL/API | 25/25 |
| V22 migraciones simuladas | 20/20 |
| V23 permisos | 81/81 |
| V24 auditoría | 70/70 |
| V25 integración | 91/91 |
| V26 preparación técnica | 91/91 |
| V26 preflight CLI | 11/11 |
| V27 ciclo de propuestas | 213/213 |
| V28 casos límite | 105/105 |
| V29 contratos backend | 341/341 |
| **V30 eventos y reconciliación** | **119/119** |
| **Total V20–V30 efectivamente ejecutado** | **1.281/1.281** |

**No** es cobertura integral de todas las suites V9–V19 ni de un despliegue real.

## 5. Brechas críticas pendientes

1. **No hay transacción ACID entre V27 y V30.** En V30 el encolado es una llamada separada que recibe un recibo y un evento de origen manipulables en la simulación. En producción debe ejecutarse en **la misma transacción SQL** del cambio de propuesta, auditoría y registro de idempotencia. Un recibo de memoria no autoriza enviar notificaciones.
2. **No existe envío real, ni garantía de entrega.** Se modelan las políticas de *at-least-once* pero no hay pruebas de red, caídas de workers, proveedor, rebotes, concurrencia multiproceso, deduplicación externa ni privacidad de mensajes.
3. **No existen tokens de reserva resistentes a falsificación.** Los tokens `lease_...` son determinísticos y controlables en el entorno ficticio; en el backend real deberán emitirlos y verificarlos procesos autorizados usando fencing y constraints, nunca el navegador.
4. **No hay entrega garantizada exactamente una vez.** El consumidor futuro debe manejar duplicados, reintentos y eventos fuera de orden. Una confirmación interna puede diferir de la entrega final al dispositivo.
5. **Acceso a notificaciones:** el backend deberá derivar el destinatario de datos verificados y volver a verificar pertenencia, sesión y scope. Cualquier mensaje recibido de un tenant no debe incluir secretos ni contenido privado por defecto.
6. **Reconciliación:** los hallazgos de V30 no corrigen datos automáticamente. En producción se necesita una fuente durable, auditoría separada, métricas, cola de fallos restringida, retención, revisión manual y recuperación sin duplicar mensajes.
7. **Estado SQL/API:** V19–V21 siguen identificando diferencias de Home y estados. V18 conserva 16 requisitos en `pending`; V28 conserva 30 escenarios `NOT_EXECUTED` y V30 suma 18 condiciones futuras `NOT_EXECUTED`.
8. **Costos y servicios:** no hay aprobación de proveedor, plan, región, límites, pagos, IA paga o envío de correos. Ninguna banderilla de JSON puede sustituir la aprobación humana.

## 6. Repetición local opcional

```powershell
node apps/mg-web-studio-cloud/tests/outbox-reconciliation-v30.test.cjs
node apps/mg-web-studio-cloud/tests/proposal-flow-v27.test.cjs
node apps/mg-web-studio-cloud/staging/v26-preflight.cjs
```

El preflight V26 devuelve código 2 cuando conserva NO GO; es un resultado esperado del diseño.

## 7. Próxima etapa propuesta

**V31 — Matriz de observabilidad, alertas y recuperación de eventos (solo diseño y simulación).** Verificar métricas de errores, alertas de entregas pendientes, controles contra reenvíos duplicados y recuperación segura, sin agregar cron, proveedores externos o despliegue.

**Restricciones cumplidas:** `main` sin cambios, sin Lovable, sin SQL, sin Supabase modificado, sin publicación ni servicios pagados; sin modificar FINZY, BAZAR ONLINE u otros productos.
