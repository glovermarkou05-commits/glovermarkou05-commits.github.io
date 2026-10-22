# MG WEB STUDIO CLOUD — V66 | Presupuestos de solicitudes y telemetría mínima

**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** módulo servidor aislado y pruebas con datos sintéticos; **sin** apertura de puertos, despliegue, conexión a Supabase, cambios SQL ni publicación. STAGING y producción permanecen **NO GO**.

## Resultado

Nuevo `server/request-budget-v66.cjs`: exporta `createRequestBudget({ serve, maxConcurrent, maxRequestsPerPeer, windowMs, maxPeers, now, observe })`. Es una capa de admisión que envuelve al transporte **V64** y se entrega a **V65** como función `serve(req,res)`. La puerta V63 conserva el control de autenticación/autorización.

**Orden previsto:** V65 HTTP blueprint → **V66 admisión** → V64 límites de flujo → V63 puerta de consulta → V61/V62 permisos/consultas → V60 verificación de identidad pendiente de integración real.

El módulo V66 **no** construye servidores, sockets, puertos, consultas, clientes de base de datos ni tareas programadas. La función `serve` es obligatoria, sin implementación permisiva por defecto.

## Límites de laboratorio

| Variable | Valor predeterminado | Efecto |
| --- | ---: | --- |
| `maxConcurrent` | 8 | Máximo de **solicitudes simultáneas en curso** por proceso, **no** máximo físico de sockets |
| `maxRequestsPerPeer` | 30 | Solicitudes por origen dentro de la ventana |
| `windowMs` | 60 000 ms | Ventana fija de un minuto |
| `maxPeers` | 256 | Cota de entradas de origen mantenidas en memoria |
| `now` | Reloj monotónico `performance.now()` | Control de ventanas y medición sin depender de la hora civil |
| `observe` | Función vacía | Telemetría **no persistente** hasta configurar un receptor seguro |

Los topes son validables al crear el módulo y no se deducen de cabeceras suministradas por el usuario. Estos **valores son ejemplos de laboratorio**, no una política final de capacidad o disponibilidad.

Para identificar un origen se utiliza exclusivamente `req.socket.remoteAddress` y `net.isIP`; **jamás** `X-Forwarded-For`, `X-Real-IP` ni cualquier cabecera cliente. Direcciones inexistentes/no válidas comparten un único grupo `unknown`, también sujeto a límites. El origen **no se incluye en observabilidad ni respuestas**. Detrás de un proxy, varias personas podrían compartir el mismo origen; no usar esta clave como identidad de cliente final sin un diseño de confianza de proxies.

**Denegaciones:** 429 `RATE_LIMITED` para exceso por origen, con `Retry-After` calculado desde la ventana; 503 `RETRY_LATER` para capacidad simultánea agotada, tabla de orígenes llena, fallo del reloj o excepción del transporte. Las respuestas contienen JSON mínimo, `no-store`, `nosniff` y `Connection: close`, sin copiar errores internos. Se rechaza crear una entrada nueva cuando `maxPeers` está lleno salvo que existan entradas caducadas sin solicitudes en curso. Una petición rechazada por carga global no consume cuota individual.

## Observabilidad segura

El callback `observe` recibe **exclusivamente** un objeto inmutable con tres campos:

```json
{"event":"completed","status":200,"durationBucketMs":10}
```

Los eventos están limitados a `admitted`, `rate_limited`, `overloaded`, `peer_capacity`, `completed` y `transport_error`. La duración se agrupa en intervalos aproximados (0, 10, 100, 1000 o 10000 ms), sin tiempo exacto ni cuerpo del mensaje. No se pasan IP, rutas, tokens, identidades, cabeceras, SQL ni excepciones. Los errores de `observe` no autorizan solicitudes ni derriban la función. **No existe envío ni almacenamiento de registros por defecto.**

## Pruebas realmente ejecutadas

Entorno local aislado de Node.js **v22.16.0**, sin listeners ni conexiones externas.

```sh
cd apps/mg-web-studio-cloud
node --test tests/request-budget-v66.test.cjs tests/request-budget-v66-integration.test.cjs
```

**V66: 34/34 correctas** (23 unitarias y 11 de integración sintética V66→V65→V64→V63). Cubren límites por origen, IP falsificada en X-Forwarded-For, origen desconocido, IPv4/IPv6, concurrencia, capacidad de memoria, caducidad, liberación de capacidad, errores de callbacks, doble escritura, privacidad de observabilidad, rechazo de cuerpos y métodos, acceso ajeno y respuestas sin credenciales.

También se ejecutó la batería local completa de V63–V66: **129/129 pruebas correctas**, cero fallos, con los archivos verificados de la rama para V63–V65. Una corrida preliminar incompleta carecía de dependencias locales del módulo V60: se incorporaron al laboratorio y se repitió la batería; la ejecución final pasó. **Estas cifras no representan pruebas de red, base de datos o JWT reales.**

## Restricciones y riesgos pendientes

1. **Proceso único.** Los contadores no se comparten entre instancias, procesos, contenedores o regiones. No son protección suficiente contra DDoS ni sustituyen límites del proxy, balanceador o infraestructura.
2. **Origen directo.** En presencia de proxy/NAT, varios clientes pueden compartir dirección y ser limitados conjuntamente. No confiar en `X-Forwarded-For` sin un modelo seguro de proxies y un control de autenticidad de extremo a extremo.
3. **Límite por solicitud, no por socket.** El máximo concurrente controla las llamadas V64 en curso. No determina el número real de conexiones TCP aceptadas ni la memoria consumida por la cola del parser HTTP. Siguen pendientes límites en la infraestructura y ensayos de carga real.
4. **Trabajo no cancelado.** V64 puede devolver 503 por timeout mientras una verificación de identidad o consulta PostgreSQL continúa en segundo plano. V66 libera su contador al terminar V64, **no cancela operaciones subyacentes**. El backend requiere tiempos máximos reales de consultas, cancelación y contención de recursos.
5. **Rate limiting por ventana fija.** El modelo presenta efectos de borde, consumo de memoria hasta `maxPeers` y potenciales denegaciones a orígenes legítimos; el tamaño y la política deben verificarse con métricas en un entorno autorizado.
6. **Observabilidad limitada intencionadamente.** No hay almacenamiento, alertas, integridad de logs, correlación persistente ni monitorización de seguridad independiente. El `requestId` de rechazos V66 es genérico (`unavailable`); deberá definirse una fuente de correlación segura antes de producción.
7. **Seguridad de identidad y datos no validada.** Falta la verificación criptográfica real de JWT, MFA, política de revocación, driver PostgreSQL seguro, RLS/grants efectivos, autorización de recursos concretos, transacciones y recuperación aislada comprobada.

**Nada en V66 modifica STAGING, producción, configuración de Lovable ni otros proyectos. No se ejecutó SQL, no se consumieron créditos, no hubo servicios de pago ni publicación.**

## Siguiente etapa propuesta: V67

Preparar la **matriz de pruebas del parser HTTP real y un plan de observabilidad/recuperación**, con criterios de aprobación y evidencia exigida. No realizar conexiones ni activar servidores hasta contar con autorización específica del destino de pruebas, interfaz, puerto, TLS y límites operativos.

## Archivos V66

- `server/request-budget-v66.cjs`
- `tests/request-budget-v66.test.cjs`
- `tests/request-budget-v66-integration.test.cjs`
- `docs/V66-PRESUPUESTOS-Y-OBSERVABILIDAD.md`

**Dictamen:** V66 completa a nivel de código y pruebas unitarias/simuladas. **NO GO** para autenticación real, HTTP publicado, STAGING, migraciones y producción.
