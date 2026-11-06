# MG WEB STUDIO CLOUD — V101 | Origen de AMR y corroboración independiente de MFA

**Fecha:** 2026-11-02 (Ecuador). **Alcance:** investigación del código público Supabase Auth y validación de contratos offline en el PR #7. **NO** se consultaron sesiones, tokens o bases reales.
**Resultado:** [GitHub Actions #41468006628](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41468006628): **80/80 PASS, 0 FAIL** (19 V101 + 19 V100 + 22 V98 + 20 V97).

## 1. Hechos verificados en código fuente de Supabase Auth

Repositorio abierto: `supabase/auth`; revisión basada en archivos accesibles de la rama por defecto el 02/11/2026. Referencias de blob Git de esta lectura:

| Fuente | Blob SHA | Interpretación comprobable |
| --- | --- | --- |
| [`internal/models/amr.go`](https://github.com/supabase/auth/blob/a7e97d665b9ea03853edb66d014bcde323f7894b/internal/models/amr.go) | `bf4eec1a4a2043b5570b4ed0a1347b7df2c5621e` | `AddClaimToSession` inserta un método y, cuando se repite en la misma sesión, actualiza **`updated_at`**, no `created_at` |
| [`internal/models/sessions.go`](https://github.com/supabase/auth/blob/a7e97d665b9ea03853edb66d014bcde323f7894b/internal/models/sessions.go) | `92580d365ab23589835fe0a4e8823447f72765cc` | `CalculateAALAndAMR` construye el JWT AMR con `Timestamp: claim.UpdatedAt.Unix()` |
| [`internal/models/factor.go`](https://github.com/supabase/auth/blob/a7e97d665b9ea03853edb66d014bcde323f7894b/internal/models/factor.go) | `faa35c936d97fbb90b171d5f63c05d19d655461a` | El método telefónico usado por Auth es **`mfa/phone`**; no `phone`. El segundo factor TOTP se identifica como `totp` |
| [`internal/models/challenge.go`](https://github.com/supabase/auth/blob/a7e97d665b9ea03853edb66d014bcde323f7894b/internal/models/challenge.go) | `74d754913aafefa2e7960b0c033f5ebacb5c70ee` | `Challenge.Verify` marca `verified_at` cuando se verifica un desafío |
| [`migrations/20221003041349_add_mfa_schema.up.sql`](https://github.com/supabase/auth/blob/a7e97d665b9ea03853edb66d014bcde323f7894b/migrations/20221003041349_add_mfa_schema.up.sql) | `26c4e4b69b7124c977de4a1100527d43e1a4e0dc` | La tabla histórica `mfa_challenges` tiene `factor_id` y `verified_at`, pero **no columna `session_id`**. `mfa_amr_claims` tiene `session_id`, método, `created_at` y `updated_at` |
| [`migrations/20240612123726_enable_rls_update_grants.up.sql`](https://github.com/supabase/auth/blob/a7e97d665b9ea03853edb66d014bcde323f7894b/migrations/20240612123726_enable_rls_update_grants.up.sql) | `9201e84962a98fbb9069bbd320554198a41482b8` | RLS de tablas `auth` y permisos `postgres` figuran en migración de referencia; **no se certificaron grants reales en sandbox** |

**Conclusión del hallazgo:** V100 debía distinguir `mfa/phone` de `phone`, y debía evitar la inferencia de que `mfa_amr_claims.created_at` marca una nueva comprobación MFA. La fecha de AMR que calcula este código es **`updated_at`**. Aun así, una marca de tiempo en una tabla de métodos no acredita, por sí sola, una verificación de desafío ligada a la sesión.

### Límite de vínculo a la sesión

El esquema histórico de `mfa_challenges` **no contiene** un `session_id` directo. Un desafío `verified_at` para un factor de un usuario no demuestra automáticamente que el desafío autorizó **la misma sesión** del JWT. Cualquier proveedor futuro debe aportar una prueba validada de ese vínculo mediante el flujo autorizado del backend; si no puede hacerlo, **denegar**. No inventar un JOIN, atributo o permiso para resolverlo.

El esquema de producción administrada puede diferir del código abierto revisado. Esto es **análisis estático de fuentes**, no revisión de la base del usuario.

## 2. Implementación V101 entregada

- `server/v100-mfa-amr-provenance.cjs`: método telefónico canónico del JWT `mfa/phone`, con traducción **solo en la salida interna** a `factorType:'phone'` para mantener el contrato V98. Las entradas `phone` no verificadas no se aceptan como AMR canónico.
- `server/v101-mfa-row-corroboration.cjs`: proveedor opcional y puramente en memoria, diseñado para inyectarse como `readAuthoritativeMfaEvent` de V100. Requiere dos comprobaciones **de backend** independientes y con observación reciente:
  1. `readPrimaryAmrRow`: método/sujeto/sesión verificados, **`updatedAtSec` idéntico al AMR firmado**, `createdAtSec <= updatedAtSec`, y constancia de lectura primaria + vinculación de sesión.
  2. `readVerifiedChallenge`: constancia de desafío verificado, pertenencia del factor al sujeto, mismo método/sesión, ventana temporal acotada y, crucialmente, `sessionBoundByAuthorizedFlow:true` con procedencia revisada.
- No se crean SQL, grants, migraciones, `SECURITY DEFINER`, conexiones remotas, hooks de sesiones reales ni persistencia. Si cualquiera de las fuentes no puede comprobar el vínculo, no se emite un evento V100.
- **No se debe establecer** `sessionBoundByAuthorizedFlow:true` a partir solo de datos `mfa_challenges`, porque carecen de `session_id`; el adaptador real todavía no está implementado.

## 3. QA consolidado sin duplicar workflows

- [Run #41468006628](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41468006628): **80 de 80 PASS**, sin fallos y sin red mediante `native-network-guard-v70.cjs`.
- Reutilizado el workflow existente `.github/workflows/mg-web-studio-v100-mfa-amr-provenance-offline.yml` para cubrir V101 + V100 + V98 + V97.
- Se retiró el workflow nuevo de V101 para **evitar duplicidad**. No se ejecutó PG17 V94B de nuevo.
- Ejemplos de rechazos probados: `created_at` tratado erróneamente como último MFA, métodos telefónicos no canónicos, ausencia de desafío confirmado, identidad/sesión cruzadas, desafío sin vínculo a sesión, diferencia temporal excesiva, proveedores sin revisión, tokens/secretos añadidos y errores/cancelaciones de proveedor.

## 4. Próximo requisito para pasar del contrato a un proveedor real

1. Seleccionar y aprobar un **sandbox exclusivo de MG Web Studio Cloud** (el STAGING disponible figuraba inactivo y no se utilizó).
2. Revisar la **versión desplegada** de Supabase Auth en ese sandbox, la semántica efectiva de `auth.mfa_amr_claims.updated_at`, la creación/confirmación de desafíos y los permisos reales `auth`. Solo lectura inicial y con autorización específica.
3. **Demostrar el vínculo** de un desafío verificado a la sesión JWT de una cuenta ficticia; no asumirlo por pertenencia a un factor.
4. Diseñar auditoría de acciones sensibles y operador responsable; registrar la revisión **independiente y humana** de la [incidencia #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8).
5. Mantener `V67 32 PENDING/0 PASS` y producción `NO_GO` hasta firmas y nueva autorización separada.

**Estado:** V101 implementada y probada offline. **Sin Supabase real, sin cuentas reales y sin despliegue.** PR #7 en borrador.
