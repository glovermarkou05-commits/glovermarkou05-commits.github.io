# MG Web Studio Cloud — V128: journal privado y verificación JWT con método oficial

**Fecha de cierre:** 2026-11-04 (Ecuador). **Destino:** PR #7 en borrador (sin publicar ni fusionar).
**Evidencia:** [GitHub Actions #41777740170](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41777740170), job `126401921091`, **17/17 PASS, 0 FAIL**.

## 1. Resultado concreto

Se implementaron dos adaptadores de backend aislado, que completan los contratos faltantes en V127:

- `server/v128-private-challenge-journal.cjs`: recibe, guarda y reclama **una sola vez** un desafío MFA, con campos `proof_reference`, `challenge_id`, `factor_id`, `subject`, `session_id`, método, marca de tiempo y estado `PENDING`/`CLAIMED`. Solo contiene identificadores; **no** almacena códigos TOTP, JWTs, tokens de refresco ni claves API. La operación de reclamación usa una única sentencia `UPDATE...WHERE state='PENDING'...RETURNING` y una ventana máxima de 300 segundos. Ante duda o error, **falla cerrado** y nunca reabre una reclamación.
- `server/v128-supabase-claims-verifier.cjs`: usa **`supabase.auth.getClaims(accessToken)`** sobre un cliente Auth de backend confiable y configurado para un emisor esperado. La biblioteca oficial se encarga de la verificación de firma (JWKS o Auth según tipo de clave). Exige `iss`, `aud=authenticated`, `aal=aal2`, `sub`, `session_id` y vencimiento válido. Devuelve únicamente las afirmaciones verificadas necesarias. **No** interpreta un JWT mediante decodificación sin verificar ni asume que una firma válida implique sesión no revocada.
- La **vinculación de estas afirmaciones con el actor** (mismo `sub`, `session_id`) y el SELECT de sesión primaria continúan a cargo del bridge V127 y la capa V122; no se mezclan los roles del verificador de firma y del autorizador.

## 2. Prueba PostgreSQL 17 efímera y validación completa

**17/17 PASS** con PostgreSQL 17 temporal en GitHub Actions y dobles de `auth.getClaims` (sin ningún acceso a Supabase real).

| Cobertura | Confirmación |
| --- | --- |
| Rol `mg_v128_ci_journal` no administrador, RLS forzado y esquema privado | PASS |
| Journal privado sin códigos OTP, JWT ni contraseñas | PASS |
| Una referencia/ID de desafío no puede registrarse dos veces | PASS |
| Reclamación atómica de pendiente a reclamado | PASS |
| 16 reclamaciones simultáneas → exactamente una ganadora | PASS |
| Sujeto/sesión ajenos, retraso de 301 segundos y argumentos extra → rechazo | PASS |
| Reinicio de cliente/conexión no permite reutilizar un desafío consumido | PASS |
| El rol no puede consultar `auth.sessions`, borrar journal ni asumir `postgres` | PASS |
| Verificador JWT comprueba contrato oficial y rechaza issuer, aud, AAL o exp incorrecto | PASS |
| Identidad autenticada ≠ identidad autorizada: comprobación posterior en V127 | PASS |
| V127 → journal PostgreSQL → `getClaims` simulado → recibo ficticio | PASS |
| Error ambiguo de verificación MFA no permite segundo intento con el mismo desafío | PASS |

**Incidencia transparente:** primera ejecución [#41777602596](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41777602596) terminó **15/16 PASS** porque un test exigía al verificador de firmas rechazar un token válido de **otro usuario**. Esa comparación compete al autorizador V127, no a `getClaims`. Se corrigió la prueba y se añadió un caso independiente para verificar el límite de responsabilidades. Resultado final [#41777740170](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41777740170): **17/17 PASS**, sin debilitar código de autorización.

## 3. Puerta única para activar Auth QA real — todavía no autorizada

La integración sigue necesitando una **revisión DBA/Seguridad independiente y autorización delimitada** antes de crear esquema/rol de journal o permitir accesos privados en `MG WEB STUDIO AUTH QA` (`tbfhiqkivsoeuudlpkgi`).

**Paquete QA mínimo (una sola prueba nueva, sin repetir V107):**
1. Revisar DDL exacto del journal, RLS, grants, retención, protección frente a accesos cliente, administración de contraseñas y modelo de conexiones TLS/pool. La identidad `mg_v128_ci_journal` es **de CI exclusivamente**, no se debe copiar a Supabase QA sin rediseño DBA.
2. Revisar cliente Auth por usuario con URL y project issuer **fijos**; no usar `service_role` en navegador ni para ejecutar desafíos como usuario privilegiado. Conectar `getClaims` a la biblioteca oficial, autenticar sujeto/sesión, confirmar el origen de `challengeId` de `mfa.challenge()`.
3. Revisar contrato real de `persistVerifiedReceipt`, administración de HMAC y retención; validar que un `mfa.verify()` confirmado **no** se repita si falló después su almacenamiento. Esas llamadas ocurren en servicios diferentes; **no** comparten una transacción atómica.
4. Autorizar por separado DDL **solo QA**, usuario temporal TOTP y rollback con limpieza. Verificar la única ruta integrada, cierre/revocación de sesión y no exposición Data API; revisar reportes de seguridad.
5. Solo después de dictamen de revisor externo y cierre V67 considerar firma de producción en una decisión **separada**.

**Límites que permanecen:** no hay credenciales reales conectadas, no se probó token firmado real en V128, no existe endpoint público desplegado ni rutina de retención. La revocación después del último SELECT antes del COMMIT sigue siendo una carrera sin garantía linealizable. Los servicios externos tampoco comparten la transacción PostgreSQL del ensayo.

## 4. Semáforo de cierre

- **V128:** 17/17 PASS, backend de laboratorio implementado.
- **Supabase QA:** sin migraciones, grants, cuentas o sesiones modificadas.
- **PR #7:** draft/no merge.
- **V95:** **69% cobertura técnica ponderada estimada, 31% pendiente**, sin recálculo de baseline.
- **V67 formal:** 32 PENDING, 0 PASS; revisión independiente pendiente.
- **Producción:** **NO_GO**.

**Decisión:** no añadir nuevas fases de CI redundantes. El siguiente trabajo útil debe ser **dictamen independiente del paquete integrado y ejecución QA específicamente autorizada**, no otra sucesión de simulaciones.
