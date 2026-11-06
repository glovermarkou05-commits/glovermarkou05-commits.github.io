# MG WEB STUDIO CLOUD · V106 | Protocolo de la primera prueba real de Auth y MFA

**Fecha:** 2026-11-02 (Ecuador). **Estado:** `READY_FOR_SPECIFIC_OWNER_APPROVAL` (documentación completada; no ejecutada).  
**Entorno autorizado hasta ahora:** creación de `MG WEB STUDIO AUTH QA` en el plan Free, región `sa-east-1`, y auditoría de catálogo/privilegios de solo lectura (V103–V104). La conexión Auth para crear usuarios y MFA **no ha sido autorizada**.  
**Alcance de V106:** preparar un procedimiento reproducible de una identidad sintética, sin cambiar proyectos existentes, producción, SQL, grants, Edge Functions ni el PR #7.

## 1. Dependencias y hechos confirmados

- `MG WEB STUDIO AUTH QA` está `ACTIVE_HEALTHY` en la organización aprobada. El proyecto heredado `MG WEB STUDIO CLOUD - STAGING` permanece inactivo y no se toca.
- La auditoría V104 identificó 27 tablas de `auth`, 0 tablas en `public`, y ninguna concesión directa de lectura/escritura a `anon`, `authenticated` y `service_role` sobre siete tablas críticas. **No modificar permisos en las tablas administradas.**
- V105 tiene [22/22 pruebas offline PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41477902700) para observar `getClaims(jwt)`, `getUser(jwt)` y `mfa.getAuthenticatorAssuranceLevel(jwt)`. **No** certifica revocación efectiva de `session_id`.
- Supabase documenta `auth.admin.createUser` como operación **solo de servidor**, y `auth.admin.deleteUser` requiere credenciales privilegiadas. Los flujos TOTP admiten `auth.mfa.enroll`, `auth.mfa.challenge`, `auth.mfa.verify`.
- La verificación inicial de un factor puede cerrar las otras sesiones de **esa cuenta ficticia**; verificar el nuevo JWT y no presuponer que sigue vigente una sesión secundaria.
- El conector Supabase disponible **no proporciona acciones Auth de administración de usuarios ni challenge/verify**. Por eso V106 no intenta emularlas por SQL. Una prueba real requerirá un ejecutor controlado con el SDK oficial, dependencias fijadas y secretos efímeros; no basta con cambiar el proyecto del conector.

Documentación oficial: [crear usuario](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [eliminar usuario](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [iniciar sesión](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [inscribir TOTP](https://supabase.com/docs/reference/javascript/auth-mfa-enroll), [crear challenge](https://supabase.com/docs/reference/javascript/auth-mfa-challenge), [verificar challenge](https://supabase.com/docs/reference/javascript/auth-mfa-verify), [consultar AAL](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel), [revocar sesión](https://supabase.com/docs/reference/javascript/auth-signout).

## 2. Barreras previas: todas obligatorias

| Puerta | Evidencia necesaria | Estado |
| --- | --- | --- |
| G106-01 | Propietario autoriza **una única identidad sintética**, una sola sesión de prueba, un factor TOTP y su eliminación | **PENDING APPROVAL** |
| G106-02 | Confirmar, inmediatamente antes de la prueba, que el proyecto destino sigue siendo `MG WEB STUDIO AUTH QA` y no otro; cotejo fuera de Git | **PENDING** |
| G106-03 | Ejecutar exclusivamente desde backend aislado, cliente Supabase SDK con versión/lockfile fijos y `persistSession:false`, `autoRefreshToken:false` cuando corresponda | **PENDING** |
| G106-04 | Secretos generados en memoria o gestor de secretos. Nunca volcar a GitHub, Actions, logs, capturas, chats, URL, navegador de terceros o archivos persistentes | **PENDING** |
| G106-05 | Usar identidad local de ensayo con correo no entregable de dominio reservado (por ejemplo `mg-v106-<aleatorio>@example.invalid`), sin destinatarios reales, contraseña aleatoria de alta entropía y `email_confirm:true` solo si el proveedor admite ese flujo en QA | **PENDING** |
| G106-06 | Un operador humano acepta ejecutar/eliminar la cuenta y un **revisor distinto** valida la evidencia, con el plan de limpieza aprobado antes de la creación | **PENDING** |
| G106-07 | No habilitar envío real de correo/SMS/WhatsApp, no usar teléfono, no gestionar otros usuarios, no permitir más de un perfil de prueba simultáneo | **PENDING** |
| G106-08 | Registros de eventos exclusivamente categóricos: estado, duraciones agregadas, fallo/motivo clasificado; sin JWT, refresh, secreto TOTP, código, contraseña, identidad exacta o URL privada | **PENDING** |
| G106-09 | Confirmar que el usuario no tiene cuentas vinculadas a datos de terceros; preparar limpieza **incluso tras error parcial** | **PENDING** |
| G106-10 | Mantener V67 32 PENDING/0 PASS, PR #7 draft y producción `NO_GO`; no confundir AAL2 con autorización comercial | **PENDING** |

**Regla de parada:** si cualquier puerta carece de evidencia/aprobación, **no crear usuarios**. No interpretar un "continuemos" general como permiso para usar privilegios administrativos de Auth. No crear un segundo proyecto; la base autorizada ya existe.

## 3. Guion de una sola prueba sintética (NO EJECUTADO)

La siguiente es una **especificación operativa**, no un script ejecutado; los métodos se consultaron en el SDK oficial.

| Orden | Operación propuesta | Aceptación / STOP | Evidencia redaccionada |
| --- | --- | --- | --- |
| 0 | Comprobar proyecto/plan, ambiente y aislación, configurar SDK en proceso privado | Si ID, entorno o controles difieren: STOP | `scope_ok` |
| 1 | `auth.admin.createUser({email,password,email_confirm:true})` vía admin backend | Solo 1 usuario `MG-V106` sintético; si falla, no intentar con uno real | `user_created` (booleano) |
| 2 | Cliente **usuario** aislado `auth.signInWithPassword({email,password})`; consultar `getClaims(jwt)` y `getUser(jwt)` | Misma identidad verificada, sesión inicial y AAL1; si difiere: STOP | `aal1_verified` |
| 3 | `auth.mfa.enroll({factorType:'totp',friendlyName:'MG-V106-TEST'})` | Solo factor ficticio; **QR/TOTP secret nunca en evidencia**, no SMS | `totp_enrolled` |
| 4 | `auth.mfa.challenge({factorId})` y `auth.mfa.verify({factorId,challengeId,code})` | Código introducido/generado por operador en entorno aislado; no registrar código. Si falla, STOP | `challenge_verified` |
| 5 | Tomar el JWT retornado/renovado; `getClaims`, `getUser`, `getAuthenticatorAssuranceLevel(jwt)` | Comprobar `aal2`, `sub`, `session_id`, `amr` y `timestamp`; registrar **solo comparaciones booleanas**; si cambia `session_id`, STOP para evaluación de supuesto V102, no modificar Auth para forzarlo | `aal2_checked` |
| 6 | Ensayar aislamiento de un segundo challenge y ausencia de reutilización en flujo V102 con identificadores en memoria | Nunca usar OTP ni challenge desde otra sesión; si límite no se garantiza, no declarar PASS | `correlation_checked` |
| 7 | `auth.signOut({scope:'global'})` **solo para la cuenta ficticia**; verificar efecto de expiración/validez de token con fuentes oficiales | JWT puede continuar firmado y válido hasta `exp`; no afirmar invalidación inmediata si no hay evidencia de revocación | `session_revoked_or_uncertain` |
| 8 | `auth.admin.deleteUser(testUserId)` desde backend admin y constatar resultado; comprobar que no quedan factores/identidad de test según API permitida | Si falla la eliminación, incidentar y detener toda expansión; no borrar otros usuarios | `cleanup_confirmed` |
| 9 | Revisor independiente audita evidencia redactada y riesgos de revocación | Dictamen `PASS` formal solo con firma humana y prueba sustentada | `human_review_pending` |

**Rollback obligatorio:** ante cualquier error a partir del paso 1, ejecutar eliminación únicamente del identificador creado para V106, **tras revocar sus sesiones** cuando sea posible; registrar resultado de limpieza sin ID ni correo en la evidencia. Si la creación no devolvió un ID confiable, no realizar borrados a ciegas. Tras borrado, el token de acceso puede seguir siendo criptográficamente válido hasta que expire; no utilizar esa validez como prueba de sesión activa.

## 4. Matriz de pruebas que realmente aportan información nueva

| Caso | Resultado esperado |
| --- | --- |
| QA-01 | Login inicial del usuario sintético: usuario JWT coincidente; AAL1 |
| QA-02 | Tras `enroll`, desafío correcto pasa a AAL2 con método `totp` en AMR |
| QA-03 | JWT actualizado: sesión e identidad comparadas con las originales; documentar si Supabase mantiene o rota `session_id` |
| QA-04 | Código incorrecto o challenge de una sesión diferente: rechazo; **no probar otro usuario real** |
| QA-05 | `getClaims` puede aceptar un access token aún firmado tras logout; distinguirlo de revocación efectiva |
| QA-06 | El flujo conserva un solo consumo del comprobante local, sin afirmar protección distribuida |
| QA-07 | Admin elimina el usuario sintético después de revocación; limpieza y ausencia de recursos de prueba |
| QA-08 | Ningún token/secreto/código/correo/ID personal aparece en artefactos de evidencia |

No repetir V94B, 100 pruebas V102 ni las 22 pruebas V105 cuando no hubo cambios de código relacionado. Prioridad: evidencia nueva del **proveedor real**.

## 5. Custodia y aceptación

- Evidencia aprobable: decisiones sí/no, tiempos agregados, categoría de error, estado de limpieza y documento redactado.
- Evidencia prohibida: email real/ficticio completo, UUID de usuario, `session_id` real, contraseña, TOTP secret, `otpauth://`, QR, código TOTP, JWT, claves de Supabase, connection string, refresh token y cookies.
- Retención: no se ha definido política de custodia/retención formal, **pendiente de revisión independiente**. No enviar datos personales ni secretos a GitHub.
- Evaluación de seguridad: siguen abiertos `AUTH-01`, `AUTH-02`, `AUTH-03`, `DATA-01/02`, `OPS` y los **32 controles V67**.
- Coordinación: [PR #7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) permanece draft, [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) requiere revisor humano.

**V106: procedimiento diseñado; ejecución real NO AUTORIZADA/NO INICIADA.**  
**Se necesita autorización específica de una cuenta sintética TOTP y plan de limpieza**, además de capacidad de ejecución backend Auth, antes de avanzar. **Producción NO_GO.**
