# MG Web Studio Cloud — V97 | Autorización sensible con comprobación MFA reciente

**Corte:** 2 de noviembre de 2026 (Ecuador).  
**Alcance:** `apps/mg-web-studio-cloud`, exclusivamente código de servidor desacoplado, simulaciones y CI offline. **No** se conectó Supabase real ni se desplegó.
**Resultado:** [GitHub Actions V97 #41461264819](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41461264819) — **20/20 pruebas PASS, cero fallos**; informe dentro del [PR #7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7), que sigue en borrador.

## Por qué se implementó V97

Las 211 pruebas V88 (28 integración + 183 regresión) ya cubrían JWT ES256 firmados, revocación sintética y aislamiento multiempresa. V74 y V75 ofrecen límites de confianza para JWKS y verificación breve de `auth.sessions`; **no equivalen a MFA real**. Los valores `aal2`, `role`, `user_metadata` enviados por un cliente o extraídos del JWT no pueden conceder por sí solos permisos sensibles.

La documentación vigente de Supabase separa permisos de rol y políticas RLS. El backend debe confirmar el estado de sesión y MFA en una fuente autoritativa, y el recurso debe autorizarse por separado. Ver: https://supabase.com/docs/guides/database/postgres/row-level-security

## Implementación técnica

- `server/v97-sensitive-operation-gate.cjs` exporta `createSensitiveOperationGateV97({verifyAccessToken,readTrustedAssurance,authorizeResource,nowSec,maxProofAgeSec,maxFactorAgeSec})`.
- **No tiene proveedor por defecto**: las tres funciones confiables deben inyectarse desde el backend; no hay driver, red, almacenamiento, credenciales, decodificación JWT, logs ni consultas SQL en el módulo.
- Alcance restringido a tres acciones previstas: `publish`, `members`, `billing`. **El backend, no el cliente, debe fijar la acción desde la ruta.**
- Primero verifica el Bearer JWT, y solo recibe del verificador identidad firmada `{verified:true,subject}`. Ningún rol o claim de un cuerpo enviado por navegador se reutiliza como contexto de autorización.
- Segundo, el backend de confianza debe verificar **en origen real** que la sesión actual está activa, pertenece al token y al usuario, no fue revocada, y que el MFA alcanzó `aal2` y tiene un factor confirmado. V97 exige respuesta de estructura cerrada, `tokenSessionIdVerified:true`, `factorVerified:true`, `revocationChecked:true`, comprobación de no más de tres segundos y factor reciente (máximo cinco minutos por defecto). **Son declaraciones que el adaptador externo todavía tiene que probar en Supabase real.**
- Tercero, `authorizeResource` revalida acceso actual para `subject`, organización, sitio y acción. Solo se acepta el booleano **`true`**, sin conversiones de objetos ni textos. El módulo no revela existencia de recursos a solicitudes denegadas.
- Ante errores, pruebas vencidas, firma inválida, sesión desconocida, fallo de proveedor o cancelación, devuelve negación explícita y sin información sensible. `readiness.productionAuthorized=false`.
- No sustituye RLS, MFA de Supabase, permisos reales de PostgreSQL, bloqueo de sesiones ni operación de publicación.

## QA

| Evidencia | Resultado |
| --- | --- |
| Batería V97 de pruebas adversariales | **20/20 PASS** en el run `41461264819` |
| Verificación inicial | Falló parseo en cuatro aserciones del propio test; no llegó a ejecutar casos |
| Segunda ejecución | Identificó un error de validación de formato UUID (faltaba un grupo), que denegaba solicitudes legítimas; corregido |
| Verificación final | **20/20 PASS**, `completed/success`; Node con el bloqueador de red V70 |
| Integridad V95 en mismo commit | `success`; 32 controles V67 sin aprobación |
| Observabilidad V96 en mismo commit | `success` |
| PG17 / SQL / Supabase remoto | **No utilizados** |

**No se ejecutaron de nuevo V88 ni V94B**. Ninguna prueba envía tokens reales, firma humana o datos del usuario.

## Bloqueos antes de uso real

1. **AUTH-01:** conectar verificador confiable con origen JWKS fijado, TLS, rotación y pruebas de integración contra un sandbox aprobado. No usar directamente el navegador para aceptar credenciales de servicio.
2. **AUTH-02:** implementar el lector de sesión autoritativo, verificar que la sesión pertenece al token y al sujeto, y comprobar revocación real. El adaptador ficticio `readTrustedAssurance` de V97 **no puede demostrar esa vinculación por sí solo**.
3. **AUTH-03:** elegir un mecanismo respaldado por el proveedor para confirmar MFA reciente, recuperación, estados `aal2` y eventos de revocación. No confiar en claims mutables ni en que el token diga `aal2`.
4. **DATA-01/02:** confirmar permisos efectivos de PostgreSQL/RLS y ausencia de autorización basada en metadatos modificables; utilizar registros actuales por empresa y sitio.
5. **OPS-02:** someter resultados a revisor independiente en [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8), con revisión de privacidad, corrección de integraciones y autorización separada para producción.

## Estado formal

**Fase técnica V97 offline: terminada.**  
**MFA real y autenticación productiva: NO VERIFICADOS.**  
**V67: 32 PENDING / 0 PASS.**  
**PR #7: borrador, sin fusión. Producción: NO_GO.**
