# MG WEB STUDIO CLOUD — Plan de asistente IA para agencia y emprendedores

**Fecha:** 16 de octubre de 2026.
**Estado:** decisión de arquitectura y propuesta de alcance; **no se ha conectado ningún modelo de IA de pago ni gastado créditos.**

## Calendario propuesto: sin interrumpir V8

### V8 — AHORA: API y permisos
- Terminar contrato seguro de servicios, roles y acceso a sitios, idempotencia, revisión de RLS.
- Documentar el asistente de IA para asegurar compatibilidad futura, sin implementarlo todavía.

### V9 — DESPUÉS DE V8: IA VISUAL SIMULADA, COSTO CERO
**Para MG SUPERADMIN:** botón «Crear sitio con asistente» dentro de alta de sitio; interrogatorio guiado:
tipo de negocio, servicios/categorías, colores y estilo, secciones, público objetivo, CTA y contenidos autorizados.
**Para CLIENT_OWNER / CLIENT_ADMIN / CLIENT_EDITOR:** asistente dentro del editor del sitio, con permisos de edición y alcance de sitio simulados.
- Preparar un wizard de 4–6 preguntas de negocio que genera un **borrador de ejemplo mediante plantillas/reglas**, sin solicitar una API de IA. Marcar explícitamente **«simulación, no generación con IA real»**.
- Propuestas: mapa de páginas, textos de portada, secciones, contacto, productos de ejemplo, metadatos SEO y paleta de colores.
- El usuario podrá previsualizar y comparar diferencias, editar, aceptar o descartar cada bloque. El asistente **NO publicará**, NO reescribirá publicaciones aprobadas sin revisión.
- Guardar en demo solo información ficticia. No enviar fotos, archivos, datos personales, conversaciones o credenciales a terceros.
- Probar aislamiento lógico por cliente/sitio, controles de roles, idempotencia y QA visual; manteniendo proyectos actuales intactos.

### V10 — BACKEND SEGURO (solo con autorización de costos)
- Infraestructura separada por tenant, Auth y MFA, membresías/alcances, RLS y API, Storage, borradores versionados y cuotas.
- Publicación atomizada y autorizada, logs/auditoría.
- Ningún proyecto Supabase existente se puede reutilizar sin autorización; no cambiar planes ni gastar.

### V11 — ASISTENTE CON IA REAL (se presupuestará y aprobará)
- Servicio de IA opcional detrás de una **API del servidor**. Nunca poner la clave de OpenAI u otro proveedor en el HTML, navegador, URLs o GitHub.
- Proveedor/modelo agnóstico y configurable; salidas estructuradas validadas contra un esquema (por ejemplo, \`site_generation_proposal\`).
- Rutas futuras: \`POST /api/organizations/:orgId/sites/:siteId/ai/proposals\`, \`GET .../ai/proposals/:id\`, \`POST .../ai/proposals/:id/apply\`.
- Aplicar propuesta con membresía autorizada y versionado \`expectedVersion\`; conflictos \`409\` y comparación manual.
- Cuotas y controles de costos por plan, persona, tenant, proyecto y mes; límites de tokens, timeout, tamaño, imágenes, reintentos y presupuesto máximo configurable; sin activación por defecto.
- Moderación y protección de prompts, sanitización de HTML/URLs, no aceptar instrucciones incrustadas en documentos aportados, licencia de imágenes, comprobación de afirmaciones y protección de datos.
- Registro de uso técnico de costo sin guardar contenido sensible innecesario.
- Cualquier IA que edite catálogo, precios, facturación, formularios o contacto debe pedir revisión; no ejecutar pagos, crear usuarios ni publicar automáticamente.

## Experiencias propuestas

### 1. MG Digital Solutions (Agencia)
**Modo «Proyecto completo»**: «Necesito una web para una papelería con sección escolar, juguetes, tecnología, catálogo y WhatsApp». El asistente propondrá estructura del sitio, plantillas, copys y diseño de marca. El SUPERADMIN podrá revisar, comparar y asignar un sitio al cliente.

### 2. Emprendedor
**Modo «Mejora mi página»**: «Añade una sección de nuestros productos de arte y modifica el texto principal». El asistente preparará **cambios al borrador**, nunca a la versión publicada. El emprendedor confirmará cada propuesta.

### 3. Opciones que pueden añadirse
- Textos para SEO e identidad corporativa.
- Asistente de configuración de formularios, horarios y redes.
- Recomendación de diseño por sector (tiendas, restaurantes, servicios, portafolios).
- Soporte multilingüe, siempre editable y opcional.
- Generación de imágenes, solo si proveedor, licencia, créditos y consentimiento están aprobados posteriormente.

## Política comercial y de costos
- El modo V9 no tiene cargos por uso de modelos porque **no llama a ninguno**.
- V11 tendría costos de consumo de la API del proveedor (tokens, herramientas e imágenes cuando corresponda) aparte de ChatGPT. No prometer gratuidad ilimitada.
- Start/Crece/Pro: cantidades y beneficios de IA **provisionales**; no imponer cobros o límites comerciales definitivos.
- El asistente debe ser una función **opt-in**; cambios revisables y reversibles, ninguna publicación automática.

## Criterios de aceptación V9
- Usuario distingue claramente simulación de IA real.
- Experiencia similar en ambos paneles, con controles según rol.
- Generación de borrador a partir de preguntas con validación y previsualización.
- Sin modificar sitios ajenos ni publicaciones previas.
- Test automático de inyección de instrucciones, tamaños, permisos y versionado.
- Sin credenciales, gastos, red ni nuevas dependencias.

**Este documento deja V9 preparada; no implementa todavía la IA real.**
