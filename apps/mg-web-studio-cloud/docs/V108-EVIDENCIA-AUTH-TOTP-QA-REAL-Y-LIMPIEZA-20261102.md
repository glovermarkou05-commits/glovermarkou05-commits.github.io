# MG Web Studio Cloud · V108 | Primera evidencia Auth/TOTP QA real y limpieza

**Fecha:** 2026-11-02 (Ecuador).  
**Entorno:** `MG WEB STUDIO AUTH QA`, región `sa-east-1`. Nunca producción ni STAGING antiguo.  
**Naturaleza:** evidencia de ejecución local aportada por propietario + comprobación independiente de solo lectura desde el conector Supabase.

## 1. Resultado reportado por el ejecutor local

El propietario ejecutó el CLI del PR #7 desde PowerShell en Windows después del `--dry-run` aprobado, usando exclusivamente las claves QA en su propio equipo. Compartió únicamente esta salida no sensible:

```text
V107 RESULT: PASS; stage=COMPLETE; cleanup=CONFIRMED; V67=NO_GO
```

El contrato del ejecutor V107 exige para `COMPLETE`: laboratorio vacío antes de crear, una identidad `@example.invalid`, login con usuario y AAL1, inscripción de TOTP, challenge/verify, comparaciones de identidad, `session_id`, `aal2` y AMR TOTP actual, luego `signOut` y `admin.deleteUser` de la cuenta creada. **Esta cadena se infiere del código ya auditado y de la salida del proceso local**, no de que este agente haya observado tokens, OTP, filas de sesión o logs sensibles: no se recibieron ni recopilaron.

La evidencia recibida de `cleanup=CONFIRMED` refleja las respuestas exitosas del SDK, no por sí sola una inspección independiente de todas las tablas.

## 2. Inspección independiente inmediatamente posterior

Se volvió a consultar **solo el sandbox QA autorizado**, con una sentencia de agregación **`SELECT count(*)`** sobre siete tablas Auth, **sin devolver ninguna fila personal**:

| Tabla Supabase | Conteo |
| --- | ---: |
| `auth.users` | **0** |
| `auth.sessions` | **0** |
| `auth.identities` | **0** |
| `auth.mfa_factors` | **0** |
| `auth.mfa_challenges` | **0** |
| `auth.mfa_amr_claims` | **0** |
| `auth.refresh_tokens` | **0** |

`get_project` confirma **`ACTIVE_HEALTHY`**, `sa-east-1`, PostgreSQL `17.11.0.011`. `get_advisors(type=security)` devolvió una lista vacía de avisos; **no significa aprobación de seguridad integral**.

**Conclusión sobre residuos:** el estado persistido de esas siete tablas del laboratorio quedó **vacío** después de la ejecución real. Se comprobó independientemente del proceso local y de su `cleanup=CONFIRMED`. No existe evidencia de cuentas, sesiones, retos o factores de ensayo persistentes en las siete tablas verificadas.

## 3. Qué demuestra / qué NO demuestra

**Demostrado para el alcance QA:** creación y autenticación sintética, challenge/verify TOTP y comprobación de AAL2 descritas por el contrato V107; salida `PASS` real desde PowerShell; limpieza confirmada por API; y siete conteos a cero verificados por Supabase.

**No demostrado todavía:**
1. **Revocación estricta de un access token todavía vigente:** un JWT puede conservar firma y vida útil después de un logout. Los conteos de `auth.sessions` no constituyen prueba adversaria de rechazo instantáneo del token por todas las rutas.
2. **Consumo único distribuido:** la barrera `WeakMap` de V102 protege un proceso, no varias instancias ni workers independientes.
3. **Comparación adversaria de dos sesiones o reintentos MFA reales:** el ejecutor V107 valida una sola sesión/ciclo, y no ensaya challenge robado ni aislamiento entre dos cuentas.
4. **Autorización comercial tenant/site/rol:** observar AAL2 no verifica permisos de publicación, facturación o gestión de miembros.
5. **Firma de revisor independiente:** el PR #7 sigue `draft` y al comprobar sus revisiones GitHub devolvió **0**, no hay acta de una persona distinta del implementador.
6. **V67 formal:** permanece **32 PENDING / 0 PASS**; evitar asignar PASS basándose únicamente en el éxito de V107.

## 4. Próxima puerta de salida del proyecto

- Asignar una persona revisora independiente al [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) y entregar este expediente V108 sin credenciales.
- Diseñar y validar un mecanismo fiable de comprobación de revocación actual de `session_id` con controles de acceso backend y sin abrir permisos `auth` indebidamente.
- Implementar y ensayar anti-replay distribuido con un almacenamiento transaccional/atomicidad para la emisión y consumo de comprobantes.
- Revalidar el control por organización/recurso e impedir que JWT/AAL2 sustituyan autorización de negocio.
- No repetir la prueba V107 sin un nuevo propósito y controles. El laboratorio quedó vacío.

**Estado de entrega:** V107 **E2E QA PASS**, limpieza **verificada**, revisión independiente y V67 **NO_GO**. **PR #7 abierto y en borrador; ningún merge, publicación o alteración de otras aplicaciones.**
