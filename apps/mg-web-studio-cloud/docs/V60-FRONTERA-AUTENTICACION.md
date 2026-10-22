# V60 — Entrada de autenticación para servidor

Rama: `feature/mg-digital-v5-web-services`.

## Resultado

Se añadió `server/auth-boundary.cjs`, módulo CommonJS sin dependencias externas ni efectos de red o base de datos. No está conectado a las páginas demo ni expone un servidor HTTP.

La revisión encontró `shared/mg-tenant-security-v23.js`, cuyo evaluador acepta sesiones ficticias del llamador y declara expresamente ser demo. V60 no reutiliza ese objeto como identidad real.

El nuevo módulo exige configurar `verifyAccessToken` desde el servidor. Extrae un único Bearer, falla cerrado ante credenciales ausentes, resultados no verificados o excepciones y devuelve únicamente el identificador de actor obtenido del verificador. Rechaza campos superiores reservados de identidad/roles/scope/MFA en el cuerpo. No interpreta campos anidados: cada endpoint deberá aplicar su propio esquema cerrado de entrada.

## Contrato obligatorio de integración

- El verificador se configura en código servidor, jamás desde parámetros del navegador. Debe validar autenticidad, emisor, audiencia, expiración y la política elegida de revocación antes de devolver `{ verified: true, subject }`. No hay verificador real implementado en esta etapa.
- El adaptador HTTP debe rechazar cabeceras Authorization duplicadas antes de normalizarlas, limitar cuerpo y tiempos de solicitud y manejar fallos externos. Los errores del verificador actualmente devuelven 401 genérico; distinguir indisponibilidad como 503 queda para la integración con errores tipados.
- `ok: true` solo indica el resultado del paso de autenticación. Nunca autoriza un recurso, rol, organización, sitio, publicación o mutación. Cada operación necesita resolver pertenencia y scope en servidor.
- La política MFA y las comprobaciones de revocación real siguen pendientes. No se transporta MFA ni roles desde el cliente.
- El módulo debe permanecer en servidor. No incluir credenciales privadas en HTML, bundles, logs ni pruebas.

## Pruebas ejecutadas

Comando, desde `apps/mg-web-studio-cloud`:

`node --test tests/auth-boundary-v60.test.cjs`

Resultado en el entorno del agente con Node 24.19.0: **12/12 tests unitarios correctos**, cero fallos. Cubren contrato del verificador, entradas inválidas, errores sin secretos, campos falsificados, aislamiento de solicitudes y reevaluación por llamada. Se usan verificadores de prueba; no acreditan JWT real, revocación real, Auth/HTTP, RLS ni recuperación. No se utilizó el disco C: del usuario.

## Registro y continuidad

- V59: matriz de aceptación documental preparada; sus 14 casos HTTP siguen pendientes.
- V60: módulo de entrada y pruebas unitarias completados, sin integración operativa.
- Siguiente: resolver pertenencia organización/sitio y permisos usando un repositorio de servidor; integrar después el verificador real y el adaptador HTTP con pruebas autorizadas.
- Recuperación: pausada por espacio local (última evidencia: 2,6 GB libres); backup/restore no ejecutados.
- Producción/publicación: NO GO. Sin SQL, migraciones, despliegues ni gasto en servicios.
