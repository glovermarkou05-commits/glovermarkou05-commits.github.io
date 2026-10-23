# MG WEB STUDIO CLOUD — V73 | Límites, cancelación y protección de proveedores

**Rama:** `feature/mg-digital-v5-web-services`  
**Fecha:** 23/10/2026  
**Estado:** controles implementados y probados con JWT y respuestas sintéticas. **NO GO** para Supabase Auth, PostgreSQL real, HTTP publicado, STAGING y producción.

## Entregables

- `server/bounded-provider-v73.cjs`: exporta `createBoundedProviderV73({run,maxConcurrent?,timeoutMs?,failureThreshold?,cooldownMs?,nowMs?,onAudit?})`. Ejecuta callbacks **de solo lectura** de servidor; no incorpora clientes de red o base de datos. Retorna `execute(input)` y `status()`.
- `server/resilient-session-verifier-v73.cjs`: exporta `createResilientSessionVerifierV73({issuer,audience,loadPublicKeys,checkSession,...})`. Une las protecciones con V72 → V71 → V60–V69. Las dependencias se inyectan: `loadPublicKeys({signal})` y `checkSession({sessionId,subject},{signal})`. **No** son consultas reales a Supabase, JWKS o PostgreSQL.
- `tests/bounded-provider-v73.test.cjs`: 20 pruebas unitarias.
- `tests/resilient-session-integration-v73.test.cjs`: 14 pruebas de JWT ES256 firmado localmente y cadena de permisos original con datos sintéticos.
- `.github/workflows/mg-web-studio-v73-offline-providers.yml`: CI aislada, repositorio de solo lectura y credenciales no persistentes.

## Reglas de seguridad

**Deadline y cancelación:** `timeoutMs` determina cuándo devolver `null` y emitir una señal de cancelación `AbortSignal`. Se deniega la autenticación si el proveedor falla, se bloquea o excede el plazo. La señal es **cooperativa**: un proveedor que la ignore **puede seguir trabajando**. Por ello, una solicitud vencida **conserva su cupo de concurrencia hasta que la operación subyacente termine de verdad**; no se acepta un crecimiento ilimitado de trabajos atrasados.

**Capacidad:** no se forma ninguna cola ilimitada. Si `active >= maxConcurrent`, el nuevo intento se rechaza inmediatamente. Los límites generales de laboratorio son 8 concurrentes, 500 ms por solicitud, 3 fallos consecutivos y enfriamiento de 1000 ms. La composición V73 configura por defecto 1 carga concurrente de claves y 8 comprobaciones de sesión. Se validan rangos: concurrencia 1–128, timeout 10–30 000 ms, umbral de fallos 1–10, enfriamiento 100–300 000 ms. Estos valores **no son una política de producción**.

**Circuit breaker:** tras fallos repetidos se abre el circuito, se deniegan solicitudes durante el enfriamiento y solo se admite una prueba de recuperación al vencer el intervalo. Si tiene éxito se cierra; si falla se reabre. Un contador de generación impide que una respuesta antigua de una solicitud anterior a la apertura del circuito vuelva a autorizar una petición o cierre el circuito. Fallos de reloj monotónico, `null`, `undefined` y excepciones deniegan el acceso.

**Privacidad de observabilidad:** el evento del presupuesto incluye solamente `{event,active,circuit}`. El adaptador agrega un `provider` fijo `keys` o `session`. No se transmiten a auditoría tokens, identidad, `session_id`, claves, IP, consultas SQL ni errores del proveedor. Los fallos del callback de observabilidad no conceden autorización.

## Pruebas reales ejecutadas en Node.js, proveedores simulados

**Evidencia GitHub Actions:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39971761853

**Run ID:** `39971761853`; **Job ID:** `120475994301`; **commit comprobado:** `8e135c8d26ef20fa4abdef4a5f691d01024e36cb`; Node.js **v22.23.3**, Linux. Conclusión `completed / success`.

| Bloque de pruebas | Correctas | Fallidas |
| --- | ---: | ---: |
| V73 presupuestos, sesiones, expiración y cadena original | **34/34** | **0** |
| V72 rotación y revocación sintéticas | **28/28** | **0** |
| V71 JWT firmado y comprobaciones criptográficas | **44/44** | **0** |
| V70 siete suites nativas de regresión | **92/92** | **0** |
| **Tests ejecutados** | **198/198** | **0** |

Estas cifras representan **pruebas ejecutadas**, no controles de seguridad independientes; parte de las regresiones se solapa. Los **32 controles operativos de V67 siguen PENDING**. Las pruebas emplean la precarga protectora V70 de APIs Node; **no es una jaula de red del sistema operativo**. GitHub Actions utiliza red para descargar el repositorio/configurar Node antes de las pruebas; el backend de pruebas no escucha ni se conecta a proveedores externos.

## Restricciones y riesgos pendientes

1. **No hay cancelación forzosa.** El proveedor debe respetar `AbortSignal`; un callback que nunca termina puede retener capacidad y causar indisponibilidad. Antes de operar son imprescindibles límites del driver de base de datos, conexiones, tiempos de consulta, reinicio supervisado y pruebas de fallos con los sistemas auténticos.
2. **Callbacks exclusivamente de lectura e idempotentes.** Nunca utilizar este timeout superficial como mecanismo para cancelar escrituras, pagos o cambios de inventario; un trabajo subyacente podría completarse después de que el cliente reciba un rechazo.
3. **Circuit breaker por proceso**, sin coordinación entre réplicas. La caché y rotación V72 necesitan reglas de propagación de invalidaciones y una fuente JWKS confiable.
4. JWT ES256/RS256, MFA, sesiones autoritativas, expiración real, RLS, privilegios SQL, infraestructura TLS y restauración PostgreSQL 17 siguen sin verificarse contra sistemas reales. Conviene auditar el parser JOSE y valorar una biblioteca mantenida antes de producción.
5. No se usaron credenciales de Supabase, no se ejecutó SQL ni migraciones, no se consumieron créditos Lovable y no se publicó. No se modificó ningún proyecto externo ni rama principal.

## Continuidad — V74

Preparar en **modo aislado** el contrato de integración de autenticación real: JWKS de origen controlado, rotación, revocación autoritativa de sesiones, tiempos máximos del cliente y aislamiento del tenant. Requerir autorización explícita diferenciada antes de cualquier acceso a Supabase Auth o STAGING.

**Dictamen:** V73 implementada, integración nativa y regresiones **198/198 PASS** con dependencias sintéticas. Producción y acceso externo: **NO GO**.
