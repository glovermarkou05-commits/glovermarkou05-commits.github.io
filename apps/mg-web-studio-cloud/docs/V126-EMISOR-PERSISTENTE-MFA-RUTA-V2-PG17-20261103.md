# MG Web Studio Cloud — V126: emisión persistente de MFA y ruta protegida V2 sin downgrade

**Corte:** 2026-11-03 (America/Guayaquil; los logs de GitHub son 2026-11-04 UTC).  
**PR:** [#7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7), **borrador, no fusionado**.  
**Prueba de integración final:** [GitHub Actions #41774038251](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41774038251), job `126390106523`, **25/25 PASS, 0 FAIL**, PostgreSQL 17 efímero en GitHub Actions.
**Estado:** `V126_LAB_PASS / QA_SQL_NOT_AUTHORIZED / PRODUCTION_NO_GO`.

## 1. Implementado

### Almacén de verificación duradera de laboratorio

`server/v126-durable-mfa-event-store.cjs` recibe dos pools de base de datos **separados**:
- `mg_v126_ci_issuer` — rol no administrador que puede **insertar y seleccionar**, pero **no actualizar ni borrar** eventos MFA;
- `mg_v126_ci_reader` — rol no administrador que **solo puede seleccionar** las columnas necesarias, sin INSERT/UPDATE/DELETE.

En CI existe exclusivamente el esquema privado ficticio `mg_v126_fictional.verified_mfa_events` con **RLS forzado** y `receipt_id` UUID como clave primaria, `proof_reference` único y `event_id` generado y almacenado una sola vez mediante `pg_catalog.gen_random_uuid()`.

`recordVerifiedOnce` solicita confirmación a `confirmAuthenticMfaReceipt`, que **es un proveedor sintético, no una integración Auth real**. Debe representar un recibo de verificación exitoso, auténtico e inmutable, con `receiptId`, `proofReference`, `subject`, `sessionId`, método, fecha y prueba de titularidad/procedencia. Un conflicto sobre el mismo recibo **no genera otro evento**. Si cambia la referencia, sujeto, sesión, método o instante de la misma verificación, el componente deniega. `readTrustedVerifiedEvent` **no emite eventos nuevos** y solo devuelve un identificador ya persistido con vigencia máxima de 300 segundos.

Cada conexión verifica que `session_user` y `current_user` sean el rol esperado y que `pg_is_in_recovery()=false`, antes de ejecutar el SQL fijo y parametrizado. Todas las conexiones se descartan físicamente.

### Ruta V2 exclusiva de laboratorio

`server/v126-v2-only-sensitive-route.cjs` compone **únicamente** `createV125UniqueVerificationGateway` con la lectura duradera de V126 y la acción transaccional V119. No incorpora ni selecciona las rutas históricas V109/V121; no admite `protocol`, `protocolVersion`, `allowLegacy`, `eventKey`, `sessionId`, JWT ni otros metadatos cliente. **No es un endpoint publicado, ni desactiva de forma automática rutas productivas todavía inexistentes en esta integración.**

## 2. Resultado 25/25 en PostgreSQL 17 desechable

| Familia | Resultado |
| --- | --- |
| Privilegios efectivos y privacidad de 2 roles no administradores | PASS |
| Emisión y almacenamiento del UUID v4 generado en PostgreSQL | PASS |
| Relectura, reinicio del componente y reintento devuelven el mismo evento | PASS |
| Dos verificaciones distintas en el mismo segundo: dos eventos distintos | PASS |
| Reutilización de recibo, referencia o modificación de atributos inmutables, bloqueada | PASS |
| 16 inserciones concurrentes del mismo recibo, una sola fila durable | PASS |
| Intentos con verificación falsa, identidad ajena, SQL, JWT o ID inventado, denegados | PASS |
| Ausencia de prueba persistida: lectura sin emisión y sin escritura | PASS |
| Vencimiento del comprobante de 300 segundos | PASS |
| Flujo conjunto V126 → V125 → V122 → V119: un único consumo y negocio ficticio | PASS |
| Dos comprobantes persistidos distintos emitidos en el mismo segundo, ambos consumibles | PASS |
| 16 operaciones simultáneas sobre el mismo evento, una sola confirmación | PASS |
| Sesión cerrada antes o durante la operación: rechazo/rollback conjunto | PASS |
| Ruta protegida de referencia bloquea downgrade y protocolo V109/V121 | PASS |
| Contratos de readiness: **real Supabase y producción no autorizados** | PASS |

**Incidencia y corrección de tests:** la ejecución intermedia [#41773857789](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41773857789) obtuvo **24/25 PASS** porque el **fixture sintético** emitía timestamps distintos en dos reintentos del mismo recibo al cruzar el límite de segundo. El código de seguridad hizo bien en rechazar la modificación de una verificación inmutable. Se corrigió el fixture para conservar el `verifiedAtSec` original al repetir o reiniciar, sin relajar ninguna validación. La ejecución final [#41774038251](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41774038251) pasó **25/25**.

## 3. Límites y revisiones indispensables

1. **La emisión real todavía no está integrada.** El `confirmAuthenticMfaReceipt` del laboratorio no recibe un recibo criptográficamente comprobado desde Supabase Auth. Antes de QA real es necesario revisar si existe un mecanismo soportado, cuándo y cómo se emite el identificador único auténtico, su persistencia/idempotencia multinstancia y cómo se previene que una nueva solicitud emita un recibo distinto para la misma verificación. El identificador de recibo **NO debe ser elegido ni regenerado por el navegador**.
2. **No se valida revocación linealizable** entre el último SELECT en `auth.sessions` y el `COMMIT`. V122 lee una tabla ficticia en CI; no se ha desplegado un lector privado Auth real.
3. **No se ha definido retención, limpieza ni protección real de los registros emitidos**. La conservación indefinida del ledger no debe adoptarse como política de producción.
4. **La ruta V2 exclusiva es una composición de referencia**; no fue conectada a ningún endpoint público, frontend ni flujo real de negocio. Cualquier endpoint protegido debe pasar una revisión específica para impedir downgrade, incluidas rutas antiguas y llamadas directas a implementaciones anteriores.
5. **No hay integración de negocio externo/transacción distribuida**: V119 demuestra únicamente inserciones en el mismo PostgreSQL sintético.
6. Falta revisión independiente de DBA/Seguridad, cuenta privada aprobada, TLS, gestión de secretos, backup/rollback, firmas V67 y autorización específica para cualquier DDL en `MG WEB STUDIO AUTH QA`.

**No hubo cambios en Supabase QA ni producción, Auth, Data API, grants, roles reales, migraciones, Lovable ni despliegue. Los roles, SQL y credenciales de prueba se crearon únicamente dentro del contenedor desechable CI.**

## 4. Estado global y próxima puerta de liberación

Los 32 controles canónicos V67 conservan **32 PENDING, 0 PASS**. La matriz técnica V95 mantiene 15 observados en laboratorio, 14 parciales y 3 no ensayados; el marcador ponderado V123 sigue siendo **69% de cobertura técnica estimada y 31% pendiente**. Las pruebas V126 no cambian automáticamente la puntuación formal ni autorizan publicar.

El próximo paso ya **no debe ser añadir indefinidamente más fases similares de laboratorio**. Debe centrarse en la decisión humana DBA/Seguridad y en una propuesta **concreta, con alcance y rollback**, para conectar el verificador verdadero de MFA y la lectura real de sesión **solo en Supabase QA** después de autorización específica. Hasta entonces: **PR #7 DRAFT / NO MERGE; QA NO_DDL; producción NO_GO**.
