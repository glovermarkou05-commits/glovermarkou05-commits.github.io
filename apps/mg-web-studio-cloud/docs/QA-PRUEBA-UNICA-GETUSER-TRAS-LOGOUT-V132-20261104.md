# MG Web Studio — decisión única de QA para revocación de sesión

**4 de noviembre de 2026, Ecuador.** Preparado para el propietario; todavía **NO EJECUTADO**.
**Proyecto fijo:** `MG WEB STUDIO AUTH QA` — `tbfhiqkivsoeuudlpkgi` (jamás producción).

## Por qué es necesario este ensayo y no más simulaciones

Supabase indica que los **access tokens JWT** pueden continuar siendo válidos hasta `exp` después de cerrar sesión, mientras que `getUser(jwt)` hace una consulta auténtica al servidor Auth. La documentación recomienda `getUser` donde importa detectar un cierre de sesión, pero **no demuestra** que para la configuración de este proyecto un token antiguo será denegado inmediatamente. Debemos comprobar ese comportamiento una sola vez.

Fuentes: [Signout: tokens existentes hasta exp](https://supabase.com/docs/guides/auth/signout) · [Advanced SSR: getUser para comprobar cierre de sesión](https://supabase.com/docs/guides/auth/server-side/advanced-guide) · [Sesiones: validación estricta de session_id](https://supabase.com/docs/guides/auth/sessions).

V132 supera **12/12** en contrato simulado y **32/32** con PostgreSQL temporal, pero ninguna de esas suites usa una cuenta Auth real. El diseño no garantiza revocación linealizable entre `getUser` y COMMIT.

## Prueba preparada (deshabilitada por defecto)

[Script Windows PowerShell de un solo uso](../qa/comprobar-revocacion-auth-v132-qa.ps1)

El script está fijado a la URL QA; **no** crea cuentas, usuarios, roles, tablas, policies o funciones. No toca `auth.sessions` y no requiere `service_role` o `sb_secret_`. Exige que el propietario:

1. Autorice **solo** crear/utilizar **una cuenta temporal de QA** para esta validación y cerrar su sesión local de prueba.
2. Cree, después de la autorización, una cuenta QA temporal en el Dashboard de Supabase con un correo que contenga `qa` y una contraseña exclusiva. No usar credenciales reales ni de producción. El script **no crea la cuenta**.
3. Consulte en Settings → API Keys la clave **pública `sb_publishable_`** del **proyecto QA**. Nunca enviar a ChatGPT la contraseña, token ni clave secreta. Se introducirán localmente en Windows.
4. Examine el script y decida ejecutarlo desde PowerShell usando el parámetro deliberado `-AutorizoCerrarSesionTemporalQA`; el script requiere escribir `CONFIRMO_QA` y abre un diálogo para credenciales. No ejecutar antes de autorización expresa.
5. La herramienta hace inicio de sesión con contraseña de la cuenta temporal, consulta `GET /auth/v1/user`, realiza **`POST /auth/v1/logout?scope=local` exclusivamente sobre esa sesión**, y vuelve a consultar al mismo `/user` **con el JWT antiguo**, en memoria, sin imprimirlo ni guardarlo.
6. Tras revisar únicamente el resultado de estado, eliminar/revocar la **cuenta temporal** desde el Dashboard y verificar que QA volvió a no tener usuarios/sesiones de ensayo. El script **no elimina automáticamente** usuarios ni intenta reintentos de red.

**Solo se permite una ejecución inicial**. Ante respuesta incierta, registrar `INCONCLUSO` y revisar el error; no repetir automáticamente el cierre de sesión.

## Interpretación y decisiones

| Resultado | Significado | Acción |
| --- | --- | --- |
| `TOKEN_ANTIGUO_SIGUE_ACEPTADO_POR_GETUSER` | `getUser` admite el JWT viejo después de logout | **NO** usar V132 para revocación inmediata de operaciones sensibles; rediseñar control de sesión o aceptar explícitamente el horizonte JWT solo para funciones de menor riesgo |
| `GETUSER_RECHAZA_TOKEN_TRAS_LOGOUT` | En este ensayo QA la API rechazó el token viejo | Confirmar que la denegación responde al cierre y no a otro error; aun así NO hay garantía linealizable tras el último check, ni autorización de producción |
| `INCONCLUSO`, login o red fallidos | No se ha demostrado el comportamiento | Mantener NO_GO para operaciones sensibles, revisar documentación y configuración |
| Sin cuenta/autorización de QA | No se prueba | Mantener el script **sin ejecutar** |

**Diferencia crítica:** autenticar un JWT y comprobar la identidad `getUser` es distinto a demostrar revocación inmediata, y no reemplaza autorización por recurso, idempotencia, ni revisión de permisos.

## Estado y límites

- Cuenta de prueba: **NO CREADA**.
- Consentimiento específico de cambio de estado Auth QA: **NO OTORGADO**.
- Ejecución del script contra QA: **NO EJECUTADA**.
- PR #7: DRAFT, sin fusionar; producción NO_GO.
- Formal V67: 0/32 aprobados; V95: 69% cobertura técnica estimada, no reevaluada.
- Auditoría externa: **opcional para seguir desarrollando**, pero **no se fabricará** una certificación externa o firma formal. La validación de seguridad y publicación exige evidencia suficiente para el riesgo de cada función.

**Próxima autorización posible, NO otorgada aún:** «Autorizo una prueba de revocación en `tbfhiqkivsoeuudlpkgi` con una sola cuenta temporal, inicio de sesión y logout local de esa cuenta; sin DDL, sin claves administrativas, sin producción y con limpieza al finalizar».
