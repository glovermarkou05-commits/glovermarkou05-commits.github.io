# MG WEB STUDIO CLOUD — V63 | Frontera HTTP de solo lectura (aislada)

**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** módulo CommonJS y tests locales con datos sintéticos. No existe servidor escuchando, endpoint publicado, cliente PostgreSQL, JWT real, conexión Supabase ni migraciones. Producción/publicación: **NO GO**.

## Objetivo y resultado

Se añadió `server/http-site-gate-v63.cjs`, una frontera que consume exclusivamente un **sobre de solicitud ya validado por el transporte**:

```js
{
  method: 'GET',
  target: '/api/v1/organizations/:organizationUuid/sites/:siteUuid/access',
  rawHeaders: ['Authorization', 'Bearer <token>'], // pares originales sin normalizar
  bodyBytes: Buffer.alloc(0) // cuerpo íntegro; el transporte ya lo limitó
}
```

La ruta anterior es **solo un contrato dentro de una función**, no una URL disponible por red. La acción `read` se establece en el código del servidor, nunca desde los campos o cabeceras del navegador. El adaptador recibe `authorize` explícitamente y utiliza la autorización de V61 con el contrato V60/V62. No implementa publicación, edición, cobros ni mutaciones.

## Controles del módulo

- Requiere `rawHeaders` en parejas originales, nunca usa `headers` ya normalizados; rechaza **todas** las cabeceras duplicadas, incluida Authorization sin importar mayúsculas.
- Valida tokens de nombre de cabecera, caracteres prohibidos y límites: **64 elementos** de `rawHeaders` como máximo (**32 parejas**), valores hasta **8192 caracteres** y tamaño agregado hasta **16 KiB**; rechazo 400/431 según caso.
- Niega `Transfer-Encoding`, `Expect`, `Cookie`, `Proxy-Authorization`, Content-Length no cero y cualquier cuerpo no vacío. El sobre debe incluir un `Buffer` vacío y completo. Este método **no lee ni limita streams de red** por sí mismo.
- Solo acepta `GET`; otros métodos devuelven 405. La ruta es exacta, utiliza UUID canónicos, no admite query strings, fragmentos, porcentajes codificados ni rutas auxiliares. El límite del target es 512 caracteres.
- Ausencia de Authorization: 401; recurso inexistente o fuera de ámbito: 404; rol insuficiente validado: 403; consulta dependiente no disponible: 503; respuestas malformadas: error interno genérico.
- Responde JSON mínimo con `requestId` generado en servidor, sin actor, rol, empresa, sitio, token, error SQL ni secretos. Establece `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`.
- Rechaza respuestas positivas con contexto de empresa/sitio inconsistente. Las decisiones denegadas solo se exponen si coinciden con la lista cerrada de códigos internos permitidos.

## QA local verificado

Comando desde `apps/mg-web-studio-cloud`:

```sh
node --test tests/http-site-gate-v63.test.cjs tests/http-site-gate-v63-integration.test.cjs
```

Resultado con Node **22.16.0**: **38/38 pruebas correctas** (28 unitarias + 10 de integración simulada V60–V63).

Ejecución conjunta de las suites disponibles V62 y V63: **70/70 pruebas correctas, 0 fallos**. Las pruebas de V60/V61 se reutilizan a través de sus módulos en la integración simulada; el total 70 **no** añade todas sus suites independientes.

Los tests incluyen doble Authorization con capitalización mixta, valores y cabeceras malformados, límites de longitud, cuerpo, método, rutas exactas, identidad falsificada, errores privados, concurrencia, suspensión/revocación simulada, acceso entre organizaciones y esquema de respuesta seguro.

## Límites de seguridad pendientes (no declarar producción lista)

1. El futuro adaptador de transporte HTTP deberá detectar duplicados antes de cualquier normalización, revisar proxies intermedios y preservar `rawHeaders`; limitar duración, bytes de stream, conexiones y recursos **antes** de construir el sobre validado. No se han probado solicitudes reales por red.
2. El módulo requiere un `Buffer` con **todo el cuerpo**. No es correcto pasar directamente un `http.IncomingMessage`; tampoco garantiza manejo de HTTP smuggling en proxies, TLS, cabeceras inválidas descartadas por Node o reglas de infraestructura.
3. La identidad V60 requiere verificación criptográfica real del token, emisor, audiencia, expiración y revocación; MFA, controles contra abuso y registro seguro de incidentes siguen pendientes.
4. La fuente PostgreSQL de V62 aún requiere un driver real, credenciales de servidor de mínimo privilegio, TLS, políticas RLS/GRANT validadas y consultas con timeout. Una respuesta 200 de esta frontera **solo indica que pasó la evaluación de acceso con fuentes configuradas**, no expone contenido ni equivale a certificado de seguridad.
5. La revalidación V61/V62 por solicitud no evita por sí sola carreras TOCTOU en escrituras futuras, que deberán validar autorización dentro de cada transacción.
6. El ensayo de recuperación PostgreSQL sigue pausado. No se ejecutó SQL ni se alteró STAGING, sus datos, publicaciones ni otros proyectos.

## Siguiente etapa propuesta V64

Desarrollar un **adaptador de transporte Node HTTP en laboratorio local** que capture cabeceras crudas y consuma streams con límite de bytes/tiempo antes de usar la función V63; probarlo solo con datos sintéticos y una interfaz de loopback o simulaciones, sin desplegar, integrar Auth real ni abrir acceso externo.

**Dictamen:** V63 terminada a nivel de módulo y QA aislado. STAGING/producción: **NO GO**.
