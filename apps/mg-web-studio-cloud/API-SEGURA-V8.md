# MG WEB STUDIO CLOUD — V8 | Contrato de API segura (solo diseño y simulación)

**Fecha:** 16 de octubre de 2026.
**Estado:** implementación de un **mock JavaScript**, no API HTTP ni servidor conectado, en \`feature/mg-digital-v5-web-services\`.

## Archivos
- \`shared/mg-api-security-mock.js\` — enrutador simulado, autoriza a un actor entregado por un callback de identidad *ficticio*.
- \`tests/api-security-mock.test.cjs\` — tests de Node sin instalar paquetes.
- \`shared/mg-persistence-simulator.js\` — repositorio volátil V7 de borradores y releases.

## Contrato propuesto (sin endpoints desplegados)

| Método | Ruta | Actor y permiso |
|---|---|---|
| GET | /api/me/organizations | Sesión autenticada; solo organizaciones de membresía activa |
| GET | /api/admin/organizations | SUPERADMIN en directorio privado, sesión verificable y MFA |
| GET | /api/organizations/:orgId/sites | Miembro activo del tenant; filtra sitios por alcance |
| GET | /api/organizations/:orgId/sites/:siteId | Miembro activo con permiso de lectura de ese sitio |
| GET | /api/organizations/:orgId/sites/:siteId/capabilities | Capacidades derivadas en servidor de la membresía |
| GET | /api/organizations/:orgId/sites/:siteId/draft | Miembro con permiso de lectura |
| PUT | /api/organizations/:orgId/sites/:siteId/draft | OWNER/ADMIN/EDITOR en sitio, \`expectedVersion\` y operación idempotente |
| GET | /api/organizations/:orgId/sites/:siteId/releases | Lectura autorizada de instantáneas |
| POST | /api/organizations/:orgId/sites/:siteId/releases | Solo OWNER/ADMIN autorizado; \`expectedVersion\` e idempotencia |
| GET | /api/organizations/:orgId/sites/:siteId/changes | Lectura autorizada de eventos incrementales |

La ruta no habilita por sí misma una operación. **El servidor resuelve actor, membresías y organización; jamás acepta el rol proporcionado por la URL, el body o el navegador.** Los eventos de publicación no incluyen formularios privados de contacto.

## Semántica de errores de referencia
- \`400 INVALID_ID\`: valores malformados.
- \`401 UNAUTHENTICATED\`: falta identidad verificada.
- \`403 FORBIDDEN\`: membresía revocada, acción fuera de rol, otro sitio u otra organización.
- \`403 ADMIN_MFA_REQUIRED\`: falta pertenencia interna SUPERADMIN o MFA.
- \`404 NOT_FOUND\`: recurso no disponible/no registrado.
- \`405 METHOD_NOT_ALLOWED\`: método desconocido.
- \`409\`: conflicto de versión o reutilización de Idempotency-Key con otro payload.
- \`422\`: borrador inválido.
- \`200\`: lectura, guardado o publicación de prueba.
Las respuestas incluyen \`Cache-Control: no-store\` en este mock.

## Roles de ejemplo
- OWNER: leer, editar, publicar, administrar colaboradores, soporte, suscripción.
- ADMIN: lo anterior excepto suscripciones.
- EDITOR: leer y editar **solo el sitio asignado**, sin publicar.
- VIEWER: leer **solo el sitio asignado**.
- SUPERADMIN: **no** está en los roles invitables. Solo el backend interno podrá verificarlo y aplicar MFA real. En el mock una función de prueba devuelve el dato supuesto y la propiedad \`aal2\`; no son prueba real de identidad.

## Bloqueos obligatorios antes de convertirlo a un servidor
1. Nunca pasar \`sessionKey\` de prueba al backend real: el mock delega \`getTrustedSession(req)\` al arnés de tests. En producción ese callback deberá usar una sesión verificable criptográficamente en middleware, no un input del cliente.
2. Corregir esquema preliminar RLS por **sitio autorizado**, incluso entre sitios de la misma organización. Usar FK compuesta org/site/membership/scope y revisar grants. No ejecutar los scripts \`*.review.sql\` actuales.
3. Aplicar permisos **en servidor** para cada lectura y escritura, más RLS defensa en profundidad, \`USING\` y \`WITH CHECK\`. Evitar \`service_role\` en navegador y claims \`user_metadata\`.
4. Uso de sesiones/MFA reales y revocación rápida; nunca confiar en un rol del navegador ni en datos de URL \`mgdemo\`.
5. Auditoría transaccional, límites de tamaño y tasa, protección CSRF según arquitectura de cookies, cabeceras de seguridad y validación completa.
6. Guardado concurrente con comparación atómica de versión + evento de cambios + clave idempotente y outbox, en la misma transacción.
7. Actualización/publicación solo de revisiones permitidas; persistencia de imágenes y releases inmutables con restauración.
8. Pruebas de postgres SQL/RLS mediante cuentas de prueba reales y CLI vigente, después de crear base exclusiva y **aprobar costo y región**.

### QA
**43/43 pruebas simuladas correctas**, incluidas sesiones inválidas, usuario revocado, SUPERADMIN sin MFA, rol manipulado en body, cruce entre tenants, EDITOR en otro sitio del mismo negocio, control de lectura y publicación, conflicto de versión, reintentos, invalidación de caché y revocación de membresía.

Ejecutar en entorno local con Node:
\`node apps/mg-web-studio-cloud/tests/api-security-mock.test.cjs\`

Estas pruebas NO demuestran que Supabase RLS o un servidor real sean seguros. No se han creado ni consultado usuarios reales en Supabase, ni realizado migraciones.

**Sin cambios en \`main\`, sin gastos, sin claves de proveedor y sin despliegue.**
