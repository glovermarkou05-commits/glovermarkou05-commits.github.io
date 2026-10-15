# MG WEB STUDIO CLOUD — CONTENIDO COMPARTIDO V1

Estado: modelo de pruebas, sin autenticación y sin base de datos.

## Separación de responsabilidades

La ORGANIZACIÓN agrupa usuarios y sitios. El SITIO contiene su identidad de marca, contacto, catálogo y promociones, accesibles desde todas sus páginas. Cada PÁGINA mantiene por separado su título, descripción, bloques, borrador, estado y versiones.

No copiar productos y promociones cuando se crea una página secundaria. Un producto pertenece al sitio y puede ser mostrado en varias páginas mediante componentes compartidos. El contenido de otro negocio permanece independiente.

## Publicación de contenido
La demostración mantiene un borrador compartido por sitio, junto con una instantánea compartida publicada. Cada página tiene borrador e instantánea publicada propios. En la demo, publicar una página actualiza la instantánea compartida y la de esa página.

ADVERTENCIA: Este comportamiento solo sirve para probar la separación. El SaaS en producción deberá publicar el SITIO completo mediante una única versión inmutable con manifiesto de revisiones de todas sus páginas y del catálogo. Esto evita mezclar publicaciones inconsistentes cuando varias páginas comparten datos.

## Modelo de PostgreSQL — por revisar
Se adjunta el archivo modelo-contenido-compartido.review.sql, sin ejecutar y sin valor de migración. Define identidad de sitio, productos, promociones y versiones compartidas, con claves compuestas por organización/sitio, RLS y lectura mínima a miembros autenticados. Las escrituras quedan reservadas a una API segura con permisos y auditoría.

## QA del prototipo
Se ejecutaron 33 verificaciones simuladas del código, todas correctas:
- 12 módulos renderizados en dos negocios ficticios.
- Datos compartidos visibles entre la página Inicio y una página secundaria.
- Precio modificado en un negocio sin afectar el otro negocio.
- Publicación de demostración conserva el precio anterior mientras el borrador muestra el nuevo.
- Nuevas páginas sin copias locales de productos ni promociones.
- Mi negocio permite gestionar identidad y datos de contacto.

## Pendientes
- Probar visualmente en navegador real y revisar accesibilidad.
- Validar permisos con usuarios reales, MFA, RLS, almacenamiento y endpoints seguros.
- Definir límites de páginas, productos y promociones aprobados para Start, Crece y Pro.
- Diseñar publicación atómica con reversión por sitio y edición concurrente.
- Revisión fiscal/privacidad Ecuador antes de usar datos reales.
- No crear proyectos Supabase, no publicar en main ni enviar prompts a Lovable sin autorización.
