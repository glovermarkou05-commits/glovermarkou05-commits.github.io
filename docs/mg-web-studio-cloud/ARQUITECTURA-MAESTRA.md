# MG WEB STUDIO CLOUD — ARQUITECTURA MAESTRA V1.0
**Estado: especificación funcional y técnica para revisión; no desplegada.**
**Responsable de producto: MG Digital Solutions.**
**Región comercial inicial: Ecuador.** Fechas, precios, dominios y licencias dependen de verificaciones antes de contratar.

## 1. Visión del producto
Crear y operar una plataforma SaaS multiempresa desde la que MG Digital Solutions diseña, aloja y administra sitios web de muchos clientes. Cada cliente recibe acceso a un panel de autogestión limitado a su organización y sitios. El sistema integra administración, plantillas, publicación, dominios, servicios, suscripciones, facturación comercial, tickets y métricas.

La plataforma no debe convertirse en una copia del sitio corporativo: el sitio comercial V5 actual sigue separado y presenta los servicios; MG WEB STUDIO CLOUD es una aplicación de gestión independiente.

## 2. Principios no negociables
1. Un único panel central para MG Digital Solutions, con aislamiento estricto entre clientes.
2. Cada organización posee uno o varios sitios; cada sitio tiene marca, plantillas, contenido, versiones y dominios propios.
3. No reutilizar contraseñas, tokens, bases de datos, imágenes no autorizadas ni información de otros clientes.
4. Dominio de cliente registrado a nombre del titular contractual; MG actúa como administrador delegado.
5. Separar borrador, vista previa, aprobación y publicación; proporcionar rollback auditable.
6. No interrumpir la web corporativa V4/V5, Ventry Commercial ni MG CLUB+ al desarrollar este producto.
7. Un pago pendiente no borra contenidos; aplicar avisos, período de gracia y suspensión reversible con reglas contractuales.
8. Acceso mínimo necesario, MFA obligatorio para administradores, registro de auditoría y pruebas de aislamiento multi-tenant.
9. Portabilidad y salida: exportación razonable de contenido y entrega de dominio y activos que pertenezcan al cliente.
10. Nunca prometer facturación SRI, envío automático de emails o cobros recurrentes sin integrar, validar y autorizar los proveedores reales.

## 3. Arquitectura lógica
Visitante -> dominio/subdominio del cliente -> CDN/WAF/TLS -> renderizador de sitios -> contenido PUBLICADO (tenant/site/version).

Cliente -> app de administración -> autenticación -> API/autorización -> CMS, medios, versiones, ventas y solicitudes -> Postgres y almacenamiento aislados lógicamente por tenant.

SUPERADMIN -> consola MG -> administración de organizaciones, proyectos, planes, servicios y soporte -> capa de servicios de negocio con autorización server-side.

Trabajadores programados/webhooks firmados -> suscripciones, avisos de renovación, publicación, alertas, backups y reconciliaciones.

Datos mínimos: una organización puede tener N miembros, N sitios, N dominios, N suscripciones, N tickets. Un sitio puede tener N páginas, N revisiones, N activos y N formularios.

## 4. Propuesta de tecnología (por validar antes de implementación)
- Aplicación administrativa: React + TypeScript con diseño modular y rutas protegidas; compatible con Lovable para el desarrollo inicial si se autoriza.
- Base de datos y autenticación: PostgreSQL con Supabase Auth, RLS y Storage; crear proyecto exclusivo para MG WEB STUDIO CLOUD, no compartir la base de FINZY, BAZAR ni otros productos.
- Servicios de negocio: API/funciones del servidor, transacciones, colas y webhooks firmados. Nunca exponer llaves privilegiadas al navegador.
- Sitios de clientes: renderizador web con contenido estructurado y SEO renderizable por servidor o generación estática; caché con invalidación tras publicar.
- DNS, SSL y dominios personalizados: proveedor especializado como Cloudflare for SaaS; revisar configuración, límites, apex, validación y costo de cada hostname.
- Repositorios: GitHub, ramas de desarrollo y revisión de cambios. GitHub Pages NO se usará como proveedor de alojamiento del SaaS comercial.
- Correo profesional: proveedor por cliente/plan y coste por buzón; gestión mediante integración o proceso asistido. No almacenar contraseñas de buzones.
- Cobros e impuestos: adaptadores independientes del proveedor; selección del procesador disponible en Ecuador y validación de requisitos SRI antes de automatizar.
- Observabilidad: logs, alertas, métricas técnicas, auditoría y restauraciones probadas.
No se han contratado, habilitado ni desplegado estos recursos.

## 5. Roles y permisos
### Equipo MG Digital Solutions
- SUPERADMIN: administración completa de la plataforma, con MFA obligatorio, acciones críticas auditadas.
- OPERATIONS_ADMIN: sitios, dominios, publicación y operaciones, sin acceso a secretos o privilegios globales.
- BILLING_MANAGER: suscripciones, facturas comerciales, pagos y conciliación, sin editar contenidos de clientes.
- SUPPORT_AGENT: tickets y diagnósticos; acceso temporal autorizado a contenidos, nunca acceso silencioso o ilimitado.
- DESIGNER: plantillas y cambios editoriales de sitios asignados; no ve datos financieros de otros clientes.
- AUDITOR: lectura de reportes y bitácoras autorizadas.

### Usuarios de cada cliente
- CLIENT_OWNER: administra miembros de su empresa, sitios, contenido, su plan y solicitudes.
- CLIENT_ADMIN: gestiona sitios y publicaciones con alcance delegado, sin cambiar titularidad ni configuración financiera.
- CLIENT_EDITOR: crea/edita borradores, productos, imágenes, promociones y páginas autorizadas.
- CLIENT_VIEWER: acceso de solo lectura a reportes permitidos.

Los permisos se verifican en servidor y RLS. Ninguna autorización depende de valores editables por el propio usuario.

## 6. Panel SUPERADMIN — módulos completos
1. Dashboard: ingresos recurrentes, clientes activos, sitios publicados, dominios por vencer, fallos, solicitudes, vencimientos, capacidad de uso.
2. CRM: empresas, contactos autorizados, prospectos, oportunidades, tareas, notas, origen comercial, etiquetas y seguimiento.
3. Clientes: identificación comercial, titular contractual, membresías, sitios, solicitudes, historial y configuraciones.
4. Proyectos y sitios: crear desde plantilla, asignar propietario, entorno de prueba, estado, dominio, cambios y publicar.
5. Biblioteca de plantillas: categorías (emprendedores, corporativas, portafolio, restaurante, servicios, ecommerce), versiones, previsualización, estilos reutilizables y clonación sin datos reales.
6. Gestor de servicios: hosting, dominio, SSL, correo, mantenimiento, recursos consumidos, respaldo, historial de proveedor.
7. Suscripciones: catálogo de planes, extras, límites, descuentos, contratos, renovaciones y políticas de mora.
8. Cobranza y facturación: cargos, pagos, recibos, conciliación, reintentos controlados, impuestos, comprobantes y exportaciones.
9. Tickets: colas, categorías, SLA, asignación, archivos, respuestas, estado y satisfacción.
10. Soporte remoto: acceso temporal justificado, consentimiento, bitácora de acciones y cierre de sesión.
11. Analítica: leads, conversión, páginas vistas, formularios, MRR, churn, retención, tickets y rentabilidad por plan.
12. Seguridad: usuarios, roles, MFA, actividad, bloqueos, sesiones, configuración de contraseñas y alertas.
13. Ajustes: identidad de MG, servicios externos, plantillas de comunicación, proveedores y parámetros de operación.

## 7. Panel del cliente — módulos completos
- Inicio: estado de sitios y plan, cambios recientes, visitas, leads, productos visibles, avisos y tickets.
- Mis páginas: listado y vista previa por dispositivo, estado (borrador/publicada), dominio y último cambio.
- Editor visual: bloques de contenido seguros, arrastrar/reordenar secciones, estilos del tema, previsualización, historial, publicar y deshacer.
- Identidad de marca: logotipo, paleta, tipografía, favicon, descripción, enlaces sociales y datos de contacto.
- Secciones: inicio, acerca de, servicios, galería, preguntas frecuentes, contacto y páginas personalizadas.
- Catálogo: productos/servicios, categoría, variantes opcionales, precio, disponibilidad, fotos, destacado y estado visible/oculto.
- Campañas/promociones: banner, fechas de vigencia, mensajes, cupones si el plan soporta comercio; vencimiento automático.
- Formularios y contactos: solicitudes y mensajes recibidos en un backend seguro, con protección anti-spam y consentimiento.
- SEO: título, descripción, imagen social, slug, URL canónica, texto alternativo e índice del sitio; advertencias antes de publicar.
- Estadísticas: visitas agregadas, consultas, clics y desempeño (respetando consentimiento y política de privacidad).
- Dominios y correo: estado técnico e instrucciones, solicitudes de cambio/renovación; no acceso a credenciales del proveedor.
- Facturación propia: plan, servicios activos, facturas, pagos, próximas fechas y solicitudes de cambio.
- Soporte: tickets, documentos, respuestas y seguimiento.
- Mi empresa: perfiles, usuarios, permisos, notificaciones y seguridad.

## 8. Editor de páginas y publicación
### Componentes iniciales
Header, hero, botón CTA, texto, imagen, galería, tarjeta, servicios, productos, testimonios, ubicación, horario, FAQ, catálogo, formulario y footer. Cada bloque usa un esquema JSON validado; no ejecuta JavaScript del cliente ni HTML arbitrario.

### Ciclo editorial
Crear proyecto -> elegir plantilla -> personalizar datos -> guardar borrador -> validar diseño móvil -> previsualizar en URL temporal -> solicitar aprobación si aplica -> publicar versión inmutable -> invalidar caché -> verificar URLs y SSL -> revertir si falla.

Permisos: editor puede modificar borrador; publicar requiere CLIENT_OWNER/CLIENT_ADMIN o autorización según contrato. Guardar siempre el autor y fecha de la revisión. Publicación atómica: una página no debe quedar a medio publicar.

### Funciones de autogestión
El cliente podrá crear productos, cambiar textos y precios, activar banners y subir fotos con validación de tipo/tamaño. Cambios en contenido no alteran la plantilla maestra, el código base ni los sitios ajenos. El administrador controla límites por plan.

## 9. Gestión de dominios y hosting
- Durante la alta, ofrecer subdominio temporal del servicio. Ejemplo ilustrativo: cliente.sitios.mgdigitalsolutions.com (sujeto a adquisición y DNS).
- Para un dominio propio: registrar dueño, estado, proveedor, autorizar DNS, validar hostname y certificado, habilitar sitio y monitorizar su vigencia.
- Enviar alertas escalonadas antes de vencimiento (ejemplo configurable: 30, 15, 7 y 1 día), sin autorrenovar/cobrar si falta autorización.
- Mantener registro de recursos por sitio: almacenamiento, transferencia, solicitudes, backups, correo, tamaño de medios y consumo de servicios.
- Definir proveedor de fallback y protocolo de contingencia; separar dominio principal de rutas del panel.
- Apuntar dominios raíz/apex solo mediante modalidad efectivamente soportada y verificada por el proveedor, no asumir que todos pueden usar CNAME.

## 10. Operación comercial y suscripciones
### Planes de referencia, no definitivos
MG START: implementación $249; mantenimiento $29/mes.
MG BUSINESS: implementación $499; mantenimiento $49/mes.
MG PREMIUM: implementación desde $999; mantenimiento desde $99/mes.

Estos valores son propuestas, no promesas de prestaciones ilimitadas. Por contrato se precisan número de páginas, sitios, buzones, cambios, soporte, ancho de banda, capacidad, backups, retención, horario de atención, dominio permitido y costos de terceros.

### Alta y ciclo de vida
Lead -> cotización -> aceptación de contrato -> alta organización -> anticipo/pago -> provisión técnica -> revisión -> publicación -> servicio activo -> renovaciones y mantenimiento.

Estados de suscripción: PENDING_ACTIVATION, ACTIVE, PAST_DUE, GRACE, SUSPENDED, CANCELED, ARCHIVED. Las transiciones deben ser registradas, idempotentes y recuperables.

El no pago genera recordatorios y, si corresponde, suspensión reversible después de los plazos pactados. Nunca eliminar automáticamente contenido ni transferir dominios.

### Facturación
Cargos con desglose de conceptos, impuestos configurables según la situación fiscal y comprobantes. Una factura electrónica SRI requiere integración aprobada, homologación y cumplimiento de normativa aplicable; nunca marcarla como emitida por solo crear un registro interno.

## 11. Servicios de correo
- Distinguir hosting web de correo empresarial: los buzones pueden requerir licencias recurrentes por usuario.
- Evitar presupuestar una cuenta premium ilimitada dentro de planes baratos sin margen comprobado.
- Registrar proveedor, propietario del dominio, buzones contratados, MX/SPF/DKIM/DMARC y fechas de renovación.
- No ofrecer lectura de emails ajenos ni custodiar contraseñas de cuentas de clientes en la aplicación.

## 12. Seguridad, privacidad y continuidad
- MFA obligatorio a administradores; protección ante abuso en registro, login y formularios.
- Separación de clientes en Postgres con RLS para tablas expuestas y políticas por organización y sitio, y políticas de Storage.
- Secretos únicamente en servidor/gestor de secretos; auditoría inmutable o resistente a manipulación.
- Validación de uploads, escaneo de contenido cuando corresponda, límites por plan y protección de archivos privados.
- Backups cifrados, retención documentada y prueba de restauración; objetivos de recuperación RPO/RTO pactados.
- Consentimiento para analítica/cookies según su uso; aviso de privacidad; controles de acceso y eliminación/exportación.
- Revisar obligaciones ecuatorianas de protección de datos, contratación y comprobantes con especialistas antes de producción.

## 13. Sitios y aplicaciones separados
A. Sitio corporativo MG Digital Solutions V5: captación comercial, portafolio y páginas de productos actuales. Conserva enlaces Ventry Commercial y MG CLUB+.
B. MG WEB STUDIO CLOUD: aplicación privada de administración para MG y sus clientes.
C. Sitios publicados de clientes: URLs independientes atendidas por un renderizador multi-tenant con contenido propio. Premium podrá requerir despliegue o base de datos dedicada si el contrato exige aislamiento físico adicional.

## 14. Integraciones y fases
Primero conectar lo mínimo necesario: autenticación, base de datos, almacenamiento, correos transaccionales, alojamiento de sitios, validación de dominios, sistema de cobros manual con conciliación y tickets.
Después añadir cobro recurrente automático con proveedor aprobado, renovaciones automatizadas, CRM avanzado, correo provisionado, campañas y ecommerce.
Integraciones con Shopify, pasarelas y facturación SRI se abordan solo tras pruebas de disponibilidad y aprobación comercial/técnica.

## 15. Criterios de aceptación del producto completo
- Crear cliente e invitar usuarios sin duplicación de datos.
- Crear sitio desde plantilla, guardar borrador, previsualizar, publicar y revertir.
- Editar contenido/productos/promociones con límites y roles.
- Demostrar que clientes A y B no leen ni modifican datos ni medios de otro.
- Conectar dominio con verificación de propiedad, TLS válido y estado visible.
- Crear suscripción, registrar pagos y simular mora/gracia/suspensión/reanudación sin pérdida de información.
- Enviar y recibir tickets, notificaciones verificables, cotizaciones y leads almacenados.
- Generar reportes de clientes, suscripciones, sitios, tickets y rentabilidad.
- Exportar contenido por cliente y realizar restauración verificada.
- Cumplir pruebas de accesibilidad, SEO, responsive, rendimiento y continuidad operacional.
- Documentar costos reales, límites del plan y contratos; no anunciar módulos sin implementar.

## 16. Estado actual
Arquitectura: DOCUMENTADA PARA REVISIÓN.
Módulos descritos: DISEÑO, NO SOFTWARE IMPLEMENTADO.
Base de datos y pasarela: SIN CREAR NI MODIFICAR.
Sitios de clientes: SIN PUBLICAR.
Sitio corporativo V4: SIN CAMBIOS EN MAIN.
Consumo de créditos Lovable: CERO EN ESTA FASE.
