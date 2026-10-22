# MG WEB STUDIO CLOUD — V67 | Matriz de verificación HTTP, observabilidad y recuperación

**Rama:** `feature/mg-digital-v5-web-services`  
**Alcance:** preparar evidencia y criterios de seguridad para un laboratorio futuro; **no** abrir puertos, ejecutar SQL, conectar Supabase, modificar STAGING, restaurar o publicar.  
**Decisión:** **NO GO** para conexión real, entorno productivo y publicación.

## Qué se implementó

- `server/security-acceptance-v67.cjs`: catálogo cerrado de **32 verificaciones** y validador local `assessV67Evidence(...)`. Se trata de un **inventario**, no de un ejecutor HTTP, scanner de red ni verificador criptográfico.
- `tests/security-acceptance-v67.test.cjs` y `tests/v67-evidence-template.test.cjs`: prueban integridad del catálogo, esquema de evidencias, fallos cerrados y ausencia de aprobación implícita.
- `docs/V67-EVIDENCIAS-PENDIENTES.json`: registro inicial, con **32 casos PENDING**, sin resultados simulados presentados como reales.

Los resultados autodeclarados `PASS` son **declaraciones sin verificar**; incluso si los 32 elementos se marcan PASS y tienen referencias formalmente válidas, el código sigue devolviendo `evidenceIndependentlyVerified=false`, `labAuthorized=false`, `deploymentAuthorized=false` y `decision=NO_GO`. Ninguna ruta del código V67 inicia escucha, ejecución SQL, proceso de restauración ni despliegue.

## Matriz de aceptación — ejecución real pendiente

| ID | Control a verificar | Fuente de evidencia requerida | Criterio esperado |
|---|---|---|---|
| HTTP-01 | Valid HTTP/1.1 GET passes through the real parser to V63 | Solicitud HTTP real en laboratorio autorizado | 200 and public-only JSON |
| HTTP-02 | Mixed-case duplicate Authorization headers are rejected | Solicitud HTTP real en laboratorio autorizado | No authorization call; generic rejection |
| HTTP-03 | Duplicate Content-Length is rejected | Solicitud HTTP real en laboratorio autorizado | No authorization call or smuggling |
| HTTP-04 | Transfer-Encoding and Content-Length framing ambiguity is rejected | Solicitud HTTP real en laboratorio autorizado | No route processing or smuggling |
| HTTP-05 | Invalid header token and control bytes are rejected | Solicitud HTTP real en laboratorio autorizado | No route processing or information leak |
| HTTP-06 | Header limit is enforced by the real Node parser and proxy | Solicitud HTTP real en laboratorio autorizado | 431 or connection closure; no processing |
| HTTP-07 | Missing/duplicate Host cannot bypass HTTP/1.1 routing | Solicitud HTTP real en laboratorio autorizado | Safe rejection without authority call |
| HTTP-08 | Encoded path, query, fragment and absolute-form target are not accepted | Solicitud HTTP real en laboratorio autorizado | 404 or 414 without authority call |
| HTTP-09 | GET body and disallowed transfer framing are rejected | Solicitud HTTP real en laboratorio autorizado | 400/413; no authorization |
| HTTP-10 | Half-open and slow-header requests are bounded | Solicitud HTTP real en laboratorio autorizado | Timeout or socket close; no resource leak |
| HTTP-11 | Expect 100-continue receives safe rejection | Solicitud HTTP real en laboratorio autorizado | 417 without body or authority |
| HTTP-12 | Upgrade/CONNECT attempts cannot establish a tunnel | Solicitud HTTP real en laboratorio autorizado | Socket refused; no tunnel |
| HTTP-13 | Invalid request-line and parser errors have sanitized responses | Solicitud HTTP real en laboratorio autorizado | 400 or close; no packet reflected |
| HTTP-14 | Proxy handling does not trust spoofed forwarding headers | Solicitud HTTP real en laboratorio autorizado | Peer admission identity from trusted ingress only |
| LOAD-01 | Global in-flight requests remain bounded | Solicitud HTTP real en laboratorio autorizado | 503 while busy and recovery after release |
| LOAD-02 | Peer request budgets apply across repeated requests | Solicitud HTTP real en laboratorio autorizado | 429 with bounded retry and no bypass |
| LOAD-03 | Connection count, memory and work backlog stay bounded | Solicitud HTTP real en laboratorio autorizado | No unbounded sockets, memory or SQL jobs |
| OBS-01 | No token, headers, payloads, SQL, IP or user identity in logs | Política / acta revisada | Redacted storage and controlled sampling |
| OBS-02 | Denials and failures have safe cross-layer correlation | Política / acta revisada | Non-sensitive request ID and controlled error labels |
| OBS-03 | Retention, encryption, access and deletion are reviewed | Política / acta revisada | Signed retention and access policy |
| OBS-04 | Incident escalation and security alert thresholds are defined | Política / acta revisada | Reviewed runbook with owner and threshold |
| AUTH-01 | Real access-token cryptographic verification and revocation | Identidad / MFA reales de prueba | Issuer/audience/expiry/session policy checked |
| AUTH-02 | Cross-tenant and site scope protections under real identities | Identidad / MFA reales de prueba | 404/403 with no foreign data or writes |
| AUTH-03 | MFA and elevated staff operations use server-verified claims | Identidad / MFA reales de prueba | No browser-supplied privilege accepted |
| DATA-01 | Effective grants and RLS for actual backend database roles | PostgreSQL real en entorno autorizado | No service_role exposure or privilege bypass |
| DATA-02 | Transactional authorization and cancellation under timeout | PostgreSQL real en entorno autorizado | No stale writes or leaked jobs |
| REC-01 | PostgreSQL 17 dump is restored to an isolated destination | Copia restaurada en entorno aislado | No writes to STAGING or production |
| REC-02 | Restore preserves schemas, counts, indexes, policies and extensions | Copia restaurada en entorno aislado | Recorded comparison of origin and restored copy |
| REC-03 | V53 security tests pass against isolated restored database | Copia restaurada en entorno aislado | Captured test run and failed-case details |
| REC-04 | Measured RPO/RTO, encryption and retention policy reviewed | Copia restaurada en entorno aislado | Measured times and approved backup lifecycle |
| OPS-01 | Lab interface/port, TLS, scope and firewall are explicitly approved | Aprobación explícita separada | Separate explicit authorization before any listen |
| OPS-02 | Production change window and rollback approval exist | Aprobación explícita separada | Separate explicit authorization before deploy |

## Protocolo de prueba del parser HTTP (todavía no ejecutado)

**Condición previa obligatoria:** decidir y autorizar por separado equipo/laboratorio, interfaz de escucha (preferir loopback local), puerto específico, versiones de Node, proxy inverso si corresponde, TLS/certificado, firewall, límites de carga, credenciales **sintéticas** y modo de registrar la evidencia. Sin esos datos, no abrir conexiones TCP ni ejecutar peticiones HTTP. Una instancia `http.Server` construida sin `listen()` no es una prueba de parser real.
1. Capturar versión de Node, versión/configuración del proxy, red aislada y valor de los límites de V63, V64, V65 y V66 sin secretos. Registrar cada comprobación como un caso individual.
2. Ejecutar primero GET válido y comprobar respuesta `200` con cuerpo mínimo y cabeceras `no-store`/`nosniff`; **el autenticador en prueba debe comprobar un token real de prueba o simulado de forma explícita**, sin confundirlos.
3. Ejecutar entradas malformadas: Authorization y Content-Length duplicadas, mezcla Content-Length/Transfer-Encoding, Host ausente/duplicado, caracteres de control, cabeceras grandes, ruta codificada, body GET, request-line corrupta. Resultado válido para paquetes no parseables: 400/431 u **socket cerrado**, siempre que no se llame a la autorización, no haya filtración y no quede trabajo activo. No asumir que todos estos casos producen exactamente el mismo HTTP status en todas las versiones o proxies.
4. Verificar solicitudes incompletas, timeout de cabeceras, upgrades WebSocket, CONNECT, expectativas y límites de socket; registrar que los rechazos no permitan trabajo de aplicación o túneles.
5. Someter el sistema de laboratorio a concurrencia/rate limit **controlados**: demostrar 429/503, consumo acotado de memoria y recuperación al bajar la presión, sin ejecutar pruebas destructivas o de inundación en redes externas.
6. Ejecutar pruebas **por separado** de JWT real, revocación, MFA, permisos multiempresa y RLS. Las pruebas del parser no sustituyen identidad ni permisos de base de datos.

## Protocolo de observabilidad

Fuente V66: el callback `observe` emite únicamente `{event,status,durationBucketMs}`; los valores son de naturaleza agregada y no existe persistencia ni alerta actualmente. Antes de habilitar registros duraderos:
- Definir propietario operativo, protección de acceso por roles, cifrado, retención, eliminación y tratamiento de incidentes. Evitar tokens, cuerpo HTTP, cookies, rutas con datos personales, IP, userId, SQL, cadenas de conexión y trazas completas.
- Comprobar eventos de admisión, denegación 401/403/404/429/503, errores del parser y fallo de DB de prueba. Correlacionar mediante IDs seguros generados en el servidor; V66 todavía usa `unavailable` en rechazos por capacidad.
- Configurar alertas y responsabilidades concretas antes de operar; documentar falsos positivos, sobrecarga, pérdida de logs y no disponibilidad del colector.

## Recuperación: condiciones V58/V59 vigentes

No se ejecutó dump/restauración. El último dato reportado del PC Windows era **2,6 GB libres en C:**, por lo que el ejercicio local fue pospuesto; ese valor **no es una medición de hoy**. Antes de iniciar, verificar espacio, herramienta y destino; conservar las credenciales fuera del chat y GitHub, y el backup cifrado fuera del repositorio.
El ensayo futuro, con autorización diferenciada, deberá:
- Obtener un backup válido de un origen autorizado y **restaurarlo solamente en un PostgreSQL 17 aislado**, sin escribir en STAGING o producción.
- Comparar `public`, `mg_private`, constraints, índices, políticas RLS, grants, extensiones, migraciones y conteos de filas antes/después.
- Ejecutar las pruebas V53 sobre la copia restaurada y documentar resultados con evidencia real, no solo el historial de V53.
- Medir duración y RPO/RTO, definir retención, cifrado, responsables y procedimiento de reversión.

## Evidencia y firmas de revisión

El validador permite exclusivamente registros `{id,outcome,kind,evidenceRef}` donde `outcome` es `PASS`, `FAIL` o `BLOCKED`, `kind` coincide con la fuente esperada y `evidenceRef` sigue un nombre relativo seguro, como `evidence/v67/HTTP-01.json`. El repositorio **no contiene ni exige que se inventen esos archivos**. El validador no abre esos archivos ni verifica criptográficamente la evidencia.
Debe existir una **revisión humana o proceso confiable externo** que examine capturas/resultados, fecha, laboratorio, aprobación expresa, responsable y ausencia de credenciales. El JSON de estado se inicia como `PENDING`, no se debe cambiar a PASS por la mera existencia de documentación. Ninguna autodeclaración equivale a autorización para abrir un puerto, restaurar o desplegar.

## Validación local de V67

Desde `apps/mg-web-studio-cloud`:

```sh
node --test tests/security-acceptance-v67.test.cjs tests/v67-evidence-template.test.cjs
```

Estas suites validan **el inventario y las reglas de seguridad de evidencia**, no peticiones TCP, TLS, Auth real, RLS ni recuperación. Las pruebas previas V63–V66 siguen constando en sus propios informes y no se contabilizan como evidencia nueva de HTTP real.

## Próximo paso propuesto — V68

Preparar los artefactos reproducibles de laboratorio (harness para respuestas HTTP y auditoría de errores), **sin ejecutarlos por red ni habilitar listeners** hasta recibir autorización precisa de laboratorio e interfaz. En paralelo se puede avanzar con verificación de identidad aislada sin credenciales de producción.

**Conclusión:** V67 deja preparado el plan y la evidencia mínima; 32 verificaciones operativas continúan **PENDING**, incluidas recuperación, JWT y seguridad de red. **NO GO**.
