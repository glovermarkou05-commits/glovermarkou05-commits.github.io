# MG WEB STUDIO CLOUD — V99 | Preflight de sandbox de identidad y MFA

**Corte:** 02/11/2026 (Ecuador). **Proyecto exclusivo:** MG Web Studio Cloud.
**Operación efectuada:** inspección de inventario Supabase de solo lectura, comprobación de documentación oficial, implementación y tests de un guard local no conectado. **No se creó, despertó, conectó, migró ni modificó ningún proyecto Supabase.**

## Estado de inventario (solo lectura)

La lista visible de proyectos Supabase de la cuenta **no contiene** un proyecto inequívocamente nombrado y dedicado como laboratorio V99 de identidad para MG Web Studio Cloud. El proyecto existente **MG WEB STUDIO CLOUD - STAGING** figuró **INACTIVE** al momento de la inspección. Otros proyectos incluyen productos distintos y no deben reutilizarse como sandbox. No registrar sus project refs, URLs de base ni credenciales en la rama Git.

**Decisión de alcance:** `V99_REMOTE_SANDBOX = NOT_SELECTED`, `SUPABASE_CONNECTION = NOT_AUTHORIZED`, `SQL = NONE`, `REAL_USER_OPERATIONS = NONE`, `REACTIVATE_STAGING = NO`.

## Contratos y brechas técnicas verificados

1. `server/pg-session-reader-v75.cjs` ya contiene un contrato con SQL de lectura parametrizada de `auth.sessions`; esto no demuestra que el esquema/permisos del proveedor real permitan ese acceso o que no existan restricciones de sesión adicionales. **No se ejecutó SQL.**
2. `server/v98-trusted-assurance-adapter.cjs` requiere JWT verificable con `session_id`, sesión activa de origen primario y una **fuente independiente de evento MFA reciente** para el mismo usuario y sesión. `aal2` del JWT **no basta** para sostener `factorConfirmedAtSec`. La documentación Supabase consultada explica `session_id`, `auth.sessions`, MFA y `aal`, pero **no se acreditó aún un origen directamente utilizable** para esa fecha en un proveedor real. No inventar tabla/campo ni tratar un factor enrolado como verificado.
3. El contrato no justifica usar credenciales `service_role` en un cliente, crear funciones `SECURITY DEFINER`, conectar a STAGING/producción o alterar MFA de usuarios existentes.

**Documentación oficial revisada:**
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/auth/jwt-fields

## Implementación V99

Se añadió `server/v99-sandbox-readiness.cjs` y la suite `tests/v99-sandbox-readiness.test.cjs`. El módulo realiza una **evaluación puramente local de alcance**: requiere un proyecto dedicado activo y datos 100% sintéticos, separación de roles, aprobación de propietario, revisión de costes, custodia de secretos, fuente JWT y sesión confiables, una prueba de factor MFA con procedencia auditada, revisor independiente y plan de limpieza. Rechaza inputs con identificadores de proyecto, URLs, contraseñas, tokens, usuarios y campos no declarados.

**Fail-closed:** aun con los quince requisitos cumplidos, la salida únicamente permite solicitar una nueva autorización humana. Las salidas `remoteConnectionAllowed`, `queriesAllowed`, `credentialsAllowed`, `sqlAllowed`, `mfaChallengeAllowed`, `usersCreationAllowed`, `productionAllowed` y `githubMergeAllowed` permanecen siempre `false`. No existe controlador de red, cliente Supabase ni comando SQL.

**Resultado GitHub:** [workflow V99 #41464299861](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41464299861), 14/14 tests PASS, 0 FAIL. Pruebas de denegación para STAGING inactivo, proyecto ajeno, usuarios reales, controles ausentes, MFA sin fuente válida, secretos e identificadores maliciosos. El workflow usa `contents: read`, checkout sin persistencia de credenciales y un guard local que deniega acceso a red.

## Próximos pasos sujetos a aprobación

- Identificar y aprobar un **sandbox independiente** que no comparta usuarios, datos ni secretos con otros productos. Crear un nuevo proyecto podría generar costes y **no está autorizado** por esta etapa.
- Aclarar la procedencia real de **MFA reciente por sesión**, con mecanismos y permisos documentados de Supabase; no fabricar marcas temporales ni inferirlas del JWT.
- Comprobar capacidad de `auth.sessions`, revocación y factores mediante consultas de solo lectura únicamente **después de seleccionar explícitamente el entorno**; evitar cualquier usuario existente.
- Preparar un plan acotado de enrolamiento/challenge/verify TOTP con identidades ficticias y autorización específica; no activar cambios en el STAGING inactivo.
- Designar revisor independiente del [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8), que registre la aceptación formal si corresponde.

## Estado y límites

**V99: guard de selección y pruebas offline PASS.** **Sandbox Supabase real: NO DISPONIBLE / NO SELECCIONADO.**
**V67: 32 PENDING / 0 PASS. PR #7: borrador, sin fusionar. PRODUCCIÓN: NO_GO.**

Esta entrega no crea ni habilita cuentas, sesiones, proveedores MFA, SQL, alertas, publicaciones, fusiones ni firmas formales.
