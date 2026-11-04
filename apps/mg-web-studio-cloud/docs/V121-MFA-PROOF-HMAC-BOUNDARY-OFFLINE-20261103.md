# MG Web Studio — V121: límite de confianza de la prueba MFA y clave HMAC del evento

**Fecha de trabajo:** 2026-11-03 (Ecuador; GitHub registra 2026-11-04 UTC).  
**Rama:** `docs/mg-web-studio-v94-preflight-20261101` — PR #7 en borrador, no fusionado.  
**Resultado técnico:** `V121_OFFLINE_18_PASS` y `V121_V119_PG17_INTEGRATION_20_PASS`, **sin conexión a Supabase real ni publicación**.

## Hallazgo corregido

La interfaz experimental de V119 aceptaba `eventKey`, `subject`, `sessionId` y `verifiedAtSec` como parámetros del llamador. Aunque ese módulo sigue limitado al laboratorio, **no sería seguro convertir esa interfaz directamente en una API de producto**, porque un cliente podría escoger la clave del evento o afirmar una identidad/sesión ajena.

V121 incorpora `server/v121-trusted-mfa-proof-gateway.cjs` como **capa backend offline de composición**:
1. El contexto de autenticación (`authenticatedSubject`/`authenticatedSessionId`) se **inyecta desde el servidor confiable** al construir la capa, nunca desde los campos de la operación recibida.
2. La petición solo admite `action`, `organizationId`, `siteId` y `proofReference` (referencia opaca). Rechaza campos adicionales como `eventKey`, `JWT`, `subject`, `sessionId`, SQL, rol o timestamp.
3. El proveedor inyectado `readTrustedMfaProof` debe obtener una **prueba MFA vinculada** al sujeto y sesión actuales. Se exigen `verified`, titularidad del factor, procedencia revisada y vinculación por flujo autorizado, además de marca temporal del comprobante (máximo 300 segundos) y de revisión reciente (máximo 2 segundos).
4. El servidor deriva internamente la clave HMAC-SHA256 con **la misma fórmula de V109**: versión + sujeto + sesión + método MFA + segundo de verificación. Acción y tenant **no** forman parte de la clave, para impedir gastar el mismo evento en distintas acciones/organizaciones.
5. Solo entonces envía el objeto construido en servidor a un proveedor `runAtomicOperation`. Esta capa no importa PostgreSQL, no ejecuta SQL, no abre conexiones, no lee variables de entorno ni puede autorizar producción.
6. Verifica la estructura de respuesta y nunca interpreta una afirmación `productionAuthorized:true` o un `formalV67Pass` fabricado como éxito.

## Evidencias verificadas

| Ejecución GitHub Actions | Alcance | Resultado |
| --- | --- | --- |
| [V121 Offline #41762848292](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41762848292) | Vinculación sesión/prueba, HMAC V109, antigüedad, roles/identidades falsos, errores de proveedores, respuesta fingida, red bloqueada | **18/18 PASS** |
| [V119 + V121 PG17 #41762989501](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41762989501) | PostgreSQL 17 desechable, flujo V121 → V119 → ledger y negocio ficticio, consumo único y rechazo de sesión falsa | **20/20 PASS** |

Estas pruebas se realizaron con pruebas y sesiones ficticias inyectadas. La base PostgreSQL solo existió en GitHub Actions. **V107 ya estaba aprobado y no se repitió**.

## Límites y requisitos pendientes

- **NO se implementó una fuente real de prueba MFA:** `readTrustedMfaProof` es una dependencia inyectada; su origen/autenticidad debe diseñarse, revisar y probar contra el flujo Supabase Auth autorizado. Un `proofReference` no se puede considerar autorización por sí mismo.
- **NO existe lectura autoritativa real de `auth.sessions`**, validación de revocación linealizable ni defensa completa frente a revocación entre última lectura y `COMMIT`.
- **NO existe integración de operaciones reales** de publicación, membresía o facturación; V119 usa una tabla empresarial ficticia dentro del mismo PostgreSQL temporal. La atomicidad demostrada no se extiende automáticamente a APIs externas ni otros datastores.
- **NO se configuraron credenciales HMAC reales:** el secreto usado en CI es ficticio; custodia, rotación y topología de backend siguen pendientes de dictamen DBA/Seguridad.
- **NO se modificaron** Supabase QA/producción, Data API, ACL, Auth, roles ni migraciones. Tampoco Lovable ni otros productos.
- **V67:** 32 `PENDING` / 0 `PASS`; sin revisor humano independiente designado. PR #7 permanece en borrador y producción `NO_GO`.

## Decisión para el siguiente avance

Priorizar el dictamen independiente del expediente V120 (puede hacerse **fuera de GitHub y sin segunda cuenta**) y revisar el diseño del proveedor real `readTrustedMfaProof` y de revocación de sesiones, sin conceder acceso directo de `auth.sessions` a roles de cliente. Cualquier SQL en `MG WEB STUDIO AUTH QA` requiere aprobación específica y separada; las pruebas de V121 **no conceden** esa aprobación.

**Resultado:** brecha de interfaz de laboratorio cerrada mediante una capa de composición estricta; integración real y producción siguen pendientes.
