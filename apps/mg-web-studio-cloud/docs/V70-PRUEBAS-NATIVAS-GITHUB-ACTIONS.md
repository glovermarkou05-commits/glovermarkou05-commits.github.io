# MG WEB STUDIO CLOUD — V70 | Prueba nativa del backend aislado en GitHub Actions

**Fecha de verificación:** 23 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** **32/32 pruebas de Node.js nativo correctas**, 0 fallos, sin servicios reales.  
**Producción/STAGING/publicación:** **NO GO**.

## Qué se hizo realmente

Se añadió una nueva suite con `node:test`:

- `tests/unbound-tenant-stack-v70-native.test.cjs` — 25 comprobaciones de integración nuevas.
- Se ejecutó conjuntamente con `tests/unbound-tenant-stack-v69-real.test.cjs` — 7 comprobaciones de continuidad.
- Ambas suites importan el **código original CommonJS del repositorio** para V60 autenticación, V61 autorización, V62 consultas parametrizadas, V63 puerta HTTP, V64 transporte, V65 configuración del servidor, V66 admisión de solicitudes y V69 ensamblaje.
- Los verificadores de token y respuestas de `query({text,values})` son **funciones de prueba** con UUID y datos totalmente sintéticos; el test **no utiliza PostgreSQL remoto ni validación JWT criptográfica real**.
- La solicitud `IncomingMessage` y la respuesta `ServerResponse` son eventos/objetos simulados. La suite construye un `node:http.Server` real **sin llamar a `listen()`**: prueba el ensamblaje en Node nativo, **no** el parser sobre la red.

## Ejecución y evidencia independiente

Se creó `.github/workflows/mg-web-studio-v70-native.yml`, restringido a la rama `feature/mg-digital-v5-web-services` y sus rutas de código/pruebas. Utiliza `ubuntu-latest`, Node.js 22, **permisos `contents: read`**, `persist-credentials: false`, sin secretos, sin SQL y sin pasos de build, despliegue ni publicación.

**GitHub Actions — ejecución:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39957263707

| Evidencia | Resultado verificado |
|---|---|
| ID de ejecución | `39957263707` |
| ID del job | `120426096780` |
| Commit probado | `11c08c71e0394d8a713cc415bd4f0b97638b5144` |
| Rama probada | `feature/mg-digital-v5-web-services` |
| Node.js del job | `v22.23.3` |
| Suite V69 real | 7 pruebas |
| Suite V70 nueva | 25 pruebas |
| Total | **32 correctas, 0 fallidas, 0 omitidas** |
| Estado del workflow y job | **`completed / success`** |

La evidencia se consultó directamente en el registro y los pasos del job. La ejecución no verifica nada que ocurra después de ese commit: un cambio futuro necesita una nueva ejecución verde. El flujo se ejecutará en futuras modificaciones de archivos de servidor o de las suites indicadas, únicamente en la rama de desarrollo.

GitHub informa que los ejecutores estándar de GitHub Actions no tienen costo para repositorios **públicos**; la visibilidad pública de este repositorio se confirmó y el flujo no usa ejecutores grandes ni servicios externos de pago. Referencia: https://docs.github.com/en/actions/reference/runners/github-hosted-runners

## Escenarios nativos cubiertos

- Lectura autorizada con respuesta mínima (200) y `Cache-Control: no-store`.
- Ausencia de Authorization (401), token inválido (401), cabeceras Authorization duplicadas (400).
- Organizaciones y sitios ajenos (404) sin revelar IDs de clientes.
- Desconocimiento de campos `X-Role`, `X-User-Id` y `X-Forwarded-For` para decisiones de autoridad.
- Revocación de membresía y pérdida de ámbito del sitio entre dos solicitudes (404).
- Suspensión de organización y sitio (404), rol interno no permitido (404).
- Sentencias **`SELECT` parametrizadas y predefinidas**, sin SQL derivado de entrada de cliente.
- Ruta con UUID malformado (404), POST no permitido (405), cuerpo GET no permitido (400) y cabeceras de framing duplicadas/prohibidas (400).
- Errores simulados del proveedor de identidad y de consultas sin filtración de secretos.
- Límite V66 por origen: 30 solicitudes válidas y 31.ª rechazada con `429 RATE_LIMITED`; otro origen de prueba conserva su cuota.
- Construcción del servidor Node **sin abrir sockets**, y permanencia de V67 `32/32 PENDING` con decisión `NO_GO`.

## Reproducción

Desde `apps/mg-web-studio-cloud`, con Node.js 22:

```sh
node --test tests/unbound-tenant-stack-v69-real.test.cjs tests/unbound-tenant-stack-v70-native.test.cjs
```

Esta orden no realiza operaciones remotas, no abre puertos y no requiere bases de datos, tokens reales, variables de entorno ni claves. El flujo de GitHub usa la misma orden, sobre el commit exacto de la rama.

## Lo que aún NO está validado

1. **HTTP de red y parser verdadero:** aún se necesitan ensayos reales sobre una interfaz de laboratorio aprobada. Ninguno de los 32 controles operativos V67 se marca como aprobado por la V70.
2. **Autenticación y MFA reales:** hay que probar verificación criptográfica de JWT (firma, emisor, audiencia, caducidad, revocación, sesiones) y condiciones de autenticación elevada.
3. **PostgreSQL real:** faltan TLS, rol de mínimos privilegios, políticas efectivas RLS/GRANT, timeout/cancelación de queries, carrera de autorización y pruebas de acceso entre empresas.
4. **Protección en infraestructura:** límites reales de sockets, proxies, logs/retención, rate limit distribuido, saturación y manejo de errores del parser.
5. **Recuperación:** el respaldo y restore PostgreSQL 17, verificación de índices/esquemas/grants y medición RPO/RTO continúan pendientes.
6. **Publicación:** requiere **aprobación específica e independiente**; V70 no modifica producción, staging, Lovable, despliegues ni `main`.

## Próxima etapa — V71 propuesta

Completar un checklist operable de laboratorio HTTP real y su aislamiento de red: entorno, responsable, interfaz loopback, puerto, versión de Node/proxy, límites y evidencia esperada. **No** ejecutar `listen()` ni solicitudes TCP hasta que el usuario autorice explícitamente la prueba de laboratorio con esos parámetros. Alternativamente, desarrollar primero un verificador JWT de prueba con claves sintéticas en el laboratorio aislado y controles específicos de issuer/audience/exp sin contactar Supabase.

**Dictamen final V70:** integración nativa reproducida de módulos originales con identidad y SQL simulados, **32/32 PASS**. Preparación de backend real, recuperación y producción continúan **NO GO**.
