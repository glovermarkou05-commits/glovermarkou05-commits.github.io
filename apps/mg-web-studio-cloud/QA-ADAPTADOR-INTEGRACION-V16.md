# MG WEB STUDIO CLOUD — V16 | Adaptador de servicios y pruebas de integración

**Fecha:** 19 de octubre de 2026  
**Rama de desarrollo:** \`feature/mg-digital-v5-web-services\`  
**Estado:** arquitectura y pruebas locales. **Sin servidor HTTP, Supabase, autenticación real, sincronización entre dispositivos ni publicación.**

## Resumen ejecutivo

V16 prepara un **adaptador de servicios intercambiable** para que la interfaz no dependa directamente de las funciones del simulador transaccional V14/V15. El único adaptador activado es \`createDemoAdapter\`, que opera sobre el mismo motor JS en memoria. \`createRemoteAdapter\` se mantiene deliberadamente deshabilitado y rechaza toda activación; se prohíben URL, tokens, credenciales y transportes externos en el modo de prueba.

Esto permite comprobar el futuro protocolo entre MG Digital Solutions (SUPERADMIN) y el cliente sin gastar créditos ni conectar infraestructura.

## Archivos de la etapa

- \`shared/mg-service-adapter-v16-demo.js\`: adaptador local de solicitudes con rutas permitidas, errores normalizados, rechazo de credenciales, métricas y eventos técnicos limitados.
- \`laboratorio-api-v14.html\`: integrado con adaptador V16 para gestionar propuestas, decisiones y avisos con perfiles ficticios; muestra contador de solicitudes del adaptador.
- \`laboratorio-recuperacion-v15.html\`: integrado con V16 para probar fallo 503, reintentos, checkpoint temporal y eventos; al reiniciar/restaurar se reconfigura el adaptador al nuevo motor.
- \`tests/service-adapter-v16.test.cjs\`: validaciones específicas del adaptador, rechazo de modo remoto, rutas, errores y telemetría.
- \`tests/integracion-paneles-v16.test.cjs\`: dos fachadas de API de demo (agencia y cliente) que consultan y mutan **un único motor de memoria**; reproduce envío, revisión, aprobación, aplicación, notificaciones, cursor e idempotencia, más restauración a otro motor ficticio.
- Este informe \`QA-ADAPTADOR-INTEGRACION-V16.md\`.

## Contrato del adaptador (solo local)

\`\`\`js
const adapter = MGWebStudioServiceAdapter.createDemoAdapter({
  api: motorV14EnMemoria,
  maxTraceRecords: 60
});
const result = await adapter.request({
  fixture: "owner",                         // usuario ficticio, NO identidad real
  method: "GET",
  path: "/api/v1/organizations/c1/sites/s1/proposals"
});
const telemetry = adapter.getTelemetry();
\`\`\`

La capa acepta únicamente las rutas y métodos virtuales autorizados por V14 (propuestas, revisión, aplicación, borradores, avisos, eventos e inspección administrativa ficticia). Devuelve \`status\`, \`body\` y \`headers\`. Rechaza identidad privilegiada introducida directamente en el objeto de solicitud (\`role\`, \`userId\`, \`accessToken\`, etc.) y rechaza URL y cabeceras de conexión en la configuración.

El parámetro \`fixture\` **sigue siendo completamente manipulable** y solo es adecuado para pruebas. En producción deberá desaparecer del contrato público: el backend derivará el usuario de sesiones verificadas.

La telemetría local registra **tipo de ruta, estado, código de error y si hubo reintento**, además de contadores de éxito, errores, accesos denegados y fallos de transporte. No almacena cuerpos de propuestas, correos, contraseñas ni tokens. No tiene exportación automática ni envío remoto.

## Recorrido V16 verificado

1. Dos fachadas de demostración (\`staff\` y \`client\`) apuntan **al mismo simulador V14**.
2. SUPERADMIN ficticio crea la propuesta. El propietario la consulta; otros negocios y editores sin scope no acceden.
3. SUPERADMIN envía revisión. Solo el destinatario puede marcar su notificación como leída.
4. OWNER ficticio aprueba. EDITOR con alcance de sitio aplica el contenido **al borrador**, sin publicar.
5. Repetir operación con misma clave conserva idempotencia. Los eventos incrementales devuelven solo metadatos mediante cursor.
6. Un checkpoint V15 se rehidrata en **una instancia nueva local** y el adaptador recupera la última revisión y los eventos.
7. Al revocar la membresía del EDITOR, se deniegan consultas posteriores y el reintento de una escritura ya registrada.

Ninguna decisión de este recorrido sincroniza las ventanas independientes de \`prototipo.html\` y \`portal-cliente.html\`; estos siguen siendo prototipos autónomos, que enlazan a laboratorios. Solo una API real futura podrá ofrecer estado compartido permanente.

## QA realmente ejecutado

| Suite de pruebas | Casos correctos |
|---|---:|
| V9 asistente guiado | 49/49 |
| V10 intercambio manual | 52/52 |
| V11 decisiones | 64/64 |
| V12 bandeja | 81/81 |
| V12 interfaz | 30/30 |
| V13 contratos SQL estáticos | 122/122 |
| V14 API transaccional | 80/80 |
| V14 interfaz | 33/33 |
| V15 recuperación | 86/86 |
| V15 interfaz | 41/41 |
| **V16 adaptador** | **59/59** |
| **V16 integración de fachadas** | **45/45** |
| **TOTAL** | **742/742** |

Verificaciones realizadas ejecutando el JavaScript obtenido de la rama GitHub y utilizando un DOM simulado en los casos de interfaz. No se hicieron pruebas en navegador real, Android, HTTP, base de datos PostgreSQL, Supabase RLS o redes de varios dispositivos.

Comandos reproducibles desde la raíz del repositorio:

\`\`\`powershell
node apps/mg-web-studio-cloud/tests/service-adapter-v16.test.cjs
node apps/mg-web-studio-cloud/tests/integracion-paneles-v16.test.cjs
node apps/mg-web-studio-cloud/tests/transactional-api-v14-ui.test.cjs
node apps/mg-web-studio-cloud/tests/resilience-v15-ui.test.cjs
\`\`\`

## Bloqueos obligatorios antes de pasar a un backend real

**No activar infraestructura, cobros, DNS, publicaciones, bases, servicios externos ni IA de pago hasta obtener autorización explícita.**

1. **Infraestructura aislada.** Definir proveedor, región, proyecto separado, plan y presupuesto. No reutilizar Supabase de FINZY, BAZAR-ONLINE o Regaladitos Club.
2. **Modelo/SQL.** Resolver esquema V13 como migraciones revisadas, tablas reales, FK compuestas, políticas RLS de alcance sitio/tenant, operaciones CAS y auditoría inmutable; probar todo en staging.
3. **Identidad.** Derivar el actor exclusivamente de sesiones verificadas en servidor; MFA verificable para SUPERADMIN; revocación y scopes comprobados antes de cada acceso. Nunca confiar en el campo \`fixture\` o un rol del navegador.
4. **Intercambio real.** Convertir la bandeja V12 y los paneles administrativos/cliente a lecturas y escrituras contra la misma API protegida. No permitir a un panel modificar el tenant o el sitio de otro.
5. **Observabilidad.** Implementar request/correlation IDs, redacción de datos privados, auditoría de autor y operación, métricas de error, tasa y latencia, retención y alertas. No guardar prompts, secretos ni cuerpos privados en logs de acceso.
6. **Resiliencia.** Reintentos seguros, idempotencia transaccional, outbox y procesador de eventos, backups cifrados y probados, recuperación ante fallos reales, RPO/RTO y procedimientos de reversión.
7. **Seguridad web.** CSRF cuando haya cookies, CORS restringido, controles de sesión, rate limits, validación de cargas, separación de entornos y no exposición de claves de servicio en el cliente.
8. **QA real.** Probar con sesiones multiusuario y varios dispositivos, cambios concurrentes, roles cruzados, seguridad SQL/RLS y pruebas end-to-end de formularios y publicación.

**Activación recomendada:** una futura etapa de infraestructura aislada y staging, únicamente cuando se aprueben proveedor, región, límites de gasto y puesta en marcha. El diseño de IA real seguirá por separado: API del proveedor detrás de servidor, cuotas por cliente y aprobación humana de cambios.

## Restricciones mantenidas

- La rama \`main\` no fue modificada ni se desplegó web.
- No se ejecutó ningún SQL, ni se crearon/editaron proyectos Supabase.
- No hubo llamadas a IA de pago, servicios de cobro, Lovable ni cuentas reales.
- FINZY, BAZAR-ONLINE, Regaladitos Club y demás proyectos existentes permanecen fuera de alcance.

**Siguiente fase sugerida:** V17, preparar una evaluación de despliegue de staging con un checklist de seguridad que permita una autorización informada, manteniendo modo solo lectura hasta su aprobación.
