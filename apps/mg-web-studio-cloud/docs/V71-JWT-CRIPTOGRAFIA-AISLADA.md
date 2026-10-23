# MG WEB STUDIO CLOUD — V71 | Verificador JWT asimétrico, aislado

**Etapa:** V71 · **Fecha:** 23/10/2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** pruebas criptográficas **nativas** y de integración con identidades sintéticas aprobadas. **No** se habilitó un emisor real, un servidor HTTP publicado ni una base de datos PostgreSQL.

## 1. Código entregado

- `server/jwt-public-verifier-v71.cjs`: `createJwtPublicVerifierV71({ issuer, audience, publicKeys, maxTokenAgeSec?, clockToleranceSec?, nowSec? })`. La configuración se inyecta desde **código de servidor confiable**. Retorna una función asincrónica `verifyAccessToken(token)` para V60.
- `tests/jwt-public-verifier-v71.test.cjs`: **35** pruebas con claves privadas **efímeras generadas durante las pruebas**. No se almacenan PEM, contraseñas, credenciales ni tokens firmados en GitHub.
- `tests/jwt-tenant-integration-v71.test.cjs`: **9** pruebas que integran firmas ES256 locales con **las implementaciones originales** del ensamblaje V69 y los módulos V60–V66, usando filas de PostgreSQL simuladas.
- `.github/workflows/mg-web-studio-v71-jwt.yml`: ejecución en Node 22 de las nuevas pruebas y siete suites regresivas V70, con GitHub `contents: read`, `persist-credentials: false` y protección `--require ./server/native-network-guard-v70.cjs`. No incluye despliegue.

## 2. Contrato criptográfico y controles

- **Algoritmos permitidos:** `ES256` (ECDSA P-256, firma JWT en formato IEEE P1363 de 64 bytes) y `RS256` (RSA con firma SHA-256 PKCS#1 v1.5; clave mínima de 2048 bits). Se rechazan `none`, `HS256`, `RS512`, `EdDSA` y cualquier algoritmo no configurado. El soporte de EdDSA/HS256 **no** se implementó.
- **Confianza en claves:** se aceptan **solo** JWK públicos inyectados por el operador del backend, con `kid` y `alg` vinculados al algoritmo real de la clave. Se rechazan material privado, `kid` duplicados, claves EC no P-256 y RSA débil. Un JWT **nunca** puede elegir URL `jku`/`x5u`, aportar `jwk` propio ni provocar descarga automática de llaves.
- **Cabecera JWT:** solo `alg`, `kid`, `typ=JWT` exactos. Firmas o segmentos Base64URL corruptos, no canónicos, demasiado grandes o con estructura inválida se rechazan sin exponer detalles.
- **Claims:** `iss` coincide exactamente con el emisor HTTPS configurado; `aud` incluye la audiencia exacta; `sub` debe ser UUID. `exp` e `iat` son enteros obligatorios y se controla duración máxima del token (por defecto 3600 s); `nbf` es opcional y se verifica si aparece. Tolerancia del reloj por defecto **0 s**, configurable hasta 60 s.
- **Salida mínima a V60:** un éxito devuelve solamente `{verified:true,subject:<uuid>}`; un fallo devuelve `null`. No se propagan `role`, `aal`, `user_metadata`, email, claims MFA o privilegios del navegador. **La autorización del tenant permanece en V61/V62**, revalidada por solicitud.
- **Sin I/O:** V71 no importa cliente Supabase, no lee variables de entorno, no consulta JWKS remoto, no abre puertos y no ejecuta SQL.

## 3. Evidencia nativa verificada

**GitHub Actions Run ID:** `39967095304`  
**Job ID:** `120459685037`  
**Commit ejecutado:** `b5380ff98e5aff31ee69bfb777dfdf17590e4104`  
**Resultado GitHub:** `completed / success`  
**Node.js:** `v22.23.3`

[Registros y ejecución de V71](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39967095304)

| Batería ejecutada | Aprobadas | Fallidas |
| --- | ---: | ---: |
| Verificación JWT ES256/RS256 local y cadena de permisos original V60–V69 | **44/44** | **0** |
| Regresión de las siete suites V70, bajo bloqueo de red | **92/92** | **0** |
| **Total de tests ejecutados** | **136/136** | **0** |

Pruebas destacadas: token ES256 y RS256 válidos, rotación **estática** de claves públicas (instanciar nuevo verificador), manipulación de firma/cabecera/payload, claves no coincidentes, emisor o audiencia incorrectos, expiración, `nbf` futuro, `iat` futuro, algoritmo inseguro, cuerpo o token malformed, encabezados `Authorization` duplicados, permisos `CLIENT_VIEWER`, empresa extranjera y membresía revocada en repositorio simulado.

La configuración de red bajo `--require` impide APIs enumeradas de listeners y clientes Node durante las pruebas. GitHub Actions puede utilizar red **para obtener el repositorio y configurar Node antes de los tests**. No confundir el bloqueo de APIs de prueba con aislamiento total a nivel del sistema operativo.

## 4. Riesgos y dependencias pendientes

1. **Revocación de sesiones:** validar criptográficamente un JWT **no** garantiza que una sesión continúe habilitada. Debe desarrollarse un contrato de revocación con fuente confiable, `session_id` y política de consistencia antes de aceptar sesiones de usuarios reales.
2. **Rotación/JWKS real:** el conjunto de claves públicas es explícito e inmutable en cada verificador. **No hay** descarga de `/.well-known/jwks.json`, actualizaciones, eliminación por revocación, control de caché ni mecanismo de fail-closed contra claves antiguas; son trabajos para otra etapa. Cualquier caché de llaves deberá considerar la revocación urgente. No incrustar claves secretas.
3. **Autenticación Supabase real:** no se comprobó el emisor, audiencia, claims y firma de un proyecto conectado; el emisor `https://issuer.test/auth/v1` es ficticio. Supabase admite distintas modalidades de firma; V71 **solo** admite claves asimétricas ES256/RS256 y deberá estar alineada con la modalidad del proyecto antes de activar Auth.
4. **Librería y casos límite:** el parser local usa JSON nativo tras comprobar sintaxis UTF-8/Base64URL y no implementa detección expresa de claves JSON duplicadas. Se recomienda realizar revisión criptográfica independiente y evaluar una librería JOSE mantenida y auditada antes de producción. La verificación propia actual **no se declara auditada ni lista para producción**.
5. **Persistencia real:** no hubo conexión a PostgreSQL, RLS/grants ni prueba de recuperación; las filas utilizadas para autorización son simuladas. Las 32 verificaciones operativas definidas en V67 siguen pendientes.
6. **Servidor HTTP real:** aún no se abrió un listener para probar parser/framing reales, proxies, TLS ni escenarios TCP. Se requiere autorización específica para una prueba local de red.
7. **Separación de autorizaciones:** la V71 no concede permiso de publicación, migraciones, cambios de datos, consumo de créditos Lovable ni acceso a producción.

## 5. Siguiente etapa propuesta — V72

Diseñar un **proveedor JWKS seguro con caché acotada, rotación y revocación de claves**, y un contrato aislado de comprobación de sesiones con estado fresco. Primero con mocks y relojes simulados; no conectarlo a Supabase Auth sin autorización explícita y revisión del origen de confianza.

**Dictamen:** V71 **completada en código y pruebas nativas (136/136 ejecutadas con datos sintéticos)**. Conexión Auth real, cancelación de sesiones, PostgreSQL, recuperación y despliegue: **NO GO**.
