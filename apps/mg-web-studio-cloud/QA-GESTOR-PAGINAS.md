# MG WEB STUDIO CLOUD — QA del gestor de páginas y plantillas
Fecha de revisión: 15 de octubre de 2026.
Estado: prototipo de navegador, NO sistema SaaS desplegado.

## Entregables integrados
Archivo: apps/mg-web-studio-cloud/portal-cliente.html
- Módulo Mis páginas: seleccionar, crear, renombrar, eliminar página secundaria.
- Plantillas demostrativas: Presentación, Servicios, Portafolio, Contacto y Catálogo.
- Aplicación de plantilla sobre el borrador con confirmación; no sobrescribe publicaciones previas.
- Cada página tiene su propio borrador, editor visual, revisión e historial y publicación simulada.
- Selector de página en la cabecera del portal, separado por cada negocio ficticio.
- Controles de límites de página por plan: Start=1, Crece=3, Pro=5 como valores PROVISIONALES. No aprobados como condiciones de venta.
- La página de inicio no puede eliminarse. Las demás requieren confirmación para borrado en demo.
- Los cambios no sobreviven a una recarga: sin almacenamiento remoto/local ni backend.

## Verificaciones automatizadas realizadas sobre el código
1. Parseo sintáctico de JavaScript: OK.
2. Render simulado de 11 módulos para dos organizaciones ficticias (22 pantallas): OK, sin excepciones.
3. Creación de segunda página en plan Crece: OK.
4. Página secundaria conserva contenido independiente de Inicio: OK.
5. Publicación e historial simulado de la secundaria no alteran Inicio: OK.
6. Nuevo negocio de plan Start alcanza límite provisional: bloquea crear más páginas: OK.
7. Rol CLIENT_VIEWER simulado no crea páginas: OK.
8. Sin llamadas a Supabase ni a endpoints de escritura remotos en este archivo: verificado estáticamente.
9. Cambios efectuados exclusivamente en rama feature/mg-digital-v5-web-services: verificado.

## Límites conocidos y trabajo pendiente
- Pruebas actuales: sintaxis y ejecución en DOM simulado. Falta QA manual en navegador Chrome/Firefox/Android y pruebas de accesibilidad visual.
- Los permisos y selector de empresas son simulados. No son autorización de producción.
- Productos y promociones se guardan en cada borrador de página durante esta demo. En producción el catálogo y las promociones deben residir a nivel de sitio y representarse mediante bloques, no duplicarse por página. Cambiar este modelo en el backend antes de conectar almacenamiento.
- Las plantillas no crean despliegues ni sitios reales, solo borradores de demostración.
- Se muestra una dirección ficticia con extensión .invalid, no un dominio operativo.
- Faltan editor por arrastrar, persistencia, subida de medios segura, URLs reales, RLS, MFA, cache, publicación automática efectiva, versiones inmutables y QA de concurrencia.
- Los límites de páginas y secciones deben ser revisados contra las decisiones comerciales antes de su aplicación en producción.

## Bloqueos de producción
- No crear/alterar un proyecto de Supabase sin autorización de la organización y costo.
- No publicar en main ni modificar dominios actuales.
- No usar Lovable mientras se mantiene la condición sin gastos.
- La siguiente fase técnica recomendada es separar estado de sitio/página/catálogo en estructuras de datos tipadas y crear tests de dominio independientes del DOM antes de conectar el backend.
