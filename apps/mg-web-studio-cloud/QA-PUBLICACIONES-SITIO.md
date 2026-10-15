# QA — Publicación centralizada por sitio V1

**Fecha:** 15 de octubre de 2026. **Ámbito:** demostración HTML autocontenida en memoria, sin acceso a Supabase ni despliegues.

## Cambios incorporados
- Nuevo módulo «Publicaciones» para publicar el sitio completo.
- Cada release incluye metadatos del sitio, instantánea del catálogo, promociones e identidad, y el conjunto completo de páginas con sus revisiones, nombres y slugs.
- Puntero activo de publicación por sitio; borradores modificables independientemente.
- Lista de versiones del sitio y opción para inspeccionarlas.
- Restauración de una publicación histórica como un lanzamiento nuevo; se conserva el borrador actual.
- Vista previa de la página seleccionada recupera la revisión publicada del release activo y muestra el catálogo de ese mismo release, sin datos mezclados.
- Restringe la publicación simulada a CLIENT_OWNER y CLIENT_ADMIN; rol CLIENT_VIEWER y CLIENT_EDITOR no pueden publicar.
- Es una simulación de los cambios que podrán publicarse automáticamente desde el panel del emprendedor. No requiere aprobación manual en la demo.

## Pruebas ejecutadas sobre el script con DOM simulado
**35 pruebas correctas de 35:**
- Crear página secundaria y publicar el conjunto completo de dos páginas.
- Captura compartida de productos con estado anterior al cambio de precio.
- Captura de las páginas con títulos anteriores al cambio.
- Segunda publicación con los datos cambiados.
- Recuperar la versión #1 como versión #3; no sobrescribir borradores.
- Impedir publicar/recuperar a usuarios CLIENT_VIEWER.
- No permitir que el segundo negocio comparta historial de publicaciones con el primero.
- Renderizado de 13 pantallas en cada uno de los dos negocios ficticios, sin excepciones.

## Restricciones y riesgos pendientes
- No hay backend, autenticación, RLS, pagos, dominios ni almacenamiento.
- Las publicaciones viven solo en la RAM del navegador y se pierden al recargar.
- Aún no es una publicación atómica de producción. La implementación real requiere una transacción que registre release y manifiesto de revisiones, almacenamiento inmutable, validación por permisos de servidor, invalidación de caché, idempotencia, URLs publicadas, reconciliación y rollback.
- No se probó el comportamiento visual con un navegador real ni la subida de medios en móvil.
- La selección de usuarios y empresas es simulada, no constituye aislamiento real.
- Límites de páginas y secciones Start / Crece / Pro usados en demo son provisionales y requieren aprobación comercial.

## Condiciones para pasar a producción
1. Aprobar proyecto exclusivo de Supabase y revisar los costos.
2. Construir servidor publicador, validar pertenencia del cliente y su permiso de publicación.
3. Generar revisión inmutable completa y publicar por sustitución atómica del puntero activo de cada sitio.
4. Verificar hostname y TLS; aplicar cache bust e indexación SEO.
5. Implementar auditoría, restauración y reintentos idempotentes.
6. Pruebas automáticas RLS y concurrencia más QA funcional en dispositivos.

**Sin cambios en main, sin modificaciones de bases de datos, sin créditos de Lovable.**
