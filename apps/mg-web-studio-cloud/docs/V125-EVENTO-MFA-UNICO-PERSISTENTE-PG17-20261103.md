# MG Web Studio Cloud — V125: identidad MFA única por verificación y replay estable

**Fecha:** 2026-11-03 Ecuador (GitHub 2026-11-04 UTC). **Alcance:** PR #7 en borrador, exclusivamente laboratorio aislado.  
**Evidencia CI:** [GitHub Actions #41770325897](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41770325897), job `126378341574`, `completed/success`, **19/19 offline + 23/23 PostgreSQL 17 = 42/42 PASS**, 0 FAIL.

## Riesgo hallado y solución experimental

El evento MFA de V109/V121 se definía con **sujeto + sesión + método + timestamp en segundos**. Dos verificaciones TOTP/phone diferentes realizadas en un mismo segundo por la misma sesión podían generar **el mismo HMAC**: el segundo evento legítimo sería rechazado como duplicado. El identificador no debe ser suministrado por el cliente ni regenerado en cada reintento.

Nuevo componente backend **NO desplegado:** `server/v125-unique-verification-gateway.cjs`.

1. El llamador solo puede aportar `proofReference`, `action`, `organizationId` y `siteId`. La identidad `authenticatedSubject` y `authenticatedSessionId` procede de contexto confiable inyectado en backend.
2. `readTrustedVerifiedEvent` es el nuevo **contrato de un emisor confiable pendiente de implementación real**. Debe devolver un registro inmutable, enlazado a `proofReference` + sujeto + sesión, con titularidad del factor, procedencia verificada, método permitido y fechas recientes.
3. El emisor debe **crear y persistir una sola vez** un UUID v4 impredecible `eventId` **por verificación MFA exitosa**. Releer o reintentar **el mismo evento** debe devolver **el mismo ID**; dos verificaciones diferentes, aun en el mismo segundo, deben recibir **IDs distintos**. La implementación no confía en valores como `eventId` aportados en solicitudes cliente.
4. El HMAC de la clave global del evento usa el mensaje de dominio separado `mg-v125-mfa-event-v2|<eventId>`. No incluye timestamp, tenant, método, sujeto ni acción: modificar cualquiera de ellos **no** produce otra clave de consumo para el mismo identificador de emisión. Las verificaciones de vinculación usuario/sesión/método/procedencia siguen siendo **obligatorias antes** de derivar el HMAC.
5. `runAtomicOperation` reutiliza el contrato V119 insert-only y operación ficticia transaccional; la tabla PG17 actual recibe el mismo `event_key` hex SHA-256, sin necesitar migración real.
6. La salida **nunca** establece `productionAuthorized=true` ni concede aprobación V67; errores de proveedor, datos extra, prueba vencida o respuesta falsa bloquean en modo fail-closed.

## CI — pruebas reales de código con fixtures sintéticos

| Suite | Resultado | Evidencia |
| --- | --- | --- |
| V125 offline con red bloqueada | **19/19 PASS** | Identificadores distintos en el mismo segundo, repetición estable, versión v4, referencia/sesión/sujeto, vigencia, emisor no disponible, validación de HMAC y rechazo de claims cliente |
| V124+V125 en PostgreSQL 17 descartable | **23/23 PASS** | 17 escenarios previos + seis nuevos: dos eventos distintos mismo segundo, rechazo de replays entre tenants, misma ID por referencias distintas, 16 concurrencias, revocación antes del último check y rechazo de IDs no confiables |

El ensayo incluye lector Auth **no administrador** limitado a tres columnas de una tabla `auth.sessions` **ficticia**, y escritor no administrador separado con transacción de ledger y efecto empresarial **ficticio**. No se utilizó usuario, sesión o dato real de Supabase.

## Límites de seguridad: lo que V125 no demuestra

- **La propiedad de unicidad y persistencia del ID no está garantizada por una fuente real.** La función `readTrustedVerifiedEvent` es inyectada y los registros son sintéticos. Antes de QA: revisar quién emite el ID, el punto exacto tras verificación MFA genuina, la clave de unicidad de emisión en almacenamiento confiable, persistencia duradera, auditoría, carreras de múltiples nodos, reintentos y protección contra reminting por solicitud. Un UUID aleatorio enviado por cliente o generado en cada lectura es **inaceptable**.
- **El flujo V109/V121 conserva su fórmula anterior** para ensayos históricos. V125 es un protocolo nuevo explícito; cualquier endpoint futuro de operación sensible debe exigir la versión aprobada **sin permitir downgrade** al esquema por segundo.
- **La fuente de sesión Auth en V122 sigue siendo ficticia** en esta suite. Tampoco existe una comprobación linealizable de revocación entre última consulta y `COMMIT`.
- La operación empresarial es ficticia dentro de PostgreSQL: no hay garantía sobre efectos externos, cobros, envío de mensajes o bases de datos separadas.
- HMAC key de CI es pública/ficticia; backend real requerirá custodia/rotación de secretos, principal privado, TLS/PG pool, gestión de roles, trazabilidad y privacidad de datos.
- No se instaló esquema, lector, rol, permisos ni DDL en Supabase QA; no se publicó ni fusionó.

## Estado y próximos bloqueos

**V125 cerrada solo a nivel laboratorio: 42/42 PASS.** V95 sigue con **69% de cobertura técnica estimada / 31% pendiente**, sin recalificación. **V67 32 PENDING / 0 PASS, producción NO_GO**, PR #7 abierto, en borrador, no fusionado.

**Siguiente trabajo con mayor valor:** diseño y revisión independiente del servicio real que emite y conserva `eventId` por verificación, más el bloqueo explícito del protocolo antiguo para acciones protegidas. Requiere consentimiento delimitado y revisión DBA/Seguridad independiente para cualquier cambio de esquema o conexión a `MG WEB STUDIO AUTH QA`.
