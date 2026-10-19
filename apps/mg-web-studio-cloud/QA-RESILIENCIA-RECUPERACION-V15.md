# MG WEB STUDIO CLOUD — V15 | Resiliencia, checkpoints ficticios y sincronización por cursor

**Fecha:** 19 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Estado:** pruebas JavaScript en memoria y laboratorios HTML. **NO** hay servidor HTTP, SQL ejecutado, sesión real, Supabase, copias en nube, notificaciones externas ni publicación de páginas.

## Qué quedó implementado

### Simulación de recuperación (\`shared/mg-v15-recovery-demo.js\`)
- Valida la estructura de snapshots ficticios: empresas y sitios relacionados, borradores, propuestas, revisiones, decisiones, notificaciones, eventos e idempotencia.
- Rechaza revisiones ausentes o duplicadas, propuestas cruzadas de empresa/sitio, contadores regresivos, eventos huérfanos, operaciones duplicadas y estado publicado/aplicado inconsistente.
- Prepara un checkpoint temporal como copia del estado; permite verificar integridad accidental mediante checksum **FNV32 no criptográfico**.
- El checkpoint no está firmado, cifrado ni guardado automáticamente: **no es una copia de seguridad real y nunca debe utilizarse con datos privados**.

### Simulador API reforzado (\`shared/mg-transactional-api-v14-demo.js\`)
- Permite **restauración explícita solo para pruebas**, con \`initialSnapshotForTests\` y \`validateSnapshotForTests\` obligatorios. Rechaza restauración inconsistente.
- Incorpora \`beforeCommitForTests\`: falla artificialmente antes del commit y devuelve un 503 simulado, sin crear cambios parciales, idempotencia ni eventos. Un reintento con la misma clave puede confirmar la operación una sola vez.
- Conserva reintentos previamente confirmados después de rehidratar un checkpoint. Vuelve a comprobar permisos actuales; una membresía revocada no puede repetir una operación solo por conocer la clave.
- Añade una **ruta virtual de lectura incremental** \`GET /api/v1/organizations/:org/sites/:site/events\` con cursor \`query.after\`, máximo 50 eventos por consulta, \`nextCursor\` y \`hasMore\`.
- Los eventos entregan metadatos de tipo, número de revisión, sitio, propuesta y secuencia, no documentos de propuesta ni contenido privado.
- El acceso al cursor se valida contra empresa, sitio, membresía, rol y MFA simulado. OWNER de otra empresa y EDITOR de otro sitio no lo reciben.

**Importante:** estos endpoints son invocaciones \`api.request(objeto)\` dentro del propio JavaScript; no atienden conexiones de red. La cola de promesas y el commit por snapshot no equivalen a una transacción ACID de PostgreSQL ni garantizan consistencia entre procesos, máquinas o sesiones de navegador.

### Laboratorio visual (\`laboratorio-recuperacion-v15.html\`)
Flujo con datos ficticios:
1. Crear propuesta.
2. Simular fallo de envío (503 sin cambiar estado).
3. Reintentar con la misma operación.
4. Aprobar.
5. Crear checkpoint volátil de prueba.
6. Aplicar únicamente al borrador.
7. Restaurar el checkpoint y comprobar que retorna la revisión anterior.
8. Consultar eventos mediante cursor para OWNER, VIEWER y usuarios ajenos; los ajenos se bloquean en la simulación.

El laboratorio está enlazado desde \`prototipo.html\`, \`portal-cliente.html\` y \`laboratorio-api-v14.html\`. **No comparte ni sincroniza sus datos** con esos paneles. Todo se pierde al recargar. HTMLPreview externo puede no cargar scripts relativos; probar en un servidor estático local.

## QA completado en esta entrega

| Conjunto | Resultado |
|---|---:|
| Asistente V9 | 49/49 |
| Transferencia V10 | 52/52 |
| Aprobaciones V11 | 64/64 |
| Bandeja V12 | 81/81 |
| Interfaz bandeja V12 | 30/30 |
| Modelo estático V13 | 122/122 |
| API V14 | 80/80 |
| Interfaz API V14 | 33/33 |
| **Recuperación y consistencia V15** | **86/86** |
| **Interfaz de resiliencia V15** | **41/41** |
| **TOTAL V9–V15** | **638/638** |

Verificación V15:
- Fallo previo al commit para crear, enviar y aplicar; cada fallo deja intacto el snapshot y el registro de idempotencia, reintento posterior confirma.
- Rehidratación desde checkpoint validado, conservación de versiones, historial y eventos.
- Detección de corrupción: propuesta asociada a empresa equivocada, sitio inexistente, revisión alterada/faltante/duplicada, notificación duplicada, outbox huérfano, operación de idempotencia repetida y contadores regresivos.
- Cursor de eventos paginado por orden de secuencia, bloqueo entre tenants y sitios, rechazo de cursor inválido.
- Revocación de membresía después de la restauración; ningún replay autoriza al colaborador revocado.
- QA de botones y estados en DOM simulado, incluida restauración tras la aplicación y filtrado de eventos.
- No se generaron ni modificaron releases de publicación real; el contador \`publishedCount\` se conserva en cero.

Pruebas ejecutadas usando el código recuperado de esta rama de GitHub. **Son pruebas funcionales y de DOM simulados, no pruebas en un navegador, servidores, bases de datos ni RLS reales.**

### Comandos reproducibles desde la raíz del repositorio

\`\`\`powershell
node apps/mg-web-studio-cloud/tests/resilience-contract-v15.test.cjs
node apps/mg-web-studio-cloud/tests/resilience-v15-ui.test.cjs
\`\`\`

Los casos previos siguen en \`apps/mg-web-studio-cloud/tests/\` con archivos \`*.test.cjs\`.

## Qué NO debemos dar por validado

- Checksum FNV32: detecta diferencias accidentales, **no impide manipulación deliberada**. En producción deberán utilizarse firmas, controles de acceso y autenticidad/integridad apropiadas según amenaza.
- Restauración actual: reconstruye una **instancia JavaScript**, no restaura PostgreSQL, imágenes, Storage, expedientes, DNS ni logs.
- No existe backup automático ni cifrado, retención, RPO/RTO, almacenamiento redundante o ensayo real de recuperación.
- La notificación del cursor no se envía a los paneles actuales. Se necesita un servicio real, sesiones verificadas y autorización por tenant/sitio en cada consulta.
- El simulador puede ser manipulado desde el navegador. Ningún control de la demo cuenta como autenticación, MFA, autorización de producción o protección de datos personales.
- No hay prueba de navegador real (Chrome/Android), multiusuario en servidores separados, rendimiento, seguridad de RLS, CSRF, rate-limits ni concurrencia de PostgreSQL.

## Próximos pasos recomendados: V16

Sin activar infraestructura hasta autorización explícita:
1. Diseñar **contratos de migración, observabilidad y recuperación** para un backend exclusivo de MG WEB STUDIO CLOUD.
2. Separar controles de servidor y UX; integrar pantallas contra un **adaptador intercambiable**, manteniendo demo segura.
3. Preparar una checklist de despliegue y pruebas reales: roles y MFA, RLS por sitio, acceso horizontal, auditoría, sesiones, costos, respaldos, restauración, seguridad de dominios, publicación y uso de IA.
4. Solo tras aprobar proyecto, región, presupuesto y alcance: crear entorno aislado de staging, ejecutar migraciones, pruebas de base de datos y autenticación real antes de producción.

## Restricciones mantenidas
- Cambios realizados únicamente en GitHub, rama \`feature/mg-digital-v5-web-services\`; \`main\` intacta.
- No se consumieron créditos Lovable, no se ejecutó SQL, no se creó ni alteró ningún proyecto Supabase, no se conectó ninguna IA de pago ni se desplegó web.
- No se tocó BAZAR-ONLINE, FINZY, Regaladitos Club ni otros productos existentes.
