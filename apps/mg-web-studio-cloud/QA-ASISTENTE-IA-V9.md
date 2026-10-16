# MG AI WEB ASSISTANT — Entrega V9 (modo guiado gratuito)

**Fecha:** 16 de octubre de 2026. **Rama:** \`feature/mg-digital-v5-web-services\`.

## Qué se implementó
- **Generador común** \`shared/mg-ai-web-assistant-demo.js\`: construye propuestas de sitios mediante plantillas y reglas deterministas. **No usa modelos de inteligencia artificial**, API, tokens ni servicios externos.
- **Portal del emprendedor**: nuevo módulo \`Asistente web IA (demo)\` en el menú lateral. Permite seleccionar sector, estilo, objetivo, público, oferta comercial ficticia y nombre. Toma el plan actualmente seleccionado (Start/Crece/Pro) del sitio.
- **SUPERADMIN**: nuevo módulo homónimo para preparar propuestas asociadas a un sitio de un cliente ficticio. Se guardan *solo* como propuesta interna de revisión y NO se transfieren al portal del cliente, porque las maquetas mantienen estados independientes.
- **Sectores:** tienda/catálogo, servicios, restaurante, portafolio y educación/talleres.
- **Estilos:** moderno, elegante, creativo y natural.
- **Objetivos:** productos, consultas, portafolio o citas.
- El generador produce títulos, descripciones, CTA, colores, secciones de portada y SEO. Puede incluir sección de formulario de contacto de DEMO; no recibe datos de visitantes reales.

## Flujo de aprobación del portal
1. Completar los datos ficticios y pulsar «Preparar propuesta gratuita».
2. Revisar nombres, títulos, descripción, color y secciones de todas las páginas propuestas.
3. **«Aplicar al borrador»** requiere acción expresa y confirmación. El rol visual VIEWER no puede aplicar.
4. Verificar que no se han cambiado versión y plan desde la generación. Se rechazan propuestas obsoletas.
5. Actualizar el borrador de Inicio y crear páginas secundarias cuando el plan lo permita y no haya conflicto de cupo o slug.
6. Conservar existentes las otras páginas que no estén en la propuesta. No tocar productos, precios, dominio, usuarios, permisos, mensajes ni publicaciones anteriores.
7. El usuario puede descartar la propuesta sin aplicar cambios.

**Límites de demo:** Start 1 página, Crece 3, Pro 5. Esos límites NO son aún políticas comerciales aprobadas.

## QA
- **49/49 tests reutilizables correctos** ejecutando el JavaScript de ambos paneles con un DOM simulado en el entorno de revisión. Comando:
  \`node apps/mg-web-studio-cloud/tests/ai-web-assistant-demo.test.cjs\`
- Verificado: páginas por plan, SEO, validaciones de campos, rechazo de HTML, propuesta sin efecto hasta aprobación, bloqueo VIEWER, versionado del borrador, separación entre empresas, conservación de las publicaciones, renderizado de pantallas y propuestas SUPERADMIN por sitio.
- Una batería exploratoria previa de 54/54 también pasó. No reemplaza QA de navegador real.

## Limitaciones explícitas
- **No hay modelo de IA conectado.** La marca «AI WEB ASSISTANT» identifica la función prevista; la pantalla advierte claramente «plantillas, no IA real».
- No hay sincronización real entre SUPERADMIN y portal, ni exportación automática de sus propuestas.
- Las propuestas y los cambios de demostración se pierden al recargar.
- Los formularios de contacto y enlaces son solo visuales.
- Los límites de planes, cotas de uso y generación de imágenes no son finales.
- Se requiere probar visualmente en navegador y móvil, accesibilidad, generación masiva, títulos largos, localización, manejo de errores y conflictos de páginas preexistentes.
- Los HTML requieren cargar \`./shared/mg-ai-web-assistant-demo.js\` desde el mismo origen. Un visor GitHub de archivos individuales puede impedir el uso del generador. No afirmar compatibilidad con visores externos hasta probarlos.

## Arquitectura prevista V10/V11
- V10: backend exclusivo tras aprobar costos/región; Auth + MFA, RLS por tenant/sitio, Storage, API versionada, auditoría, cuotas y publicación.
- V11: proveedor de IA real (OpenAI u otro) solo bajo presupuesto y autorización. Claves exclusivamente en backend, nunca en GitHub, URLs o cliente.
- Salidas estructuradas validadas contra esquema; propuestas versionadas con aceptación por bloque, comparación/diffs, idempotencia y límites por cliente/plan.
- Sin autopublicación, cobros, cambios de permisos ni comunicaciones automáticas.
- No transmitir información personal/privada ni archivos a un tercero sin evaluación de privacidad y autorización.
- Los nombres Start/Crece/Pro no implican beneficios comerciales definitivos.

**No se modificó \`main\`, Supabase, DNS, alojamiento ni Lovable.**
