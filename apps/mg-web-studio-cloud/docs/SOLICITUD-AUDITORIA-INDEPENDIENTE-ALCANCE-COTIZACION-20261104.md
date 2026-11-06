# MG DIGITAL SOLUTIONS — Solicitud de auditoría puntual Supabase / PostgreSQL

**Preparada:** 4 de noviembre de 2026 · **Idioma:** español preferido (se acepta inglés)  
**Modalidad:** remoto, precio fijo por entregables · **Acceso inicial:** documentación y código solamente, sin credenciales  
**Objetivo:** obtener un dictamen **humano independiente** de seguridad para autorizar, o rechazar, **una prueba limitada en Supabase QA** de MG Web Studio Cloud. **No** se está solicitando publicar el producto ni una auditoría integral de toda la empresa.

## Contexto comprobable

- [Pull Request #7, abierto en borrador](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7). Base revisable V132: commit `fb3c69210f1ab07f4ef003d0acb39fd709475a00`.
- Proyecto de validación: `MG WEB STUDIO AUTH QA` de Supabase, región Sudamérica; entorno aislado de producción. Al último preflight: **0 usuarios / 0 sesiones / 0 factores / 0 desafíos MFA**. Los nuevos esquemas privados no están instalados.
- MFA de Supabase, JWT `aal2`, journal atómico de desafíos, recibos persistentes e idempotencia con operación empresarial ficticia.
- Evidencia automatizada: [V132 Auth offline 12/12](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41849141865), [V132 integración PG17 32/32](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41849141097). **Estas pruebas no equivalen a QA real ni a auditoría.**
- Problema documentado: `auth.sessions` tiene RLS y cero políticas para un lector privado. Se propuso evitar acceso directo a esta tabla mediante `auth.getClaims(jwt)` + `auth.getUser(jwt)`. La eficacia frente a **cierre de sesión real** debe verificarse; ninguna comprobación previa al `COMMIT` promete revocación instantánea linealizable.

## Alcance de una única revisión independiente

1. **Identidad y sesión.** Evaluar si la verificación oficial `getClaims/getUser` es adecuada para el riesgo aceptado; exigir pruebas negativas de token expirado, firma incorrecta, usuario/sesión ajenos y token conservado después de `signOut`. Revisar cliente Auth aislado, `AAL1→AAL2`, desafío oficial y bloqueo de downgrade.
2. **BD y permisos.** Auditar los SQL propuestos de journal/recibos/ledger, RLS, `GRANT` por columnas, roles distintos, `session_user/current_user`, TLS, secretos y ausencia de tablas expuestas por Data API. No tocar `auth.sessions` con nuevas políticas, `SECURITY DEFINER` ni `BYPASSRLS` sin análisis explícito y consentimiento.
3. **Integridad y riesgos.** Revisar concurrencia, replay, idempotencia, dos transacciones no atómicas (Auth MFA y PostgreSQL), recuperación ante errores y carrera revocación→`COMMIT`.
4. **Operación segura.** Aprobar o corregir el plan de backup, retención, rollback y borrado de la única cuenta MFA temporal. Definir criterios verificables de aborto.
5. **Dictamen.** Decidir **APTO PARA SOLICITAR AUTORIZACIÓN QA / CONDICIONAL / NO APTO**, con razones; una conclusión favorable **no autoriza automáticamente producción, DDL ni publicación**.

## Entregables exigidos

- Informe firmado y fechado con identidad del especialista, versión exacta de código/SQL examinada, matriz **PASS / FAIL / NO PROBADO** y gravedad de cada hallazgo.
- Recomendaciones reproducibles: referencias a archivo/línea, SQL mínimo revisado de instalación **y de rollback**, esquema de roles, políticas RLS y casos de prueba pendientes.
- Dictamen explícito sobre riesgo de revocación (incluida la ventana posterior a `getUser`) y no atomicidad de `mfa.verify` con el registro PostgreSQL.
- Lista corta de bloqueos que deben corregirse **antes de tocar QA**, y guía para una sola prueba real TOTP, con limpieza.
- Presupuesto para **solo la revisión inicial**, con precio fijo y plazo propuesto; cualquier implementación o acceso al proyecto deberá cotizarse y aprobarse aparte.

## Restricciones de acceso y contratación

**No se entregarán** contraseñas, service_role/secret keys, tokens JWT, códigos TOTP, credenciales de PostgreSQL ni datos de clientes. La revisión inicial usa archivos públicos o una copia anonimizada. No se autoriza alterar Supabase Auth, hacer DDL, crear usuarios, publicar Lovable, fusionar el PR, desplegar a producción o cambiar archivos sin acuerdo posterior. Acceso adicional, si alguna vez fuese necesario, deberá ser temporal y de mínimos privilegios, tras autorización expresa.

## Material para empezar (sin segunda cuenta GitHub)

- [Expediente de auditoría DBA/Seguridad](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/blob/docs/mg-web-studio-v94-preflight-20261101/apps/mg-web-studio-cloud/docs/REVISION-EXTERNA-DBA-SEGURIDAD-V130-20261104.md)
- [Informe V132: sesiones Auth sin modificar RLS interno](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/blob/docs/mg-web-studio-v94-preflight-20261101/apps/mg-web-studio-cloud/docs/V132-ALTERNATIVA-OFICIAL-AUTH-SIN-RLS-20261104.md)
- [Plan único de entrada QA y abortos](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/blob/docs/mg-web-studio-v94-preflight-20261101/apps/mg-web-studio-cloud/docs/QA-UNICA-ENTRADA-AUTORIZACION-MFA-20261104.md)
- [Modelo de dictamen sin firmar](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/blob/docs/mg-web-studio-v94-preflight-20261101/apps/mg-web-studio-cloud/docs/DICTAMEN-EXTERNO-EN-BLANCO-V130-20261104.md)

**Estado:** ningún dictamen externo recibido; ninguna intervención QA aprobada; PR #7 DRAFT; V67 formal 0/32; producción `NO_GO`.

---

## Respuesta solicitada al candidato

Enviar: (a) experiencia verificable en Supabase Auth/RLS/PostgreSQL, idealmente auditorías de MFA o sesiones; (b) un ejemplo anonimizado de informe con hallazgos; (c) precio cerrado de auditoría documental y qué queda excluido; (d) disponibilidad; (e) declaración de independencia respecto al desarrollo del proyecto. No se requiere acceso administrativo inicial.
