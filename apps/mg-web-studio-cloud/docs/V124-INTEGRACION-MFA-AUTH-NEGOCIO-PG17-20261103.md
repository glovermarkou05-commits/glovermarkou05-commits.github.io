# MG Web Studio Cloud — V124 integración completa de laboratorio MFA → Auth → negocio

**Fecha del trabajo:** 3 de noviembre de 2026 (America/Guayaquil; ejecución registrada 4 de noviembre UTC).  
**Alcance:** PR #7 draft, rama `docs/mg-web-studio-v94-preflight-20261101`. **No desplegado en Supabase QA ni producción**.  
**Resultado:** [GitHub Actions #41768590732](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41768590732), job `126372713587`, `completed/success`, **17/17 PASS, 0 FAIL**. 

## Objetivo y conexión entre componentes previamente probados

La nueva prueba `tests/v124-integrated-mfa-session-business-pg17.test.cjs` ejecuta realmente, sobre **un único PostgreSQL 17 desechable de CI**, el siguiente recorrido:

1. **V121** recibe solo `proofReference`, `action`, `organizationId`, `siteId`; obtiene una **prueba MFA simulada pero inyectada como fuente confiable**, valida su vinculación con el sujeto y sesión del backend, y deriva internamente el HMAC de evento.
2. **V122** verifica la sesión ficticia mediante `auth.sessions` en la conexión primaria, solo `id`, `user_id`, `not_after`; limita el resultado al `exp` JWT recibido de un proveedor de prueba confiable.
3. **V119** solicita autorización de recurso/tenant a un proveedor sintético; consume una sola vez el evento MFA y registra una **operación empresarial ficticia en la misma transacción** PostgreSQL, con rollback conjunto si falla.
4. **V118** limita el proceso escritor a una identidad no administradora que cambia solo al rol INSERT-only `mg_auth_ledger_writer`, descartando la conexión física tras usarla.
5. El lector Auth de prueba `mg_v122_ci_auth_reader` es una identidad **separada de la cuenta escritora**: solo SELECT de tres columnas, no puede consultar el secreto ficticio ni actualizar/borrar sesiones. El escritor no puede leer `auth.sessions`.

**No hubo conexión a `auth.sessions` real de Supabase ni firma real de JWT, y el negocio es ficticio**. Los roles usados en este ensayo fueron creados únicamente por el fixture PG17 de GitHub Actions.

## Casos integrados (17/17 PASS)

| Caso | Observación |
| --- | --- |
| 1 | PG17 desechable y dos roles backend no administradores |
| 2 | Separación física de privilegios Auth-reader y ledger-writer |
| 3 | Prueba MFA simulada → consulta de sesión → insert MFA+negocio conjunto |
| 4 | Clave del mismo evento no puede consumirse dos veces ni para otra organización |
| 5 | Sesión borrada **antes** de ejecutar bloquea cualquier escritura |
| 6 | Logout después de operación ya confirmada impide nuevo evento y conserva historia |
| 7 | Sesión con `user_id` ajeno bloqueada |
| 8 | Token caducado bloquea incluso con fila de sesión existente |
| 9 | `not_after` vencido bloquea aunque el JWT siga vigente |
| 10 | Prueba MFA sin vinculación de sesión bloquea consultas y escrituras |
| 11 | ACL de organización/sitio negada bloquea la acción |
| 12 | Sesión borrada **entre insert de negocio y lectura final** causa rollback de ledger y negocio |
| 13 | Fallo después de insert ledger causa rollback y permite nuevo intento legítimo |
| 14 | 16 solicitudes simultáneas: exactamente una acción y un evento confirmados |
| 15 | Dos sesiones válidas diferentes mantienen claves HMAC y operaciones separadas |
| 16 | Campos del cliente como `eventKey`, `sessionId`, SQL o metadatos se rechazan |
| 17 | Las tres capas siguen explícitamente con `productionAuthorized=false` y `NO_GO` |

## Incidencia de la primera ejecución y corrección

La primera ejecución [#41768481396](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41768481396) terminó con **5 PASS / 12 FAIL** debido a **contaminación entre casos**: el mismo `sessionId` + segundo de verificación producía la **misma clave HMAC** en tests distintos, y el registro del primer test persistía en el PostgreSQL temporal. Los casos independientes no podían asumir ledger vacío.

Se corrigió **solo el fixture de pruebas** mediante `test.beforeEach` que vacía las tres tablas sintéticas `auth.sessions`, `mfa_redemptions` y `completed_operations` antes de cada escenario. Ese `TRUNCATE` lo ejecuta exclusivamente la cuenta administradora del runner; no pertenece a V118–V122 ni a ninguna aplicación. La segunda ejecución **17/17 PASS** confirma el aislamiento correcto. **Nunca vaciar tablas reales.**

## Riesgos y puertas que permanecen

- La verificación MFA `readTrustedMfaProof` **no está conectada a un evento MFA genuino, único e inmutable** de Supabase Auth; el proveedor del ensayo devuelve datos sintéticos.
- `auth.sessions` es **una tabla ficticia** con estructura parcial, aunque su contrato de columnas se había contrastado mediante catálogos de solo lectura. La cuenta lectora solo existe en CI; no se concedieron roles, `USAGE` ni `SELECT` nuevos en el proyecto real.
- La eliminación de sesión durante la transacción **antes** del último chequeo se rechaza; la revocación **después** de ese último SELECT y **antes** del `COMMIT` conserva una carrera no linealizable. No prometer revocación instantánea bajo concurrencia real.
- El HMAC V109/V121 usa granularidad de **segundos** junto con sujeto/sesión/método. Dos verificaciones legítimas en el mismo segundo pueden compartir clave y colisionar. El diseño de identificador único del evento real deberá revisarse antes del despliegue; no resolver aceptando una clave elegida por el cliente.
- Un efecto de negocio a través de otro servicio/API no comparte necesariamente la transacción PostgreSQL; faltan integridad distribuida e idempotencia de producción.
- Los límites de sesión y Data API se revisaron visualmente con capturas del usuario: sesión única desactivada, duración/inactividad 0, access token 3600 s; esquemas expuestos `public` y `graphql_public`, autoexposición OFF. No son una auditoría de seguridad independiente ni licencia para ejecutar DDL.
- Imagen de PG17 fijada por etiqueta (no digest), roles/secretos CI sintéticos, falta principal backend real, TLS/rotación, dictamen DBA/Seguridad y aprobación expresa para operaciones en QA.
- **V67 formal: 32 PENDING / 0 PASS. Producción: NO_GO. PR #7: DRAFT, NO MERGE.**

## Barra de avance

La matriz V95 de 32 controles conserva **15 LAB_OBSERVED, 14 PARTIAL, 3 NOT_EXERCISED**, evaluados en V123 con pesos 100%/50%/0%: **68,75% ≈ 69% cobertura técnica estimada / 31% pendiente**. **No** actualizar la cifra ni otorgar `PASS` automáticamente por la nueva suite V124. Las 17 pruebas fortalecen la evidencia técnica, pero requieren reconciliación formal por revisor humano.

## Recomendación de siguiente paso

Antes de solicitar permiso SQL en `MG WEB STUDIO AUTH QA`, diseñar un proveedor de **eventos MFA verdaderamente únicos** y procedencia verificable que no dependa solo de un segundo, revisar carrera entre lectura de sesión y commit, y recibir evaluación de un revisor humano externo (puede operar sin cuenta GitHub). Cualquier migración real requiere autorización delimitada y plan de rollback.
