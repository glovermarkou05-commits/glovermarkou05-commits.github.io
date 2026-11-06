# MG Web Studio Cloud V122 — lectura privada de la fila de sesión Auth (laboratorio)

**Corte:** 2026-11-03, zona America/Guayaquil (ejecución GitHub registrada 2026-11-04 UTC).
**PR:** [#7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7), **DRAFT / NO MERGE**.
**Estado técnico:** `V122_LAB_30_PASS` — **18/18** comprobaciones offline + **12/12** pruebas sobre PostgreSQL 17 temporal. [Run #41765139754](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41765139754), job `126361622189`.

## 1. Evidencia de solo lectura en el proyecto Supabase Auth QA

Proyecto **MG WEB STUDIO AUTH QA**, id `tbfhiqkivsoeuudlpkgi`, salud `ACTIVE_HEALTHY`, PostgreSQL 17.11 (release 17.11.0.011).

Consulta al catálogo `information_schema.columns`, **sin leer contenido de usuarios**, confirmó que `auth.sessions` tiene los campos `id uuid NOT NULL`, `user_id uuid NOT NULL` y `not_after timestamptz NULLABLE`. El objeto también contiene **otros campos sensibles** que V122 no necesita. Otra consulta de solo lectura a `information_schema.role_table_grants` reportó privilegios sobre `auth.sessions` para `postgres`; **no** se creó un lector personalizado ni se concedió acceso a ningún rol en Supabase real.

La [documentación de sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions) indica que el JWT incluye `session_id`, enlazable a `auth.sessions.id`. Al cerrar sesión, la fila puede eliminarse y su ausencia demuestra que la sesión ya no está vigente. Sin embargo, los límites por inactividad, sesión única y tiempo máximo **no siempre eliminan filas de inmediato**; por tanto, **existencia de fila no equivale a vigencia completa** bajo cualquier configuración.

## 2. Componente V122 y controles incorporados

Archivo: `server/v122-private-auth-session-row-reader.cjs`.

- La identidad `subject` y `sessionId` del solicitante se validan estrictamente como UUID; no se admiten JWT, roles, metadatos ni campos extra aportados por el llamador.
- Se exige la expiración del JWT **ya verificada por un servicio backend confiable**. No se acepta `exp` directamente de parámetros cliente.
- En la **misma sesión física PostgreSQL** se consulta `SELECT current_user, pg_is_in_recovery()`. El contrato de laboratorio exige `current_user=mg_v122_ci_auth_reader` y `pg_is_in_recovery()=false` antes de consultar la fila de sesión.
- SQL constante y parametrizado: `SELECT id, user_id, not_after FROM auth.sessions WHERE id=$1::uuid AND user_id=$2::uuid LIMIT 2`. No lee tokens, agentes, direcciones IP ni otras columnas.
- Exige una única fila coincidente. La ausencia o discrepancia se rechaza; el tiempo aceptado no puede superar el `exp` JWT confiable ni `not_after` cuando este exista.
- Respuesta compatible con contrato V119 de lectura de sesión (`active`, `primaryRead`, `revocationChecked`, marcas de tiempo), **solo dentro de las limitaciones indicadas**.
- La sesión física se descarta al terminar incluso ante error; evita la reutilización accidental de conexión de privilegio sensible.
- Todas las excepciones y respuestas ambiguas deniegan. `readiness` conserva explícitamente `labOnly=true`, `customTimeoutPoliciesVerified=false`, `revocationLinearizable=false`, `productionAuthorized=false`, `decision=NO_GO`.

## 3. Validación GitHub Actions — 30/30 PASS

- **18/18 offline:** parámetros e identidades extra, tiempos, JWT expirado, sesión inexistente, rol de conexión incorrecto, replica, errores de consulta/clock, respuesta malformada, retención de conexión y ausencia de privilegios o acceso externo.
- **12/12 sobre PostgreSQL 17 efímero:** cuenta ficticia no administradora `mg_v122_ci_auth_reader`, permiso `SELECT` exclusivamente sobre tres columnas de una tabla de prueba `auth.sessions`; bloqueo de lectura de token y `SELECT *`, UPDATE y DELETE; comprobación de borrado/revocación, pertenencia usuario/sesión, `not_after`, expiración JWT y rechazo de roles elevados.
- `pg` se instaló desde el `package-lock.json` fijado mediante `npm ci` en GitHub Actions.
- Esquema, roles, tabla y contraseña de V122 son **fixtures públicos de laboratorio** dentro de un contenedor desechable. No constituyen una migración autorizada para Supabase.

## 4. Riesgos no resueltos y decisiones obligatorias

1. **Permisos de Supabase gestionados:** el usuario real `mg_v122_ci_auth_reader` **no existe** en `MG WEB STUDIO AUTH QA`. Crear o conceder SELECT sobre `auth.sessions` de un proyecto gestionado requiere dictamen DBA/Seguridad y autorización específica; no conceder este acceso a `anon`, `authenticated` ni clientes.
2. **Políticas de expiración:** revisar en el Dashboard Auth Sessions y verificar inactividad, sesión única y lifetime en el entorno final; si existen, diseñar comprobaciones adicionales con garantía explícita. V122 está limitado al modelo **sin límites extra confirmados en laboratorio** y al vencimiento de JWT/`not_after`.
3. **Revocación concurrente:** una sesión puede ser revocada después del SELECT, incluso cuando fue consultada contra primaria. V122 **no** garantiza autorización linealizable entre Auth y COMMIT empresarial.
4. **Procedencia del JWT y MFA:** queda pendiente unir un verificador confiable de JWT/`exp` y el proveedor V121 `readTrustedMfaProof` con sesión Auth realmente verificada; no se está usando una sesión viva.
5. **Credenciales y comunicaciones:** TLS certificado, acceso de red privado, gestión/rotación de secretos, permisos revisados, topología pooler, límites de conexión y RPO/RTO.
6. **Revisión y autorización:** no hay dictamen humano independiente; no hay permiso de instalar SQL en Supabase QA; V67 mantiene 32 casos pendientes y producción `NO_GO`.

## 4A. Actualización de evidencia visual de configuración (capturas del usuario, 2026-11-03)

El usuario proporcionó tres capturas de la pantalla Auth de Supabase correspondiente al flujo de revisión solicitado: sesión única **desactivada**, duración máxima de sesión **0 / never**, timeout de inactividad **0 / never**, token de acceso **3600 segundos**, detección de reutilización potencialmente comprometida de refresh token **activada** e intervalo de reutilización **10 segundos**. El Dashboard muestra que editar los límites avanzados requiere **Supabase Pro**.

**Alcance limitado:** los recortes no muestran la referencia del proyecto ni son una consulta de configuración autenticada a través de API; se registran como observación de interfaz **proporcionada por el usuario**, no como auditoría independiente de la configuración persistida. Es un caso compatible con `NO_EXTRA_SESSION_LIMITS_LAB_ONLY`, pero no prueba la sesión real, la firma del JWT, las ACL, el comportamiento bajo revocación concurrente ni la cadena completa de autorización.

**Acción:** no cambiar ajustes, no contratar una suscripción, no conceder roles de lectura y no ejecutar DDL. Evaluar el contrato de Auth/DBA antes de conectar V122 en QA. La evidencia visual reduce la incertidumbre documental, **no cambia la decisión NO_GO ni V67 0/32**.

## 5. Decisión

V122 **completada en laboratorio con 30/30 PASS**. No hubo DDL/DML ni cambios Auth en Supabase QA; ninguna migración, publicación, fusión del PR, modificaciones de Lovable o producción. La siguiente acción útil es la **evaluación del contrato de permisos y política Auth real** por el revisor externo (que no necesita cuenta GitHub), junto con el diseño de prueba QA de alcance específico y su plan de reversión, antes de solicitar autorización para cualquier acceso privilegiado.
