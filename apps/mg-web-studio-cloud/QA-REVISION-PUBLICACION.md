# QA — Revisión previa a la publicación (demostración)

**Estado:** prototipo local, sin hosting, DNS ni Supabase conectado.

## Funcionalidad implementada
- Nuevo módulo «Revisión previa»: verificación de contenido de todas las páginas antes de publicar.
- Errores bloqueantes: título/descripcion/CTA de página, duplicación de slug, estructuras y bloques inválidos, límites provisionales, nombre y color del negocio, nombres y precios de productos y promociones.
- Advertencias: imágenes o galerías sin contenido, texto alternativo ausente, contacto pendiente, enlaces de botón no funcionales, dominios ficticios o DNS sin verificar.
- Botones directos para abrir el módulo donde aparece una incidencia.
- Publicación de demostración bloqueada cuando hay errores editoriales, independientemente de los permisos simulados.
- Panel «Dominio, hosting y SSL» identifica claramente titularidad, DNS y certificado como NO verificados; no consulta proveedores ni modifica registros.
- Pueden existir advertencias aun cuando no hay errores editoriales, especialmente DNS y SSL. Este «Listo» solo corresponde al contenido de la DEMO, no autoriza el despliegue en internet.

## Pruebas de script con DOM simulado
**38/38 correctas:** incluidos render de 14 módulos × 2 negocios ficticios, bloqueo de título vacío, bloqueo de precio negativo, ausencia de nueva versión ante publicación rechazada, advertencia de dominio de ejemplo, prohibición de publicar para rol VIEWER, publicación válida y aislamiento entre negocios.

## Pendiente antes de producción
1. Pruebas visuales con navegador y móvil.
2. Validación de enlaces reales, archivos remotos, tamaños multimedia, accesibilidad y SEO.
3. Integración autorizada con backend, RLS y permiso real de publicación.
4. Registrar en el servidor una versión inmutable de todas las páginas y datos compartidos por una operación transaccional.
5. Verificar propiedad de dominios, DNS, certificados y despliegue/rollback con proveedor real.
6. Validar límites de los planes Start, Crece y Pro (actualmente valores provisionales de demostración).

**Sin gastos de Lovable, sin Supabase nuevo ni alteraciones de proyectos existentes o de main.**
