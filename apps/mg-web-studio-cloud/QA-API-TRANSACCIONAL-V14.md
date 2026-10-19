# MG WEB STUDIO CLOUD — V14 | Contrato transaccional de API y laboratorio

**Fecha:** 18 de octubre de 2026  
**Repositorio:** \`glovermarkou05-commits/glovermarkou05-commits.github.io\`  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Estado:** SOLAMENTE simulación JavaScript local y documentación. Ningún backend HTTP, proyecto Supabase, autenticación real, migración SQL, publicación o modelo de IA pago.

## Entrega V14

- **\`shared/mg-transactional-api-v14-demo.js\`**: enrutador de solicitudes que devuelve respuestas con aspecto HTTP, pero **no escucha peticiones de red**. Los datos se almacenan únicamente en memoria.
- **\`laboratorio-api-v14.html\`**: página visual de prueba con perfiles ficticios, creación/envío/revisión/aplicación de propuestas, contador de avisos, repetición de la última operación y simulación de dos decisiones simultáneas.
- **\`tests/transactional-api-v14.test.cjs\`**: casos funcionales de API, roles, concurrencia y control de idempotencia.
- **\`tests/transactional-api-v14-ui.test.cjs\`**: pruebas de interfaz con DOM simulado.
- Enlaces al laboratorio desde **SUPERADMIN**, **portal del emprendedor** y **bandeja V12**. Los paneles originales y la bandeja V12 conservan **estados independientes**; el laboratorio V14 no los sincroniza automáticamente.

## Contrato propuesto (rutas virtuales, NO disponibles mediante internet)

| Verbo | Ruta virtual | Uso y control ilustrado |
|---|---|---|
| GET | \`/api/v1/organizations/:org/sites/:site/draft\` | Leer borrador por sitio |
| GET | \`/api/v1/organizations/:org/sites/:site/proposals\` | Listar propuestas del sitio autorizado |
| GET | \`/api/v1/organizations/:org/sites/:site/proposals/:id\` | Consultar una propuesta |
| POST | \`/api/v1/organizations/:org/sites/:site/proposals\` | SUPERADMIN de prueba con MFA crea propuesta |
| POST | \`.../proposals/:id/submit\` | SUPERADMIN envía revisión |
| POST | \`.../proposals/:id/revise\` | SUPERADMIN crea siguiente revisión |
| POST | \`.../proposals/:id/review\` | OWNER/ADMIN aprueba/rechaza; EDITOR puede solicitar cambios |
| POST | \`.../proposals/:id/apply\` | Rol editable aplica revisión aprobada al borrador |
| GET | \`/api/v1/me/notifications\` | Avisos del usuario simulado |
| POST | \`/api/v1/me/notifications/:id/read\` | Marca lectura solo del destinatario |
| GET | \`/api/v1/admin/outbox\` | Diagnóstico local del outbox para SUPERADMIN ficticio |

Las solicitudes se ejecutan mediante \`api.request(objetoDePrueba)\`; no se ha levantado servidor HTTP y ninguna de estas rutas existe en producción.

## Cómo se simuló una operación transaccional

1. El arnés de pruebas determina un actor mediante \`resolveSession(req)\`. Esto **NO autentica**; un navegador puede simular cualquier actor modificando el JavaScript.
2. Se valida pertenencia a empresa y sitio, rol, status de membresía y MFA ficticio para SUPERADMIN.
3. Cada escritura exige \`operationId\` y, cuando procede, \`expectedRevision\` y \`expectedDraftVersion\`.
4. Una cola de promesas serializa las operaciones **dentro de la misma instancia JS**.
5. La mutación se aplica a una copia independiente del estado volátil y se confirma reemplazando el snapshot completo solo tras una respuesta exitosa.
6. Una operación fallida devuelve error sin confirmar el snapshot. Dos decisiones concurrentes sobre la misma revisión: una confirma y la otra recibe \`409\`.
7. Tras aprobar/enviar/aplicar se anexa un evento de outbox **al mismo snapshot simulado**, junto con avisos por destinatario. No se despacha ninguna notificación real.
8. Reintento con misma clave, usuario, organización, ruta y cuerpo devuelve la respuesta anterior con \`Idempotency-Replayed: true\` sin duplicar efectos. Reutilizar clave con distinto payload devuelve \`409\`.
9. Antes de aceptar un replay se vuelve a comprobar la autorización; una membresía revocada no obtiene permiso solo por tener una respuesta guardada.

**Esto NO es ACID de PostgreSQL, no resuelve concurrencia entre procesos ni reinicios, no verifica JWT, cookies, sesiones, MFA o RLS.** El método \`inspectForTests()\` revela el estado completo solo para el laboratorio y no debe existir como endpoint público.

## Semántica de estados (en el mock)
\`draft\` → \`submitted\` → \`needs_changes\` / \`rejected\` / \`approved\` → \`applied\` (solo si aprobado). Una propuesta rechazada o con cambios puede generar una revisión nueva y volver a borrador.

Publicar en internet es un flujo **separado y NO implementado**; aplicar solo altera el borrador ficticio y deja \`publishedCount=0\`.

## Pruebas ejecutadas
**80/80** de API V14:
- Clave de operación, repetición sin doble ejecución, conflicto de la misma clave con otra carga útil.
- Actor no verificado, SUPERADMIN sin MFA, AUDITOR, rol inyectado en body.
- Owner de otra empresa, EDITOR de otro sitio del mismo negocio, VIEWER y revocados.
- Crear, enviar, solicitar cambios, nueva revisión, aprobar y aplicar.
- Dos decisiones simultáneas sobre revisión 2: una gana y la otra recibe \`409\`.
- Revisión obsoleta y borrador obsoleto, notificaciones por destinatario y outbox del snapshot.
- Bloqueo de replay después de revocación y conservación de otros sitios/empresas.

**33/33** de interfaz V14 con DOM simulado:
- Pantalla inicial, crear/enviar/aprobar/aplicar, selección de perfil, avisos, contadores, restricciones visibles y enlaces.
- Se corrigió el botón «Aplicar» de VIEWER para que no aparezca habilitado, sin considerar esa UI un control de seguridad real.

**398/398** de regresión de V9 a V13:
- V9: 49/49; V10: 52/52; V11: 64/64; V12 núcleo: 81/81; V12 UI: 30/30; V13 estático: 122/122.

**Total V9–V14: 511/511 comprobaciones simuladas correctas.** Se ejecutaron con los scripts actuales recuperados de GitHub. No se ha hecho QA de Chrome/Android real, de servidor HTTP, SQL PostgreSQL, RLS real o sincronización entre dispositivos.

Comandos locales reproducibles desde la raíz del repo:
\`\`\`powershell
node apps/mg-web-studio-cloud/tests/transactional-api-v14.test.cjs
node apps/mg-web-studio-cloud/tests/transactional-api-v14-ui.test.cjs
\`\`\`

## Supabase: comprobación reciente
Documentación oficial consultada el 18 de octubre de 2026:
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Cambio Data API abril 2026](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

El cambio de exposición de nuevas tablas de \`public\` exige comprobar grants y configuración del Data API en la futura instalación. No asumir que la existencia de una tabla implica acceso REST. RLS y GRANT son controles distintos. **Ningún cambio de Supabase fue ejecutado.**

## Decisiones aún pendientes para backend real (futuras etapas)
1. Presupuesto, región, proveedor y autorización de una base nueva exclusivamente para MG WEB STUDIO CLOUD.
2. Crear y probar migraciones mediante CLI vigente en staging, con RLS por tenant+sitio, FK compuestas, permisos y sesiones.
3. Diseñar operaciones transaccionales de Postgres (CAS/versionado, idempotencia, restricciones de estado) y outbox en la misma transacción; no basarse en colas de JavaScript.
4. Auditoría de inmutabilidad, conexión de notificaciones, recuperación ante fallos, límites, rate-limits, privacidad, retención y backups.
5. Implementar backend/Edge Functions seguro; verificar JWT/session_id, MFA, alcance de SUPERADMIN, roles y revocación al momento de cada petición.
6. Integrar gradualmente los paneles existentes con la API real y realizar QA de varias sesiones, navegador/Android, condiciones de carrera, permisos y publicación.
7. Generación de IA real (OpenAI u otro proveedor) solo al aprobar límites, costos y políticas de privacidad. No habilitar claves en frontend.

## Restricciones conservadas
**No** se editó ni publicó \`main\`; no se ejecutó SQL; no se creó o modificó proyecto Supabase; no se gastaron créditos Lovable ni API de IA; no se modificaron BAZAR-ONLINE, FINZY, Regaladitos Club o MG Digital Solutions en producción.
