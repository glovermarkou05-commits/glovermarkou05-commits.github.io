# MG WEB STUDIO CLOUD — V16 | Adaptador de servicios, telemetría local y preparación de infraestructura

**Fecha:** 19 de octubre de 2026  
**Repositorio:** \`glovermarkou05-commits/glovermarkou05-commits.github.io\`  
**Rama de trabajo:** \`feature/mg-digital-v5-web-services\`  
**Estado:** Código local de demostración. **NO hay servidor real ni Supabase conectados.**

## Objetivo alcanzado
Preparar una interfaz estable para que la bandeja y los paneles de MG WEB STUDIO CLOUD puedan pasar **en una etapa futura**, y solo con autorización explícita, de un motor JavaScript local a una API con Auth y RLS reales. V16 **NO realiza ese cambio todavía**.

### Archivos añadidos
- \`shared/mg-service-adapter-v16-demo.js\`: adaptador de peticiones con rutas/métodos permitidos, respuestas normalizadas, métricas de demostración y telemetría circular sin almacenar identidades, cuerpos de propuestas ni claves.
- \`shared/mg-readiness-v16-demo.js\`: modelo de 14 controles de preparación; los 13 controles centrales y el adicional de IA se evalúan **siempre como declaraciones NO VERIFICADAS**.
- \`preparacion-backend-v16.html\`: tablero interactivo de planificación con comprobación de requisitos y sin persistencia.
- \`tests/service-adapter-v16.test.cjs\`: casos de adaptador, rutas, permisos delegados, errores e idempotencia.
- \`tests/readiness-v16.test.cjs\`: casos del tablero y bloqueo de cualquier autorización implícita.

### Archivos actualizados
- \`laboratorio-api-v14.html\`: las solicitudes ahora utilizan \`MGWebStudioServiceAdapter.createDemoAdapter({api})\`, con contador de peticiones de ejemplo.
- \`laboratorio-recuperacion-v15.html\`: mismas operaciones, pero a través del adaptador, también después de restaurar un checkpoint ficticio.
- \`prototipo.html\` y \`portal-cliente.html\`: acceso al tablero V16 desde «Bandeja de propuestas».
- \`tests/transactional-api-v14-ui.test.cjs\` y \`tests/resilience-v15-ui.test.cjs\`: pruebas ajustadas al nuevo adaptador.
- Enlaces a «Preparación V16» desde laboratorios V14 y V15.

## Contrato del adaptador local
La función \`createDemoAdapter({api})\` **solo acepta** \`api.mode === "transactional-memory-mock"\`. El modo remoto \`createRemoteAdapter()\` lanza una excepción y queda deshabilitado. Por diseño, rechaza \`baseUrl\`, \`token\`, \`headers\`, \`fetch\`, \`transport\`, \`credentials\` y otras configuraciones de transporte externo.

Las peticiones usan la misma firma conceptual:
\`\`\`js
const response = await adapter.request({
  fixture: "owner", // SOLO DEMO; identidad no verificable
  method: "GET",
  path: "/api/v1/organizations/c1/sites/s1/proposals"
});
\`\`\`

**Nunca sustituir \`fixture\` por un usuario enviado por el navegador en producción.** En el backend real se deberá derivar la identidad desde sesiones verificadas, MFA/claims autorizados y políticas de base de datos.

### Rutas demo admitidas
- \`GET /api/v1/me/notifications\` y \`POST /api/v1/me/notifications/:id/read\`.
- \`GET /api/v1/admin/outbox\` (solo el motor demo decide si el rol tiene permiso).
- \`GET /api/v1/organizations/:org/sites/:site/draft\`.
- \`GET/POST /api/v1/organizations/:org/sites/:site/proposals\`.
- \`GET /api/v1/organizations/:org/sites/:site/proposals/:id\`.
- \`POST /api/v1/organizations/:org/sites/:site/proposals/:id/submit|review|revise|apply\`.
- \`GET /api/v1/organizations/:org/sites/:site/events\` con cursor de demo.

El adaptador comprueba el formato y delega la autorización simulada al motor V14/V15. No reemplaza un servidor ni un control RLS.

### Telemetría sanitizada
- Solo conserva \`sequence\`, **tipo fijo de ruta** (no la URL concreta), estado numérico y código de error estructurado; nunca cuerpos, nombre del cliente, sitio, usuario ni IDs de operación.
- Los eventos se mantienen en un buffer circular limitado, por defecto 60 (1 a 200).
- \`getTelemetry()\` entrega una copia, y \`clearTelemetry()\` limpia métricas pero no modifica propuestas.
- Si el motor ficticio lanza un error inesperado, el adaptador devuelve \`503 DEMO_UNAVAILABLE\` sin exponer detalles sensibles.
- Si responde en formato incompatible, devuelve \`502 BAD_DEMO_RESPONSE\`.
- No se han implementado límites de solicitudes en servidor, observabilidad remota, auditoría inmutable, SIEM, alarmas ni almacenamiento de logs.

## Tablero de preparación V16
14 requisitos agrupados:
1. Proyecto exclusivo.
2. Región, costos y proveedor.
3. Auth/MFA real.
4. Membresías y scopes por sitio.
5. Grants y RLS.
6. Pruebas reales entre tenants y sitios.
7. Migraciones SQL de staging.
8. Transacciones/consistencia real.
9. Backups y restauración verificados.
10. Auditoría/outbox.
11. Privacidad y seguridad de contenidos.
12. Navegadores y móviles reales.
13. Publicación/rollback.
14. Proveedor de IA real **opcional** y control de gastos.

Marcar una casilla **no certifica su cumplimiento**. Incluso con 13/13 centrales declarados, \`productionReady=false\`, \`authorized=false\` y \`verified=false\`. El módulo nunca habilita despliegues.

## Verificación ejecutada

| Conjunto | Comprobaciones |
|---|---:|
| Asistente V9 | 49/49 |
| Intercambio V10 | 52/52 |
| Aprobaciones V11 | 64/64 |
| Bandeja V12 | 81/81 |
| Interfaz V12 | 30/30 |
| Contrato SQL V13 | 122/122 |
| API V14 | 80/80 |
| Interfaz V14 (revalidada con V16) | 33/33 |
| Recuperación V15 | 86/86 |
| Interfaz V15 (revalidada con V16) | 41/41 |
| **Adaptador V16** | **59/59** |
| **Tablero V16** | **46/46** |
| **TOTAL** | **743/743** |

**105 nuevas pruebas de V16**, sin regresiones en las 638 previas. Las pruebas fueron ejecutadas sobre el código guardado en la rama. Las verificaciones de interfaz utilizaron un DOM simulado, no un navegador real.

Reproducir localmente desde la raíz del repositorio:
\`\`\`powershell
node apps/mg-web-studio-cloud/tests/service-adapter-v16.test.cjs
node apps/mg-web-studio-cloud/tests/readiness-v16.test.cjs
node apps/mg-web-studio-cloud/tests/transactional-api-v14-ui.test.cjs
node apps/mg-web-studio-cloud/tests/resilience-v15-ui.test.cjs
\`\`\`

## Principios para una futura conexión real (NO ejecutada)
1. Proyecto independiente MG WEB STUDIO CLOUD aprobado en región y costos. No reutilizar otros proyectos Supabase.
2. Un backend/Edge Function verifica identidad, MFA y acciones; no confía en IDs, scopes, roles ni correos recibidos desde HTML.
3. Se verifica exposición efectiva de la Data API, permisos SQL GRANT y RLS, cada uno por separado. El endpoint real no se activa por la existencia de tablas.
4. Credenciales del proveedor **solo en servidor**; frontend nunca contiene service_role ni tokens de IA de pago.
5. Contratos estables para las acciones; validación de tamaño y esquema de documentos, CSRF cuando proceda, rate limiting, privacidad, auditoría, revocación y error handling.
6. Transacciones PostgreSQL verificadas (CAS/versionado, claves idempotentes, snapshot de revisión, auditoría, outbox, lectura de avisos), jamás confiar en la cola de promesas del simulador.
7. Recuperación real de PostgreSQL/Storage y dispositivos diferentes comprobada; ensayos de restauración y métricas RPO/RTO.
8. Propuestas de IA: borradores revisables, cuotas aprobadas y ningún cambio publicado automáticamente.
9. Pruebas QA E2E con dos o más identidades autorizadas/revocadas de empresas distintas y dos sitios del mismo negocio, con RLS/GRANT y sin filtraciones horizontales.

Documentación oficial relevante (consultada el 19 de octubre de 2026):
- https://supabase.com/docs/guides/api/securing-your-api (GRANT vs RLS y exposición Data API)
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Próximo paso recomendado: V17
Diseñar el contrato de servidor auténtico y la migración de la bandeja V12 al adaptador compartido: contrato de sesión/MFA, propuesta de endpoints y errores, secuencia de migración por módulos, escenarios E2E. **Mantener backend y gastos deshabilitados** hasta que el usuario autorice de forma explícita infraestructura, presupuesto, región y QA.

## Restricciones respetadas
- Solo edición en \`feature/mg-digital-v5-web-services\`, sin tocar \`main\`.
- No conexión Supabase, no migraciones, no DNS, no publicación, no correos ni push reales.
- Sin gasto de créditos Lovable y sin llamadas a APIs de IA de pago.
- No cambios en FINZY, BAZAR-ONLINE, Regaladitos Club, BRICOLOR ni otros proyectos.
