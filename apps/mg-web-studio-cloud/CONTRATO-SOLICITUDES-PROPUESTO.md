# Contrato de referencia — Recepción de consultas comerciales (sin implementar)

Este documento describe una interfaz futura, no un endpoint desplegado ni un servicio ya disponible.

## Propuesta de intercambio
`POST /api/public/sites/{public_site_id}/inquiries`

El navegador enviaría: ID del formulario publicado y página, nombre, correo, motivo, mensaje, confirmación de privacidad, token antispam y clave de idempotencia. **Jamás se aceptaría un `organization_id` indicado por el visitante para seleccionar a qué empresa se asigna una consulta.** El servidor resuelve propietario/tenant desde el dominio y el ID público verificados de la publicación activa.

El servidor comprobaría:
- Formulario efectivamente publicado en una versión activa del sitio, dominio válido y TLS.
- Validación de longitudes, formatos, origen y consentimiento.
- Rate limit por origen/sitio con protección de privacidad, captcha/abuso y límites máximos de tamaño.
- No publicar información sensible en errores ni incluir el contenido del mensaje en logs.
- Política de retención, eliminación y acceso por rol.
- Registro de evento y persistencia transaccional; respuesta genérica para evitar enumeración.

## Consultas dentro del panel
`GET /api/admin/sites/{site_id}/inquiries` y `PATCH /api/admin/sites/{site_id}/inquiries/{id}`

Solo sesiones verificadas de miembros del sitio con permiso. Para cada consulta, comprobar autorización a nivel de servidor y políticas RLS para lectura y actualización; separar lectura de edición. Nunca confiar en que un selector de rol de frontend aplica los permisos.

## Ciclo y auditoría
Nueva → En seguimiento → Atendida (o Descartada), notas internas y registro de cambios. Las consultas no deben incluirse dentro de snapshots publicados o copias públicas del sitio. Respaldo/retención deben tratarse por separado y documentarse.

## Seguridad y privacidad
En el prototipo los mensajes usan solo **datos ficticios** y se guardan en RAM. Antes del lanzamiento: revisión legal de privacidad en Ecuador, aprobación de costos de hosting/base de datos, y validación de autenticación, almacenamiento, seguridad y monitoreo. No se deben activar respuestas automáticas ni envíos externos sin consentimiento/autoridad específica.

**Ningún endpoint fue creado ni se realizó una migración.**
