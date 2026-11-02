# MG Web Studio Cloud — V96 | Agregados efímeros de observabilidad

**Fecha:** 2 de noviembre de 2026 (Ecuador). **Estado:** CÓDIGO OPCIONAL + PRUEBAS OFFLINE / NO IMPLEMENTADO EN PRODUCCIÓN / NO FORMAL PASS.

## Objetivo y relación con V66

Se añadió `server/v96-private-observability.cjs` como callback optativo `observe` para el módulo existente `server/request-budget-v66.cjs`. **No se modificó V66 ni se activó V96 en V65, servidores, bases de datos, STAGING ni servicios reales.**

El callback recibe exclusivamente el objeto V66 con tres campos (`event`, `status`, `durationBucketMs`); descarta objetos con propiedades adicionales, incluso `ip`, `requestId`, `headers`, `token`, `path`, `userId`, `sql`. No conserva texto ni cuerpos originales.

## Implementación y cobertura

- Agrega eventos en **5 minutos** divididos en cinco ventanas de 60 segundos usando reloj monotónico; descarta ventanas vencidas y nunca persiste.
- Métricas disponibles: recuento de eventos de solicitudes, respuestas por familia 2xx/3xx/4xx/5xx, rechazos `429` y denegaciones de capacidad `503`.
- Para evitar dobles conteos, solo se cuentan eventos `completed` con estado HTTP válido y los rechazos directos `rate_limited`, `overloaded` y `peer_capacity`. Los eventos `admitted` y `transport_error` son observables, pero no se cuentan como solicitudes independientes.
- Limitación explícita: `transport_error` sin `completed` puede subcontarse. No constituye una métrica integral de tráfico real ni correlaciona capas.
- Umbrales propuestos **solo en simulación**: A1 cuando ≥5% de 5xx en una muestra ≥20 eventos, A2 cuando ≥10% de 429 en ≥20 eventos. A3 (falta de telemetría) permanece indeterminable sin confirmación independiente de tráfico.
- **No hay** servicio de alertas, propietarios asignados, envío de notificaciones, archivo de logs, retención, cifrado, base de datos, trabajo en segundo plano, puerto, red ni datos identificativos.
- La validación de `now()` acepta valores fraccionales de `performance.now()`, rechaza reloj inválido y muestras fuera de orden.

## Pruebas ejecutadas

- Workflow: https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41399447874
- Job: `125127855781`; estado `completed/success`.
- **V96 14/14 pruebas PASSED**, integridad V95 **15/15 PASSED**, 0 fallos.
- Node ejecutó ambas suites cargando el cortafuegos local `native-network-guard-v70.cjs`: rechaza TCP/UDP y evita conexiones de red.
- Pruebas: esquema estricto sin PII, congelación de resultados, expiración de ventanas, relojes fallidos, simulación de umbrales A1/A2, A3 indeterminable, no persistencia, integración sintética V66, denegación 429, regresión de 32 controles V67.
- Los SHA exactos y logs están en el run GitHub; las salidas no incluyen información privada de usuarios.

## Estado de observabilidad formal V67

| Control | Resultado V96 | ¿Formalmente aprobado? | Qué falta |
| --- | --- | --- | --- |
| OBS-01 | Contrato de evento acotado y contadores volátiles probados offline | **NO, PENDING** | Inspección en origen/destino real autorizado y revisión de minimización de datos |
| OBS-02 | Familia HTTP agregada; no se construye ni almacena ID de correlación | **NO, PENDING** | Correlación de 401/403/404/429/503 entre proxy, backend y sistema de logs final |
| OBS-03 | No hay persistencia ni tratamiento operacional de logs | **NO, PENDING** | Responsable, base legal, almacenamiento cifrado, acceso, retención, borrado y evidencia de implementación |
| OBS-04 | Dos señales simuladas, sin emisión ni motor de alertas | **NO, PENDING** | Aprobar umbrales, destinatarios, escalamiento y probar envío/acuse en entorno aprobado |

V95 conserva el estado canónico de **32 `PENDING`, cero `PASS`**, y la incidencia de revisión independiente [#8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) continúa sin asignar. El PR [#7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) sigue en borrador. **V94B no se ejecutó nuevamente y no se tocó producción.**

## Decisión y siguiente paso

V96 quedó listo como componente opcional para revisar; antes de su integración efectiva hay que seleccionar operador y sumidero de observabilidad, evaluar privacidad y seguridad, aprobar una arquitectura de correlación y obtener pruebas en un entorno autorizado. No añadir métricas basadas en IP ni emitir alarmas reales por una simulación de cinco minutos.

**GO de laboratorio offline V96; NO_GO producción/OBS formales.**
