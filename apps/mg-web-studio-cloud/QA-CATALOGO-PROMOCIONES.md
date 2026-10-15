# QA — Catálogo avanzado y promociones programadas

Estado: prototipo local de demostración, no plataforma publicada.

Se implementó el formulario de productos con nombre, categoría, descripción, precio USD, disponibilidad (Disponible/Agotado/Próximamente), visibilidad y fotografía JPG/PNG/WebP (máximo 1 MB). El catálogo permite editar productos existentes y filtrar por categoría.

El módulo de promociones permite título, descripción, estado manual y fechas opcionales de inicio y fin. Se distinguen los estados Pausada, Programada, Vigente y Vencida. La vista previa muestra únicamente promociones vigentes según la fecha del dispositivo; en producción deberá utilizarse zona horaria confiable del servidor.

El preflight de publicación valida categorías, precios y disponibilidad, fechas correctas y rango cronológico de promociones. Las fotografías faltantes se muestran como advertencias editoriales, sin bloquear la publicación demo.

## Resultado de QA
41 de 41 verificaciones correctas con ejecución del JavaScript en DOM simulado, incluyendo:
- Normalización de productos demo existentes.
- Alta de producto válido, rechazo de precio negativo.
- Programación de promoción futura; campaña vencida y vigente.
- Promoción futura no visible en vista pública simulada.
- Rechazo de fechas imposibles.
- Guardado de promoción futura y publicación del sitio completo con los nuevos datos.
- Conservación del catálogo entre páginas y aislamiento lógico de dos negocios ficticios.
- Renderizado de 14 módulos en cada uno de los dos negocios.

## Pendientes
Pruebas manuales en navegador y móvil, carga de imagen real en el formulario, desempeño con muchas fotos, edición simultánea, soporte de inventario, integración segura con Storage, autenticación real, RLS, transacciones de publicación y validación de los límites del plan.

No se modificó Supabase, Lovable, DNS ni la rama main.