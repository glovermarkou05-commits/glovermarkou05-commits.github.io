# MG WEB STUDIO CLOUD — QA de formularios y solicitudes comerciales

**Fecha:** 15 de octubre de 2026.
**Ámbito:** demostración HTML con datos exclusivamente locales, sin backend, sin envío real de mensajes.

## Entrega
- Tipo de bloque «Formulario de contacto», disponible en el editor visual desde el plan Start de demostración.
- Plantilla «Contacto» incorpora automáticamente el bloque de formulario.
- Formulario de muestra: nombre ficticio, correo ficticio, motivo, mensaje de ejemplo y confirmación explícita de que solo se usarán datos ficticios.
- Campo trampa antihoneypot y validación mínima de longitudes, correo e interés.
- Una bandeja «Solicitudes» **por sitio** con lista, fecha de simulación, página de origen, motivo y mensaje, filtro por estado, notas internas y cambio de estado.
- Estados: Nueva, En seguimiento, Atendida y Descartada. Consulta de ejemplo creada desde la propia bandeja.
- El rol ficticio de solo lectura puede probar el formulario (simula a un visitante), pero no puede editar estados/notas.
- Escapado de texto al mostrar mensajes; no se interpreta HTML escrito como consulta.
- Cupo de seguridad de 50 consultas temporales por negocio; todos los datos se pierden al recargar.
- Una consulta de prueba **no modifica catálogo, páginas, historial de publicaciones ni instantáneas existentes**.
- Advertencia «CONTACT_DEMO» durante la revisión previa a publicación.

## Pruebas ejecutadas con DOM simulado
**58/58 verificaciones correctas**:
- Validación de ejemplo permitido.
- Rechazo por falta de confirmación de demostración, campo trampa, correo incorrecto, mensaje corto y motivo desconocido.
- Registro de la solicitud en el negocio y página de origen correctos.
- No crear un release ni modificar versiones al registrar una consulta.
- Seguimiento y notas; rechazo de estado inexistente.
- Bloqueo de edición para rol CLIENT_VIEWER.
- Separación del historial de consultas entre empresas ficticias.
- Rechazo de una página de origen inexistente.
- Vista previa con formulario editable de demostración en un bloque de contacto.
- Escape de HTML de entrada (evita interpretar elementos escritos en el mensaje).
- Renderizado de **18 módulos × 2 negocios** con datos ficticios, sin excepciones durante la simulación.

## Pendiente antes de procesar consultas reales
1. Pruebas manuales de formularios, teclado, etiquetas, foco y diseño en navegadores/dispositivos.
2. Texto y aceptación de política de privacidad real; cumplimiento del marco de protección de datos aplicable en Ecuador y definición de responsables.
3. Endpoint seguro de recepción con validación en servidor, controles de spam y rate limits, CAPTCHA cuando corresponda, protección de abuso e idempotencia.
4. Guardado seguro con tenant/site verificables y controles de acceso de lectura y escritura (RLS). **No permitir escritura directa de visitantes en tablas internas.**
5. Políticas de retención, eliminación, auditoría, encriptación en tránsito, notificaciones solo si se autorizan expresamente.
6. Formularios públicos alojados en páginas verificadas. Esta maqueta es un panel de pruebas y no recibe formularios externos.
7. Pruebas de aislamiento entre tenants con cuentas reales; los roles ficticios no constituyen autenticación.

**Sin modificaciones a la organización Supabase, sin créditos Lovable, sin cambios en `main`.**
