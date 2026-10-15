# MG WEB STUDIO CLOUD — Biblioteca multimedia V1 (demostración)

## Incorporado
- Módulo «Biblioteca multimedia», compartido por las páginas de un negocio y separado de los demás negocios ficticios.
- Archivos JPG, PNG o WebP de hasta 1 MB por imagen; límites de ejemplo de 20 imágenes y 12 MB por empresa.
- Tipos de archivo: fotografía, logotipo, banner y general.
- Detección de imágenes duplicadas por contenido en la misma empresa.
- Selección de activos en identidad visual, catálogo de productos y bloques de imagen/galería del editor visual.
- Imágenes referenciadas mediante ID por el borrador, utilizadas en la vista previa.
- Bloqueo de eliminación cuando existen referencias desde una página, producto o identidad de marca.
- Captura de activos y referencias dentro de la versión completa simulada del sitio.
- Sin persistencia: las imágenes se pierden al recargar, sin almacenamiento en Supabase ni servidor.

## Pruebas realizadas
38/38 comprobaciones ejecutadas sobre el JavaScript con DOM simulado:
- Alta en biblioteca.
- Reutilización de fotografía por referencia en producto y vista previa.
- Prevención de eliminación de imagen en uso.
- Inclusión de biblioteca y referencias dentro de la instantánea de publicación.
- Aislamiento lógico entre dos negocios ficticios.
- Prohibición simulada de subir archivos con CLIENT_VIEWER.
- Renderizado de 15 pantallas × 2 negocios.

## Pendiente antes de habilitar clientes
- Pruebas visuales manuales en navegador real (incluidos dispositivos móviles y subida de archivos).
- Validaciones y escaneo de imágenes en backend, cuotas reales aprobadas por plan, transformación/optimización, metadatos, políticas de propiedad y uso de medios.
- Conexión a Storage de proyecto exclusivo con RLS y aislamiento por tenant, no a proyectos existentes.
- Accesibilidad: etiquetas alternativas individuales, gestión de errores de tamaño, formato y archivos dañados.
- Borrado seguro de archivos no referenciados por borradores, releases o restauraciones. En producción también se debe impedir eliminar activos referenciados por publicaciones históricas: la demo no gestiona esta retención físicamente.
- Implementar persistencia transaccional y publicación real mediante backend; la demo utiliza Data URLs y snapshots en memoria.
- Los límites demostrativos no constituyen planes comerciales aprobados.

**Sin gastos, sin créditos de Lovable, sin proyectos Supabase modificados y sin publicar la rama main.**