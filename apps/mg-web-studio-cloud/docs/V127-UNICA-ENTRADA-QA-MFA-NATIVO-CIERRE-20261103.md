# MG Web Studio Cloud — V127: entrada única a QA con MFA nativo de Supabase

**Consolidación:** 3 de noviembre de 2026, Ecuador.  
**Propósito:** dejar de sumar ensayos equivalentes y preparar **un único cambio controlado en MG WEB STUDIO AUTH QA**, sujeto a dictamen de seguridad y autorización específica.
**Decisión:** `REVIEW_READY / QA_NOT_AUTHORIZED / PRODUCTION_NO_GO`. **No se ha instalado nada.**

## 1. Evidencia real y simplificación de arquitectura

### La API oficial de MFA ya genera un identificador único para cada desafío

La documentación oficial de Supabase confirma los métodos `supabase.auth.mfa.listFactors()`, `challenge({factorId})` y `verify({factorId,challengeId,code})`. El resultado de `challenge()` incluye `id`, que el backend puede preservar y vincular con el usuario y sesión originales. Fuentes:
- [Auth MFA](https://supabase.com/docs/guides/auth/auth-mfa) (guía actualizada 29 de octubre de 2026);
- [MFA challenge](https://supabase.com/docs/reference/javascript/auth-mfa-challenge);
- [MFA verify](https://supabase.com/docs/reference/javascript/auth-mfa-verify).

**El camino simplificado es reutilizar ese `challengeId` como origen del identificador**, en vez de introducir otro emisor independiente. El bridge deriva un UUID v4 seudónimo y estable mediante HMAC del `challengeId` + sujeto + sesión; no depende del segundo UTC. El `challengeId` en bruto y la clave HMAC se quedan en backend. La firma del JWT `aal2` y su `session_id` deben validarse mediante un proveedor confiable.

En el proyecto real `MG WEB STUDIO AUTH QA` (`tbfhiqkivsoeuudlpkgi`) comprobamos con consultas **exclusivamente de lectura**:
- `auth.mfa_challenges` tiene `id uuid NOT NULL` (clave primaria única), `factor_id` y `verified_at timestamptz` nullable.
- `auth.mfa_factors` tiene `id` y `user_id`; `auth.sessions` contiene `id`, `user_id`, `factor_id`, `aal`, `not_after`.
- Las tres tablas tienen RLS activado.
- La cuenta QA se encuentra `ACTIVE_HEALTHY`, PostgreSQL 17.11.0.011, y estaba **sin usuarios, sesiones, factores ni desafíos MFA (0/0/0/0)** en la última verificación.
- El asesor de seguridad devolvió `lints=[]`; **esto no sustituye una revisión independiente**.

**No solicitar permisos `SELECT` para el cliente sobre `auth.mfa_challenges`**. Se debe preferir la API oficial `challenge/verify` y reservar los accesos privados a `auth.sessions` para el backend revisado. El hook de verificación MFA **no se debe usar por sí solo como emisor de ID**: su payload oficial describe `factor_id`, `factor_type`, `user_id`, `valid`, pero no vincula explícitamente un `challenge_id` con `session_id`. [Documentación del hook](https://supabase.com/docs/guides/auth/auth-hooks/mfa-verification-hook).

### Código y pruebas entregados en el PR

- **`server/v127-supabase-native-mfa-bridge.cjs`**: adaptador aislado de backend que exige actor verificado y sesión activa; comprueba titularidad de factor verificado vía `listFactors`; crea desafío oficial `challenge`; registra **en un journal privado inyectado** referencia opaca y challenge ID vinculado a la sesión; reserva de modo atómico la verificación; invoca **una sola vez** `verify`; valida JWT firmado `aal2`, sujeto, sesión y vencimiento; deriva ID estable del challenge y pide persistencia del recibo. Rechaza toda repetición, error o respuesta de éxito incierta. Nunca solicita `service_role`.
- **`tests/v127-native-auth-mfa-bridge.test.cjs`**: verifica su contrato con dobles de la API oficial, sin red ni datos personales. **[18/18 PASS, 0 FAIL en GitHub Actions #41775511115](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41775511115)** (test final tras reconciliar campo `checkedAtSec` con V126).
- El journal durable `createPending/claimPending`, el proveedor `verifySignedJwt` y la escritura `persistVerifiedReceipt` **son dependencias de integración que todavía requieren diseño final y código de conexión auditado**. Los dobles de pruebas no constituyen conectividad a Supabase QA.

## 2. Un solo paquete mínimo para la prueba QA REAL

| Paso | Trabajo | Responsable / autorización necesaria |
| --- | --- | --- |
| **A — Revisión previa** | Revisión independiente humana DBA/Seguridad de propuesta V110–V112, V118/119/122/125/126, bridge V127, política Data API, RLS, privilegios mínimos de Auth, TLS, tokens, journal persistente y rollback. Puede hacerse **fuera de GitHub, sin segunda cuenta**. | Persona externa diferente del ejecutor: **PENDIENTE** |
| **B — Implementación controlada** | Desarrollar journal privado `proofReference ↔ challengeId ↔ subject/session` con bloqueo atómico; conectar per-user Supabase Auth client, verificador de JWT y escritura persistente V126; ejecutar revisión estática y emitir dictamen. No abrir ruta pública antes de aprobación. | Integrador + revisor; **pendiente** |
| **C — Permiso expreso QA** | El propietario autoriza por separado el alcance exacto de roles/DDL, conexión y usuario de prueba en el **único proyecto `tbfhiqkivsoeuudlpkgi`**, con respaldo, criterio de aborto y limpieza; no autoriza producción. | Propietario: **NO AUTORIZADO TODAVÍA** |
| **D — Prueba controlada real** | Con usuario QA temporal, repetir solo el escenario nuevo: desafío TOTP real, confirmación AAL2, persistencia/reintento, no duplicados, cierre de sesión, lectura/revocación, permisos de columnas y limpieza. Aprovechar V107 aprobada; evitar repetir ensayos previos. | QA bajo consentimiento específico |
| **E — Liberación** | Reconciliar V67, 32/32 dictámenes firmados, verificación de rollback, observabilidad, secretos, APIs, límites/retención; GO de producción **separado**. | Revisor + propietario |

### Riesgos exactos que no se deben ocultar

1. `challengeId` es único en el esquema QA observado, **pero el ID no está vinculado por sí solo a una sesión**. La vinculación debe provenir del registro privado del desafío emitido por un backend autenticado y de JWT revisado después de `verify`. No confiar en un `challengeId` elegido por el cliente.
2. El `mfa.verify()` remoto y la inserción duradera en PostgreSQL **no comparten transacción**. Si Auth verifica y la escritura falla, hay que fallar cerrado y solicitar un desafío NUEVO en lugar de volver a usar una confirmación incierta. El mecanismo exacto de recuperación y las carreras requieren dictamen humano.
3. El token `aal2` puede seguir válido durante su período de expiración; para operaciones sensibles sigue siendo necesaria validación autoritativa de sesión revocada. La carrera entre último SELECT de sesión y `COMMIT` no está resuelta linealizablemente.
4. V127 es una **composición de referencia**, sin endpoint público, sin credenciales reales, sin configuración de backend persistente, sin journal real ni JWT verificado contra Supabase. No basta para declarar el producto instalado o listo.
5. V126 conservará su utilidad para ledger/replay y persistencia, pero ya **no necesita un emisor autónomo de identificadores** si el desafío Auth se vincula correctamente. Cualquier esquema pendiente debe pasar revisión para evitar permisos excesivos.
6. El proyecto QA tiene expuestos por Data API `public` y `graphql_public`, autoexposición desactivada según capturas del propietario; el esquema privado MFA no debe exponerse. La opción Auth Pro no es requisito para probar TOTP nativo (documentación oficial indica soporte TOTP en planes gratuitos).

## 3. Decisión inmediata

**No abrir más fases de pruebas ficticias por rutina.** Mantener los controles aprobados y dedicar el siguiente trabajo únicamente a **cerrar el journal/roles y el dictamen independiente** para este paquete. No existe segundo usuario GitHub y **no se necesita**; una persona revisora puede firmar el informe fuera de la plataforma.

El avance técnico ponderado de la matriz V95 permanece en **69% estimado / 31% pendiente** (15 observados, 14 parciales y 3 no ensayados), **sin reclasificar controles por código V127**. Aprobación formal V67: **0 de 32**. PR #7 **DRAFT/NO MERGE**, QA DDL **NO AUTORIZADO**, producción **NO_GO**.

**Este paquete agiliza el camino técnico, pero NO sustituye los permisos ni las pruebas reales exigidas para liberar.**
