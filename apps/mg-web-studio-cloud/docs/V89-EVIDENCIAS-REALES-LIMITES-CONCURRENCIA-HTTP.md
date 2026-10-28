# MG WEB STUDIO CLOUD — V89 | Evidencia real de concurrencia y presupuestos HTTP acotados

**Fecha Ecuador:** 28 de octubre de 2026 (ejecución registrada en UTC el 28/10/2026)  
**Rama exclusiva:** `feature/mg-digital-v5-web-services`  
**Autorización explícita:** pruebas V89 reales pequeñas sobre la interfaz HTTP temporal `127.0.0.1` en GitHub Actions, sin pruebas de carga intensiva, servicios externos, bases reales, restauraciones ni despliegues.

## 1. Evidencia reproducible y comprobada

**Workflow exitoso:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40635697392  
**Job:** `122642024383`  
**Commit ejecutado:** `f7539aff735336d5ee5c7af06dfe60d3e3982f2c`  
**Estado:** `completed / success`.

- **16/16** pruebas automáticas de política y seguridad del ejecutor, **0 fallos**.
- **3/3** escenarios HTTP de pequeña escala ejecutados correctamente.
- **12 solicitudes HTTP de ensayo** en total, durante **1.193 ms** de ejecución de la batería, sin flood, concurrencia alta ni solicitudes externas.
- El código probado fue realmente `http-site-gate-v63.cjs`, `node-http-transport-v64.cjs`, `http-server-blueprint-v65.cjs` y `request-budget-v66.cjs`, montados en `http.createServer()` únicamente para el ensayo.
- Servidor vinculado exclusivamente a **`127.0.0.1`** (puerto aleatorio local); cada subescenario cierra todas sus conexiones, cierra el servidor y verifica que el listener desapareció.
- Identidad y autorización del backend eran solo **respuestas ficticias en memoria**; no hay JWT reales de proveedor, PostgreSQL, SQL, sesiones, BAZAR-ONLINE o Supabase en este workflow.

## 2. Resultados por control V67 (laboratorio, no aprobación formal)

| Código | Ensayo y configuración estrictamente acotados | Observación real | Interpretación |
| --- | --- | --- | --- |
| **LOAD-01** | `maxConcurrent=2`, `maxRequestsPerPeer=6`, dos solicitudes mantenidas, tercera rechazada, liberación y recuperación | **HTTP 503** bajo ocupación; dos previas **HTTP 200**; siguiente solicitud volvió a **HTTP 200**; `peakInFlight=2`, `socketPeak=3` | Muestra real satisface rechazo y recuperación de V66 en proceso |
| **LOAD-02** | 3 solicitudes admitidas desde el mismo par local, cuarta con `X-Forwarded-For` falsificado; ventana 1 s | **HTTP 429**, `Retry-After: 1`; ninguna derivación por cabecera falsificada; nueva solicitud **HTTP 200** después de ~1,1 s; `socketPeak=1` | Presupuesto por par de socket comprobado en un solo proceso |
| **LOAD-03** | Solo 3 solicitudes simultáneas, tope de 4 sockets y 2 peticiones en curso, delta RSS tomado en una muestra | `socketPeak=3`, `peakInFlight=2`, `activeAfter=0`, sin sockets residuales, `rssIncreaseMiB=0` (redondeado) | **Evidencia parcial**: NO demuestra memoria acotada a largo plazo, fuga cero ni límite de trabajo SQL real |

El script valida un máximo de 4 sockets y hasta 2 peticiones en curso por subescenario, lectura de respuesta máxima de 2.048 bytes, vencimiento de cliente de 3 segundos, vencimiento global de 19 segundos y que el delta de RAM de la muestra sea inferior a 64 MiB. Estos valores son límites del **ensayo**, no pruebas de capacidad máxima del producto ni métricas comerciales de rendimiento.

La prueba de `X-Forwarded-For` solo verifica que el servidor Node usa el **par de socket directo** según V66, sin aceptar la identidad falsificada. No existe un proxy inverso, sistema distribuido de cuotas, balanceador ni firewall público en este ensayo.

## 3. Archivos entregados y verificados

- `scripts/run-v89-bounded-loopback-load.cjs`: ensamblaje HTTP V63–V66 con cuotas de prueba explícitas, 12 peticiones reales a loopback, comprobaciones de respuesta y memoria, cierre seguro, reporte de solo resultados.
- `tests/v89-bounded-loopback-load-contract.test.cjs`: **16 contratos** que bloquean contexto no autorizado y controlan alcance, límites, solicitudes sin destinos arbitrarios y limpieza.
- `.github/workflows/mg-web-studio-v89-bounded-loopback-load.yml`: workflow que corre **solo** en `feature/mg-digital-v5-web-services` con `contents:read` y `persist-credentials:false`; primero ensaya los contratos sin red bajo `native-network-guard-v70.cjs`, luego ejecuta las solicitudes limitadas a `127.0.0.1`.
- `docs/V89-EVIDENCIAS-REALES-LIMITES-CONCURRENCIA-HTTP.md`: este informe.

## 4. Garantías, restricciones y estado V67

- **Proyectos del usuario protegidos:** BAZAR-ONLINE, FINZY, Supabase real, Lovable y Docker de Windows **no fueron conectados ni modificados**.
- **Sin despliegue:** no se trabajó en `main`, no se abrieron puertos públicos, no se publicó MG WEB STUDIO CLOUD.
- **Sin tests de estrés:** el volumen fue deliberadamente mínimo y manualmente acotado; no se evaluó tráfico distribuido ni escalabilidad.
- **Sin certificación formal:** LOAD-01/02 reciben observaciones operativas reales del control V66, LOAD-03 una observación **parcial**. La revisión completa de `LOAD-03` exige carga y monitorización supervisadas, métricas de recursos durante un intervalo más representativo y verificar que ningún trabajo SQL/cola pueda acumularse.
- **Estado canónico V67:** **32 pendientes; 0 PASS con verificación independiente**. Ninguna evidencia ni permiso de producción se ha inventado o modificado.

## 5. Qué falta para cerrar el proyecto

1. **Recuperación y respaldo:** autorización separada para crear **una copia de respaldo de datos 100% ficticios en PostgreSQL 17**, restaurarla exclusivamente a un destino PG17 desechable y comparar contenido, estructura, roles, permisos y políticas. No conectarse a ninguna base real.
2. **Revisión independiente:** formalización de evidencias HTTP, AUTH, DATA y LOAD, incluyendo límites del proxy/TLS, políticas de registros y operación, y 32 controles V67.
3. **Producción:** solo después de la verificación formal completa, aprobación del plan de reversión, MFA/configuración reales y autorización explícita independiente del usuario.

**Siguiente etapa recomendada:** **V90 recuperación sintética** (PG17 backup/restore aislado), que requiere autorización nueva y específica. Hasta entonces, `restore` permanece `PENDING` y el producto mantiene `NO_GO`.
