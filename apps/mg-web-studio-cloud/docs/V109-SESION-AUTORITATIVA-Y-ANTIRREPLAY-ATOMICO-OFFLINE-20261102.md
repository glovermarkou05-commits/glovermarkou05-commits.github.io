# MG WEB STUDIO CLOUD · V109 | Contrato de sesión activa y consumo único MFA entre instancias

**Corte:** 2026-11-02, Ecuador.  
**Alcance:** solo código, documentación y simulaciones de seguridad; **sin SQL aplicado, sin nuevos usuarios QA, sin conexión a Supabase Auth, sin despliegue, sin merge**.  
**Evidencia:** GitHub Actions [V109 run #41532269257](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41532269257): **21 PASS, 0 FAIL** tras corregir una validación UUID que falló de forma segura en el primer ensayo. No repetir V107 MFA real ni sus 20 tests para implementar este contrato.

## 1. Hallazgo sobre sesión Supabase

La guía oficial [User sessions](https://supabase.com/docs/guides/auth/sessions) establece que el access token JWT incluye `session_id` y que esta referencia se correlaciona con la clave primaria de `auth.sessions`. [Signing out](https://supabase.com/docs/guides/auth/signout) retira sesiones/refresh tokens según el alcance; **un JWT ya firmado puede seguir verificándose localmente hasta `exp`**. Por eso una ruta de `publish`, `members` o `billing` necesita una comprobación **authoritative current session** separada de `getClaims` y de `aal2`.

En V104 se comprobó que `anon`, `authenticated` y `service_role` **no poseen SELECT directo** sobre `auth.sessions` en el sandbox. **No se concedieron nuevos grants ni se creó ninguna función SECURITY DEFINER** para sortear ese resultado. El mecanismo de lectura primaria queda pendiente de diseño/validación DBA y revisor independiente.

## 2. Implementación V109

Archivo `server/v109-atomic-mfa-redemption.cjs`, módulo CommonJS desacoplado y **backend-only**. Exporta `createAtomicMfaRedemptionV109`. Sus proveedores son exclusivamente inyectados:

1. `readPrimarySession({subject,sessionId,signal})`: debe consultar **un origen primario actual** de sesiones, regresar sujeto/sesión exactos, `primaryRead:true`, `revocationChecked:true`, `active:true` con `checkedAtSec` reciente (máximo 2 segundos) y vigencia.
2. `authorizeResource({actorId,organizationId,siteId,action,signal})`: debe verificar con un backend de permisos vigentes la acción concreta `publish|members|billing`. Rol, tenant o metadata del cuerpo de la petición **no constituyen autoridad**.
3. `consumeEventAtomically({eventKey,consumeUntilSec,action,organizationId,siteId,signal})`: debe implementar una operación **INSERT-if-absent con clave única, durable y compartida**, confirmada en commit, que nunca dé dos respuestas `inserted:true` para el mismo `eventKey`. Un Set/WeakMap por proceso no cumple.

El evento se identifica mediante un **HMAC-SHA256 con secreto compartido de 32 bytes o más** sobre versión + sujeto + sesión + método MFA + `verifiedAtSec`. Ni el secreto ni el JWT/OTP/challenge salen en el resultado. **La acción y organización no forman parte del HMAC**: el mismo evento MFA no puede gastarse una vez por cada recurso/acción. El backend debe mantener la misma versión de clave en todos los workers durante su ventana de validez; rotar sin coordinar puede permitir duplicados.

El comprobante de entrada debe provenir de una **cadena confiable V102/V101**, nunca del JSON del cliente. Se validan estructura exacta y edad: prueba de flujo de hasta **2 segundos**, evidencia MFA de hasta **300 segundos**, sesión principal corroborada dentro de **2 segundos**. No se invoca el ledger si falla lectura autoritativa, autorización de recurso, reloj, cancelación o vigencia. Los errores y salidas malformadas se niegan.

El `eventKey` conserva una lápida hasta `verifiedAtSec + maxFactorAgeSec + 10` segundos. No reusar la clave después de un rollback o TTL demasiado corto. **La implementación no ejecuta la operación comercial** y siempre devuelve `productionAuthorized:false`, `formalV67Pass:0`, incluso cuando el mock aceptó el gasto atómico.

### Límite de atomicidad

V109 solo especifica y verifica un **contrato**. Las pruebas modelan dos objetos de servidor que comparten un `Map` con inserción síncrona; **eso no representa una transacción ACID real ni demuestra seguridad multi-worker o ante reinicio**. Tampoco cubre una caída después de gastar el evento pero antes de publicar. El backend productivo requiere una decisión sobre cómo atar la escritura del ledger y el efecto comercial en una transacción idempotente o una máquina de estados recuperable.

## 3. Diseño revisable de ledger persistente (NO IMPLEMENTADO)

El equipo DBA y seguridad deberá aprobar por separado un esquema privado **no expuesto a Data API** y un rol backend con privilegios mínimos. Elementos de diseño:

- Tabla privada de eventos con `event_key` HMAC como **UNIQUE / PRIMARY KEY**, `consumed_at`, `expires_at` y contexto de auditoría **pseudónimo** (no guardar JWT, correo, TOTP, refresh ni secreto HMAC).
- Inserción con clave única mediante `INSERT ... ON CONFLICT DO NOTHING RETURNING` (o equivalente con aislamiento de transacción suficiente): únicamente el inserto realmente confirmado habilita el uso del evento; un conflicto o error **deniega**.
- La lectura de sesión revocada y el permiso del recurso deben seguir siendo actuales **en el punto de ejecución sensible**; ante carreras de revocación, priorizar un orden consistente o coordinado de eventos y una política explícita de bloqueo.
- Sin ejecutar `GRANT SELECT` sobre tablas Auth, ni RLS de conveniencia ni `SECURITY DEFINER` desde V109. Definir acceso al origen de sesión por una interfaz privilegiada **auditada**, con privilegio limitado.
- Proteger clave HMAC en almacén de secretos y evitar su emisión a cliente o GitHub; comprobar misma clave entre nodos antes de habilitar.
- Evitar TTL de deduplicación corto o limpieza temprana que libere una autorización durante el tiempo que aún sería aceptable.
- Demostrar resultado de **dos conexiones/transacciones independientes** contra el datastore real, con solo una inserción ganadora. Separar ensayo con fallo de commit, reintentos, caída, revocación en carrera y recuperación antes de certificar.

Todo esto está **propuesto**, sin migraciones aplicadas ni roles creados. El proyecto `MG WEB STUDIO AUTH QA` conserva el resultado limpio V108, sin necesidad de volver a crear una cuenta para probar el contrato offline.

## 4. QA V109 con red bloqueada

`tests/v109-atomic-mfa-redemption.test.cjs`: **21 casos offline**, incluyendo:

- Dos instancias simuladas compartiendo ledger: exactamente una acepta; otra niega.
- Imposibilidad de reutilizar el mismo evento con distinto sitio, organización o acción.
- Evento nuevo/identificador HMAC determinista con misma clave; claves diferentes producen distintas identidades (**riesgo de configuración**).
- Rechazo de sesión revocada, expiración, metadata/rol falsos, autorización no booleana, lecturas primarias vencidas, reloj errado, cancelación y fallos de proveedor.
- Negación si la base no confirma `committed:true`, `inserted:true`, `shared:true` y retención suficiente.
- No se incluyen tokens, contraseñas, OTP, claves del proyecto ni proyectos externos.

CI `.github/workflows/mg-web-studio-v109-atomic-redemption-offline.yml` corre Node 22 y V70 network guard. Sin credenciales, base ni migración.

## 5. Decisión y próximas puertas

1. **G109-A:** aprobar e implementar una vía oficial, mínima y auditada de lectura actual de `auth.sessions`, más ensayo de JWT que permanece firmado tras revocación. Sin extender permisos a roles no confiables.
2. **G109-B:** diseñar, autorizar y desplegar **solo en laboratorio aislado** un ledger transaccional privado con política de acceso real y pruebas entre dos conexiones independientes. V109 **no autoriza ni aplica ese SQL**.
3. **G109-C:** coordinar atomicidad del consumo con la operación empresarial y recuperación/idempotencia frente a fallas.
4. **G109-D:** conseguir revisor humano distinto del implementador en [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) y dictamen del checklist completo V67.

**Cierre:** V109 diseño + QA offline: **PASS 21/21**. Garantía distribuida real, lectura de revocación y aplicación al negocio: **NO VERIFICADAS**. **V67 32 PENDING / 0 PASS; PR #7 draft y producción NO_GO.**
