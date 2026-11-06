# MG Web Studio — Revisión independiente DBA/Seguridad (paquete único V130)

**Preparado:** 4 de noviembre de 2026, Ecuador  
**Objeto:** revisión externa **previa** a una única prueba real de MFA en **MG WEB STUDIO AUTH QA** (`tbfhiqkivsoeuudlpkgi`)  
**Repositorio:** [PR #7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) · Rama `docs/mg-web-studio-v94-preflight-20261101`  
**Código congelado para la revisión:** commit [`65fae5d236656fd578f13cfe6b9aac4ea7953b7b`](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/commit/65fae5d236656fd578f13cfe6b9aac4ea7953b7b)  
**Dictamen:** **SIN EMITIR — revisión independiente pendiente**. El autor del paquete **no puede autoconcederse** la firma externa.

## V132 — alternativa oficial en código para evitar el bloqueo RLS, sin cambios en QA

**Evidencias:** [V132 getClaims/getUser 12/12 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41849141865) · [V132→V130/V125/V119 PostgreSQL 17 32/32 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41849141097). [Informe técnico V132](V132-ALTERNATIVA-OFICIAL-AUTH-SIN-RLS-20261104.md).

Supabase recomienda `auth.getUser(jwt)` para una consulta actualizada al servidor Auth cuando importa detectar fin de sesión; `getClaims` solo verifica firma/vencimiento. **V132 pide ambas comprobaciones para cada operación sensible, liga sujeto y `session_id` al JWT firmado y rechaza errores de red, sesión ajena o respuesta revocada.** Un token `aal1` puede iniciar el desafío MFA; V127 todavía exige `aal2` firmado al confirmar.

**Decisión de diseño propuesta para QA:** sustituir la dependencia V122 de consulta directa a `auth.sessions` por V132. **No se requieren ni recomiendan nuevos GRANT, RLS policies, BYPASSRLS o `SECURITY DEFINER` sobre Auth administrado** para esta ruta. El componente antiguo V122 queda solo para análisis/CI; no desplegarlo como lector del esquema Auth.

**Límite crítico:** se han utilizado dobles de `getUser` y `getClaims`; el comportamiento con sesión realmente revocada **no se ha verificado en Supabase QA**. Entre la última respuesta Auth y `COMMIT` persiste una carrera. Por ello **el bloqueo P0 de acceso SQL queda mitigado a nivel de código, pero no se declara aprobado ni cerrado en QA**. Continúan requeridos dictamen DBA/Seguridad y autorización específica del propietario para una sola prueba real.

---

## Hallazgo P0: RLS real de `auth.sessions` bloquea el lector de QA

**Revisión externa obligatoria:** [informe de evidencia P0](P0-AUTH-SESSIONS-RLS-BLOQUEO-QA-20261104.md).

La tabla real `auth.sessions` tiene RLS habilitado y **0 políticas**, es propiedad de `supabase_auth_admin`, y un rol privado no propietario no podrá leer filas con solo GRANT SELECT. El fixture V122 histórico no tenía RLS; una nueva prueba reproduce esa denegación y solo añade una política *en PostgreSQL CI descartable* para continuar sus pruebas. **No trasladar esa política a Supabase QA sin una decisión explícita de DBA/Seguridad.** El lector V122 se reforzó para comparar `session_user` y `current_user`; [V122 31/31 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41842888590) y [roles/journal 27/27 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41842888611).

**Criterio para una autorización futura:** mecanismo soportado y revisado de comprobación de sesión/revocación, permisos efectivos mínimos probados, compatibilidad con actualizaciones de Supabase Auth, rollback, auditoría y dictamen independiente. Hasta entonces, `AUTH_SESSIONS_RLS_P0=BLOCKING`.

---

## Adenda V131 — corregido el destino de tablas QA (4 de noviembre de 2026)

La versión V130 congelada más abajo sigue siendo una **línea base histórica**. Para una revisión de código vigente, el revisor debe inspeccionar también el diff de seguridad **[`f2b940caab5b804a9b625ed32126df8030ed6689`](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/commit/f2b940caab5b804a9b625ed32126df8030ed6689)** y la corrección **exclusiva de prueba** [`06c61d585e53c0393c6077111b761790164a1947`](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/commit/06c61d585e53c0393c6077111b761790164a1947).

**Hallazgo:** V126/V128 aceptaban roles QA, pero sus sentencias seguían apuntando a `mg_v126_fictional` y `mg_v128_fictional`. V131 define rutas fijas para `mg_qa_mfa_receipts` y `mg_qa_mfa_challenges` elegidas solo por una pareja de roles QA permitidos, y deniega cualquier mezcla de roles QA/CI.

**Evidencia:** [V126/V130 PG17 30/30 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41841586814) y [V128+V129 27/27 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41841586997); 57/57 entre esas dos suites. La primera ejecución anterior señaló que una prueba debía esperar el bloqueo al construir el objeto, en lugar de esperar al guardado; **no se debilitó el control**. **Nunca inferir de eso que existe el esquema QA.**

**Propuesta de objetos QA para examen, NO ejecutar:** [V131 — diseño de esquemas, ACL y rollback pendientes](../proposals/V131-QA-PRIVADO-INSTALACION-REVISION-NO-EJECUTAR.md). El documento **no incluye** roles reales, grants/policies completos ni autorización. Antes de firmar, el DBA debe aprobar todas las identidades y los permisos efectivos de ambos esquemas, además del plan de rollback y retención. **QA real, revisión externa y consentimiento del propietario permanecen pendientes.**

---

## 1. Lo que debe evaluar la persona revisora

Emitir un dictamen independiente y reproducible sobre **la autorización para instalar exclusivamente en QA**, no sobre la publicación del producto.

**Estado observado en Supabase QA (solo lectura, 2026-11-04):** PostgreSQL 17.11.0.011 `ACTIVE_HEALTHY`; usuarios, sesiones, factores y desafíos MFA **0/0/0/0**; ausentes los esquemas privados `mg_auth_ledger`, `mg_v126_fictional`, `mg_v128_fictional`. Supabase Security Advisor: **0 avisos**, no equivale a auditoría. Data API `public` y `graphql_public` expuestos y autoexposición OFF según capturas previas del propietario: **revalidar directamente** antes de aprobar. **No se ejecutó DDL**.

**Evidencia que no se debe repetir**:
- V107: TOTP auténtico con limpieza confirmada (reporte histórico; no repetir sin nuevo objetivo).
- [V127](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41775511115): 18/18 pruebas, API de Auth simulada.
- [V128](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41777740170): 17/17, PostgreSQL 17 efímero + `getClaims` simulado.
- [V129 roles](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41781887321): pruebas de privilegios y allowlist.
- [V129 rollback](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41782552742): denegaciones y reversión **solo del fixture temporal**, no QA.
- [V130](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41788585706): 30/30, recibos persistentes sobre PG17 efímero con verificación Supabase simulada.
- **V67 formal: 0/32 aprobados**. Estas suites no autorizan QA ni producción.

## 2. Evidencia de código que debe ser revisada (SHA inmutable de blobs)

| Contrato | Archivo bajo `apps/mg-web-studio-cloud/` | Git blob SHA |
| --- | --- | --- |
| Bridge Auth `challenge/verify` | `server/v127-supabase-native-mfa-bridge.cjs` | `14df3379800577c1b66dc2288fa95d192e685684` |
| Composición privada | `server/v130-private-verified-mfa-composition.cjs` | `ba299236eef41beb9df7341baddabb7b36dabe65` |
| Journal de desafíos | `server/v128-private-challenge-journal.cjs` | `b510a21dab3fdcede43950f41d5d14a5863681fe` |
| JWT firmado y claims | `server/v128-supabase-claims-verifier.cjs` | `a2950847192864e435318874d46a8b665ba6fbee` |
| Recibo duradero | `server/v126-durable-mfa-event-store.cjs` | `089186dab5799a12ffbf192b0ba89a9dfa88dd83` |
| Sesiones privadas | `server/v122-private-auth-session-row-reader.cjs` | `4a8a48be6ac2287f61a114f351b1ba095695d27f` |
| Ledger review-only | `proposals/v110-private-mfa-ledger-review-only.sql` | `ca85055caed9c19989c7f3179a8593311affd86f` |
| Writer mínimo | `proposals/v111-insert-only-ledger-writer-review.sql` | `549733a35805296c5588dfca4c6344a704ef2c7c` |
| Rollback *NO apto para QA* | `proposals/v129-full-rollback-disposable-review-only.sql` | `69fc47241a5260426098a50308103fb11650a532` |

Los SHA anteriores son de **contenido Git**, no hashes SHA-256; comparar contra GitHub `git ls-tree` o API de blobs y el commit congelado. Cualquier modificación posterior de código exige **nueva revisión del diff**.

## 3. Controles obligatorios del dictamen

### A. Identidad, MFA y token

- **A1.** El cliente Supabase Auth usado por `challenge/verify` opera con la **sesión del usuario**, URL/emisor de **QA fijo**, no con `service_role` ni identidad elegida por navegador.
- **A2.** `challengeId` de Supabase queda vinculado en un journal privado con `subject`, `sessionId`, `factorId`, referencia opaca y tiempo de creación; el navegador no puede aportarlo o reemplazarlo.
- **A3.** El journal hace `PENDING → CLAIMED` de manera atómica y persistente, deniega replay/duplicados, TTL vencido, sujeto/sesión ajenos y recuperación ambigua. Un código TOTP **nunca se persiste**.
- **A4.** `getClaims` valida firma mediante la biblioteca oficial, y el backend exige `iss` exacto, `aud`, `aal2`, `exp`, `sub` y `session_id` iguales al actor original. No confiar en `user_metadata` para permisos.
- **A5.** La sesión debe comprobarse contra `auth.sessions` desde **backend privado** y BD primaria en cada operación sensible. Revisar el riesgo de token aún firmado pero sesión revocada.
- **A6.** El ID del evento depende del desafío nativo verificado; los reintentos mantienen un ID, dos verificaciones genuinas distintas no colisionan; no permitir downgrade V109/V121.

### B. PostgreSQL y superficie pública

- **B1.** Esquemas privados **no expuestos** a Data API; no `GRANT USAGE/EXECUTE` sobre ellos para `anon`, `authenticated` ni `PUBLIC`.
- **B2.** Propuesta exacta de **cuatro principales** de backend: lector de sesión, emisor de recibos, lector de recibos y journal; escritor del ledger como quinto principal/rol delimitado. Evaluar identidades reales distintas, capacidad de conexión, `NOLOGIN`/membresía, `NOINHERIT`, `NOBYPASSRLS`, `NOSUPERUSER`, GRANT por columna y revocación de defaults.
- **B3.** Políticas RLS y `FORCE ROW LEVEL SECURITY` en tablas privadas, sin función expuesta `SECURITY DEFINER` ni grants accidentales. Considerar comportamiento de `UPDATE` con políticas `SELECT`.
- **B4.** SQL parametrizado, `search_path` seguro, bloqueo por `session_user/current_user` en conexión física, TLS obligatorio, secretos almacenados en servidor, pools y rotación. **No usar roles `*_ci_*` en QA**.
- **B5.** Mínimo esquema idempotente y rollback de **QA real** preparado por el DBA con verificación de dependencias, backup y autorización, **sin ejecutar V129**, que se protege para `qa_ledger`.

### C. Operación, integridad y recuperación

- **C1.** Al ser servicios diferentes, `mfa.verify` y la escritura del recibo no son atómicos. Rechazar resultado incierto, no reusar desafío, registrar incidentes sin datos sensibles, y definir reconciliación segura antes de prueba real.
- **C2.** Documentar y aceptar explícitamente el riesgo de revocación de sesión después de la última lectura y antes de `COMMIT`, o diseñar una garantía más estricta sin prometer linealización no demostrada.
- **C3.** Plan de retención: qué se guarda (IDs, marcas de tiempo, HMAC), cuántos días, quién puede leerlo, borrado, respaldo, restauración, acceso auditor y minimización de datos.
- **C4.** Criterios de alarma y aborto: usuario ajeno, permisos elevados, objetos extraños, llamadas de red a proyecto incorrecto, recuentos no esperados, errores de escritura, limpieza incompleta.
- **C5.** Ensayo de QA únicamente con **un usuario TOTP temporal**, un nuevo desafío no probado antes, confirmación de `aal2`, una operación ficticia reversible, prueba de replay, revocación, limpieza y verificación posterior. No repetir V107.

## 4. Decisiones y umbral para autorizar QA

El revisor **no debe firmar GO** hasta resolver todos los controles de alta prioridad. Puede emitir dictamen condicionado señalando bloqueos y responsables, pero **NO habilita SQL**.

**Conjunto mínimo de entregables del DBA antes de solicitar autorización al propietario:**

1. Mapa de roles reales y grants por objeto/columna, revisado junto con la configuración Data API.
2. SQL QA revisado de instalación **y** rollback real, ambos limitados al proyecto `tbfhiqkivsoeuudlpkgi`, con hashes y control de dependencias. Ningún script CI-only es SQL de producción o QA.
3. Procedimiento de respaldo y recuperación de incidentes, conservación de evidencias y limpieza del usuario TOTP.
4. Descripción de cliente Auth por sesión, validación de JWT real y enlace de recibo, con escenarios negativos y permisos no administradores.
5. Dictamen completo con nombre de revisor, fecha, alcance, observaciones, acciones correctivas y firma (archivo externo/PDF aceptable).

**El propietario debe autorizar DESPUÉS, por separado:** referencia exacta de QA, scripts/hash, fecha/ventana, usuario temporal y criterios de reversión. Esa aprobación **no** es autorización para fusionar el PR, publicar Lovable ni ejecutar producción.

## 5. Ficha de estado al cierre de este paquete

| Condición | Estado |
| --- | --- |
| Código V130 probado en CI | **PASS 30/30 (Auth simulado)** |
| Backend Auth real / JWT real | **PENDIENTE** |
| Roles y esquemas instalados en QA | **NO** |
| Dictamen independiente DBA/Seguridad | **PENDIENTE** |
| Autorización específica del propietario para QA | **NO OTORGADA** |
| V95 cobertura técnica | **69% estimado / 31% pendiente**, sin recálculo |
| V67 aprobación formal | **0 de 32** |
| PR #7 | **DRAFT / NO MERGE** |
| Producción | **NO_GO** |

**Documentación oficial consultada:** [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa), [Supabase getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims), [Supabase seguridad Data API](https://supabase.com/docs/guides/api/securing-your-api).
