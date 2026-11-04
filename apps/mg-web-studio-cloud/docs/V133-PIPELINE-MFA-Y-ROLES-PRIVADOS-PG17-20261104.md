# V133 — Pipeline MFA privado y permisos QA simulados en PostgreSQL 17

**Fecha:** 4 de noviembre de 2026 · **Estado:** `CODE_AND_DISPOSABLE_PG17_PASS / SUPABASE_QA_NOT_INSTALLED / PRODUCTION_NO_GO`.

## Trabajo terminado en el PR #7

1. [Pipeline V133](../server/v133-private-qa-mfa-pipeline.cjs): conecta la validación de sesión mediante APIs oficiales (`V132 getClaims/getUser`), el journal privado `V128`, el verificador firmado AAL2 `V128` y el emisor/lector de recibos persistentes `V130/V126`.
2. Se fijaron exclusivamente los roles `mg_qa_mfa_challenge_journal`, `mg_qa_mfa_receipt_issuer` y `mg_qa_mfa_receipt_reader`. El código exige **tres pools diferentes** de PostgreSQL y no acepta un selector de esquema/rol enviado por navegador.
3. No se expone endpoint de emisión a clientes; `begin`, `confirm` y lectura del recibo están preparados **solo para código de backend**.
4. [Fixture PostgreSQL 17](../qa/v133-private-qa-roles-disposable-only.sql): prueba DDL de tablas privadas, `GRANT` mínimos, roles LOGIN sin `BYPASSRLS` y `FORCE ROW LEVEL SECURITY`.
5. [Rollback desechable](../qa/v133-private-qa-rollback-disposable-only.sql): aborta con registros y elimina tablas/esquemas/roles únicamente si están vacíos y no hay dependencias; `RESTRICT` sin `CASCADE`.

**Advertencia:** los scripts SQL contienen **contraseñas sintéticas** para el contenedor descartable y un guard `current_database()='qa_ledger'`. **Nunca se deben copiar al SQL Editor de Supabase**. No constituyen una migración real ni un plan de secretos de producción.

## Verificación de CI

[GitHub Actions V133: ejecución 41891805674](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41891805674):

| Parte | Resultado | Alcance |
| --- | --- | --- |
| Composición offline del backend | **5/5 PASS** | Sesión válida o revocada simulada; AAL2; factor verificado; prevención de replay; tres pools distintos |
| PostgreSQL 17 con roles privados QA-named | **4/4 PASS** | Roles sin superusuario/BYPASSRLS, RLS obligatorio, `anon/authenticated/service_role` sin USAGE, escritura y lectura de evento real en DB ficticia |
| Rollback protegido del laboratorio | **PASS** | Rechaza datos no vacíos; después de borrado sintético, confirma esquemas y los tres roles ausentes |

Las respuestas `getUser/getClaims/mfa.verify` de estos tests siguen siendo simuladas. El ensayo anterior de sesión V132 **sí fue real** y terminó con `CLEANUP=CONFIRMED` (0 usuarios/0 sesiones), pero **no** probó la composición MFA completa.

## Estado real de Supabase QA después del avance

Consulta **solo lectura** al proyecto `MG WEB STUDIO AUTH QA` `tbfhiqkivsoeuudlpkgi`:
- Auth: 0 usuarios, 0 sesiones.
- `mg_qa_mfa_challenges`: no existe.
- `mg_qa_mfa_receipts`: no existe.
- Ninguno de los tres roles QA existe.
- Proyecto `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.011`.

No se creó ninguna identidad, rol o tabla. No se ejecutaron migraciones, ni se tocó producción.

## Lo que impide declarar terminado

1. **Instalación QA real** pendiente: generar migración para proyecto correcto, con credenciales independientes de backend aprovisionadas fuera del repositorio, conectividad TLS, roles/grants/policies, idempotencia de instalación, backup y rollback QA (nunca usar SQL de laboratorio).
2. **Integración Auth MFA AAL2 real con las tablas privadas** pendiente: una sola cuenta temporal autorizada, enrolamiento TOTP, challenge/verify firmado y control de fallos/replay; no repetir V132.
3. **Operación empresarial real** pendiente: V119 es ficticia y debe sustituirse por transacción validada, autorización por recurso y ledger inmutable.
4. **Revocación y consistencia**: `getUser` rechaza el JWT antiguo en el caso probado, pero entre esa consulta y `COMMIT` sigue existiendo una carrera; el paso `mfa.verify` y el commit no forman una única transacción.
5. **Revisión de seguridad y liberación**: no hay firma externa V67; usuario optó por no contratar auditor por ahora. Se puede continuar desarrollando sin ese gasto, pero no se inventará aprobación formal de los 32 controles ni se liberará producción sin evidencia apropiada.

**Puertas vigentes:** PR #7 DRAFT/no merge; Supabase QA DDL no autorizado por paquete específico; V67 formal **0/32**; producción **NO_GO**; V95 69% técnico estimado (sin recalcular).

## Próxima decisión concreta

Completar una **migración revisable para QA** distinta del fixture de CI, con roles provisionados fuera del código, scripts de verificación y rollback específico. Antes de ejecutar sobre `tbfhiqkivsoeuudlpkgi`, revisar el paquete exacto y obtener aprobación específica del propietario. No es necesario volver a probar V107 ni V132.
