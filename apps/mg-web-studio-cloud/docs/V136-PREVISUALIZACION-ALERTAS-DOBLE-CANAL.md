# V136 — Vista previa de alertas WhatsApp y correo, sin envíos

**Fecha:** 2026-11-06, Ecuador. **Alcance:** solo revisión y pruebas offline en PR #7 DRAFT; sin activar proveedores, bases, red, herramientas de envío ni producción. V67 formal: 0/32 PASS, producción NO_GO.

## Decisiones confirmadas

- El propietario asumió la responsabilidad operativa de registros e incidentes, pero aún falta suplente y revisión técnica independiente.
- OBS-03: propuesta de retención 30 días para métricas agregadas aprobada como diseño, pendiente validación legal, cifrado y configuración real.
- OBS-04: umbrales A1 (HTTP 5xx ≥5% en 5 minutos con 20 muestras), A2 (HTTP 429 ≥10% en 5 minutos con 20 muestras) y A3 (10 minutos sin telemetría con tráfico confirmado) aprobados como diseño.
- El propietario quiere **ambos canales**, WhatsApp y correo, pero no ha autorizado por ello altas de proveedores, gastos, envíos, accesos al número personal ni lanzamiento.

## Implementación concreta

- Módulo puro server/v136-dual-channel-preview.cjs: acepta exclusivamente el resumen V96 estrictamente validado y calcula A1 y A2 en modo de prueba.
- Al detectar un umbral, prepara **dos descripciones de notificación**: WHATSAPP_BUSINESS_PLATFORM y TRANSACTIONAL_EMAIL, ambas NOT_CONFIGURED_NOT_SENT. No recibe contactos ni secretos, no agenda trabajos y no realiza operaciones de I/O.
- A3 permanece NOT_EVALUABLE_WITHOUT_INDEPENDENT_CONFIRMED_TRAFFIC: no se pueden interpretar silencios del observador como falta de telemetría sin una fuente separada de tráfico real.
- Salida congelada con decision REVIEW_ONLY_NO_GO, deliveryAuthorized=false, notificationSent=false, persistentQueue=false, destinationsConfigured=false, deduplicationReady=false y escalationReady=false.
- Pruebas offline: ventanas/umbrales mínimos, dos canales, ausencia de campos personales, rechazo de muestras forjadas, estado no operativo, inmutabilidad y comprobación estática de ausencia de transporte.
- Workflow V136: Node 22, red de Node denegada, regresión V96/V67; sin secretos, sin acceso QA remoto ni despliegue.

**Limitación:** V96 cuenta eventos locales de un proceso, con posibilidades de subrecuento y sin proxy real. Un preview positivo NO es evidencia de una alerta real; la integración todavía no envía WhatsApp ni correo.

## Puertas para una integración operativa futura

1. Seleccionar proveedores autorizados. Un receptor con WhatsApp Messenger normal puede recibir mensajes empresariales; para envío automático hace falta evaluar WhatsApp Business Platform (no basta instalar la aplicación Business). Evaluar un proveedor de correo transaccional con dominio remitente verificado.
2. Verificar número emisor y destinatario, autorización/plantillas WhatsApp según requisitos aplicables, remitente/dominio y autorización de contacto. Las credenciales deben residir en almacenamiento seguro de backend, nunca en GitHub/frontend.
3. Implementar outbox transaccional con reintentos acotados, idempotencia/deduplicación y registro sanitizado de entrega/errores por canal. Validar colas y caída de un proveedor sin perder el otro.
4. Diseñar A3 con confirmación independiente de tráfico, fuente de reloj confiable y tolerancia a interrupciones.
5. Definir suplente, horarios y plazos de respuesta, escalamiento, manejo de falsos positivos y doble fallo.
6. Obtener aprobación diferenciada para ensayos QA con destinatarios ficticios/validados, y realizar prueba única de emisión, entrega y acuse por ambos canales. Evaluar datos permitidos, retención, cifrado y eliminación.
7. Solicitar dictamen independiente sobre las evidencias. No marcar OBS-03/OBS-04 como PASS por una prueba de código aislada.

**Resultado permitido:** V136 CÓDIGO_OFFLINE_PREPARADO; 32 controles V67 permanecen PENDING, sin merge ni producción.
