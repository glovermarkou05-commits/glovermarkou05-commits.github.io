# MG WEB STUDIO CLOUD — QA: configuración comercial y SEO de páginas

**Estado:** prototipo HTML de memoria, no sistema comercial publicado.
**Fecha de revisión:** 15 de octubre de 2026.

## Módulos incorporados

### «Datos y horarios»
- Dirección, ciudad, provincia y país Ecuador.
- WhatsApp en formato internacional, con 8 a 15 dígitos.
- Enlace opcional de Google Maps, solo HTTPS con dominio comprobado por formato.
- Redes sociales: Instagram, Facebook, TikTok y YouTube; se valida HTTPS y el hostname de cada plataforma antes de guardar.
- Siete días de atención, con opción «Cerrado», hora de apertura y hora de cierre.
- La configuración se guarda en datos compartidos del sitio (en memoria), no dentro de cada página.
- La vista previa muestra datos comerciales en el pie del contenido. No abre automáticamente sitios ni realiza llamadas.

### «SEO de páginas»
- Título SEO, descripción, título para compartir, descripción para compartir y opción «noindex» de borrador.
- Metadatos independientes por página y preservados en instantáneas de publicación.
- Vista previa textual de resultado de búsqueda.
- Validación de longitud y sugerencias editoriales (título <=60 caracteres y descripción <=160).
- El prototipo NO genera etiquetas HTML reales de indexación, Open Graph, sitemap, canonical ni páginas alojadas; corresponde al futuro renderizador/hosting.

### Revisión previa
- Bloquea publicación simulada si se guardan valores inválidos de WhatsApp, fechas/hora, URLs o SEO.
- Advierte cuando faltan datos SEO personalizados, ciudad o WhatsApp (sin obligar a negocios que no utilizan esas funciones).
- Publicación integral conserva una copia de la configuración comercial y del SEO individual de cada página.

## QA
**58/58 comprobaciones superadas** ejecutando el JavaScript con un DOM simulado y una implementación de URL de prueba. Comprobadas la estructura inicial, validaciones de WhatsApp, rechazo de esquema javascript:, dominios de redes ajenos, validación de Google Maps, horarios invertidos, SEO, publicación de instantáneas, inmutabilidad lógica de versiones previas, separación de negocios y renderizado de 17 módulos en cada uno de dos negocios ficticios.

## Pendientes y límites
- Pruebas visuales reales en Chrome, Firefox, Android y teclado, incluidas persistencia de inputs y responsive.
- Verificación real de DNS/SSL y funcionalidades de contactos o enlaces; el prototipo no solicita esos datos por red.
- Persistencia, RLS y políticas de privacidad en un proyecto exclusivo de Supabase, sujeto a aprobación de costos y creación.
- Versión de producción: fechas y horarios según zona horaria del sitio, escapado y validación de URLs en servidor, control de roles, trazabilidad, renderizado SEO de HTML y Open Graph, auditoría y cumplimiento legal de Ecuador.
- No debe asumirse que «noindex» funciona públicamente hasta desplegar correctamente la directiva en HTML o cabeceras.
- Las simulaciones no garantizan accesibilidad ni seguridad multitenant. Falta QA de navegador y pruebas backend.

**Sin gasto, sin Lovable, sin nuevos proyectos ni modificaciones en Supabase y sin cambios en la rama main.**