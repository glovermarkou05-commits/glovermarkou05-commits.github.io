# MG WEB STUDIO CLOUD — V7: PERSISTENCIA Y SINCRONIZACIÓN FUTURAS

**Estado del código:** solo GitHub, rama \`feature/mg-digital-v5-web-services\`.
**Fecha:** 16 de octubre de 2026.

## Resultado

Se creó \`shared/mg-persistence-simulator.js\`, repositorio de demostración autocontenido, asincrónico, sin dependencias, red, disco, cookies, localStorage ni base de datos. Incluye:
- \`readSite(context)\`: snapshot completo con versión numérica.
- \`saveDraft({context,draft,expectedVersion,operationId})\`: guardado simulado, validación y conflicto de concurrencia \`409\`.
- \`publishSite({context,expectedVersion,operationId})\`: publicación simulada de una instantánea inmutable, con número correlativo por sitio.
- \`readReleases(context)\`: historial aislado por cliente/sitio.
- \`readChanges(context,afterVersion)\`: consulta incremental de eventos.
- \`subscribe(context,onChange)\`: notificaciones internas sobre cambios del mismo repositorio.
- Control referencial de rol (OWNER/ADMIN/EDITOR/VIEWER) y sitio asignado.
- Clave de idempotencia por actor, negocio y sitio; repetir la misma operación devuelve su resultado, reutilizar clave con distinto contenido devuelve conflicto.
- Las respuestas son copias para que el consumidor no pueda mutar snapshots internos.

**No hay autorización ni persistencia reales:** cualquier usuario que modifique el JavaScript de esta demo puede eludir validaciones. La futura API tendrá que verificar identidad en el servidor.

## Laboratorio visual
\`laboratorio-sincronizacion.html\` carga el módulo y permite simular:
1. Dos paneles con versiones observadas independientes del mismo sitio.
2. Guardar desde EDITOR.
3. Intentar guardar una versión obsoleta desde OWNER y recibir \`409\`.
4. Refrescar OWNER, revisar y publicar una nueva versión de prueba.
5. Revisar historial de publicaciones y eventos.
6. Cambiar de negocio y comprobar la separación del estado temporal.

Es un laboratorio **de una sola página**: NO conecta entre sí \`prototipo.html\`, \`portal-cliente.html\` ni pestañas diferentes. El nuevo laboratorio sí representa dos clientes de una instancia compartida en un único documento JavaScript. Se enlaza desde los dos paneles, pero no se les inyectan borradores ni se sustituyen sus modelos de datos actuales.

## Flujo real recomendado (no implementado)

\`\`\`text
SUPERADMIN  ─┐
             ├── API HTTPS con sesión y MFA verificadas
EMPRENDEDOR ─┘        │
                      ▼
       Autorización por tenant + sitio + acción
                      │
                      ▼
   PostgreSQL (documentos versionados, FK compuesta,
   operaciones serializables/CAS, RLS, auditoría y outbox)
                      │
                      ├── Registro inmutable de releases publicados
                      ├── Storage de recursos y media versionada
                      └── Outbox → notificación a clientes autorizados
\`\`\`

Recomendación de escritura:
- El cliente envía \`expectedVersion\` y un \`operationId\` único.
- El backend comprueba usuario autenticado, rol/ámbito, pertenencia y versión.
- La base de datos actualiza draft y \`version=version+1\` en la **misma transacción** que el evento de outbox y auditoría.
- Si la versión cambió se devuelve \`409 Conflict\`, el cliente vuelve a leer y ofrece comparación/merge manual. No sobrescribir silenciosamente.
- La publicación genera un release inmutable con todas las páginas y recursos vinculados y actualiza el puntero público atómicamente.
- Los eventos push o Realtime solo anuncian cambio de versión; el cliente revalida permisos y vuelve a consultar la versión del servidor. No confiar en notificaciones para reconstruir estado.
- Las mismas claves idempotentes deben impedir duplicar publicaciones/cobros tras reintentos. La política de expiración/retención y auditoría debe definirse.

## API de propuesta (sin endpoints disponibles)
- \`GET /api/me/organizations\`
- \`GET /api/organizations/:orgId/sites/:siteId/draft\` → \`{version,draft}\`
- \`PUT /api/organizations/:orgId/sites/:siteId/draft\` con \`If-Match\` o \`expectedVersion\` y \`Idempotency-Key\`
- \`POST /api/organizations/:orgId/sites/:siteId/releases\` con versión esperada y clave idempotente
- \`GET /api/organizations/:orgId/sites/:siteId/releases\`
- \`GET /api/organizations/:orgId/sites/:siteId/changes?afterVersion=...\`
- Canal autorizado de actualización \`tenant/site\`, sujeto a revocación de sesión.

No habilitar acceso SQL directo al cliente a los borradores versionados si los permisos/quotas/auditoría dependen de una API obligatoria.

## QA de la entrega
- **54/54** pruebas funcionales del repositorio volátil (versiones, idempotencia, aislamiento, revocación, publicaciones y cursor de cambios).
- **16/16** comprobaciones del laboratorio visual en un DOM simulado (guardado editor, conflicto propietario, recarga de versión, publicación, eventos y enlaces), así como parseo de scripts de los dos paneles existentes.
- Total: **70/70** comprobaciones simuladas, ninguna prueba de navegador real, sin SQL aplicado.
- Test reproducible: \`node apps/mg-web-studio-cloud/tests/persistence-simulator.test.cjs\`

**Pendiente:** QA visual de Chrome/Android, integración real de navegadores, pruebas de concurrencia multiusuario en un servidor y RLS. No confundir el laboratorio con una plataforma operativa.

## Costos y restricciones
- No se crearon ni alteraron proyectos Supabase.
- No se envió ningún prompt a Lovable ni se consumieron créditos.
- No se publicaron webs, dominios, DNS, certificados ni la rama \`main\`.
- Cualquier implementación de backend requiere verificar costos/región y autorización expresa.
