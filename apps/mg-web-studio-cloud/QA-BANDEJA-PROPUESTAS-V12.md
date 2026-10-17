# MG WEB STUDIO CLOUD — V12: Bandeja central de propuestas y notificaciones

**Fecha de entrega:** 17 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Alcance:** demostración VOLÁTIL en una sola página HTML. Sin red, email, autenticación, base de datos ni publicación.

## Entrega implementada

Archivos nuevos:
- \`shared/mg-proposal-inbox-demo.js\`: módulo común de bandeja en memoria. Conserva propuestas, revisiones, notificaciones, decisiones y borradores dentro de una única instancia JS mientras permanece abierta.
- \`bandeja-propuestas-demo.html\`: laboratorio visual para alternar entre SUPERADMIN y emprendedores ficticios, crear propuestas con el generador de plantillas V9, enviar a revisión, solicitar cambios/rechazar/aprobar, aplicar al borrador y consultar avisos.
- \`tests/proposal-inbox-v12.test.cjs\`: pruebas del modelo y autorización lógica ficticia.
- \`tests/proposal-inbox-v12-ui.test.cjs\`: pruebas de interfaz con DOM simulado.

Actualizados:
- \`prototipo.html\`: nuevo acceso «Bandeja de propuestas» en el menú de SUPERADMIN, con enlace al laboratorio V12.
- \`portal-cliente.html\`: nuevo acceso «Bandeja de propuestas» en el menú del emprendedor, con enlace al mismo laboratorio.

## Operaciones disponibles (todas SOLO simuladas)

- SUPERADMIN de ejemplo con requisito MFA ficticio: generar propuesta por sitio y plan, enviarla a revisión, modificar a nueva revisión tras rechazo o solicitud de cambios, revisar avisos.
- CLIENT_OWNER y CLIENT_ADMIN: leer y aprobar, rechazar o solicitar cambios.
- CLIENT_EDITOR: leer y solicitar cambios del sitio asignado, aplicar **una propuesta aprobada** a borrador, pero no aprobar ni rechazar.
- CLIENT_VIEWER: lectura sin decisiones ni escritura.
- Se filtran propuestas y notificaciones por organización y, cuando procede, sitio asignado. Una cuenta ficticia revocada deja de consultar sus propuestas y avisos en el mismo laboratorio.
- Notificaciones internas por destinatario con propiedad \`read\` y contador de no leídas. Abrir un aviso lo marca como leído para ese usuario, sin alterar el contador de otros destinatarios.
- Cada propuesta mantiene revisiones y un historial de decisiones. Una respuesta de revisión antigua se rechaza.
- Aplicación aprobada comprueba \`expectedRevision\`, versión de borrador, plan, límite de páginas y colisiones de rutas; conserva un contador de publicaciones reales igual a cero.

## Flujo recomendado para probar
1. Abrir \`bandeja-propuestas-demo.html\` junto con la carpeta \`shared\`.
2. Mantener el perfil **SUPERADMIN**; seleccionar Café Horizonte y pulsar **Crear propuesta**.
3. En el detalle, pulsar **Enviar a revisión (demo)**.
4. Cambiar al perfil **Café Horizonte · Propietario**: la propuesta y el aviso deberán aparecer; abrir el aviso reducirá su contador.
5. Solicitar cambios con una observación ficticia; regresar a SUPERADMIN y generar la **revisión 2** del mismo sitio.
6. Enviar revisión 2; volver al propietario y aprobar.
7. Con perfil EDITOR del mismo sitio, aplicar al **borrador ficticio**. No se crea ningún release público.
8. Cambiar a **Papelería Nube · Propietario** y verificar que no aparecen las propuestas de Café Horizonte.

## Límites: lo que NO hace esta etapa

La bandeja funciona solamente dentro de **una página de laboratorio**. Los documentos \`prototipo.html\` y \`portal-cliente.html\` conservan su estado local independiente y el intercambio manual V10/V11; sus menús solo abren el laboratorio. Las decisiones realizadas allí NO se reflejan en los otros paneles. Cambiar de perfil con el selector NO demuestra autenticación: el JavaScript puede manipularse. Los usuarios de ejemplo no tienen cuentas, contraseñas, sesiones ni MFA reales.

No existe sincronización entre pestañas, persistencia después de recargar, envío por correo, notificaciones push, bases de datos, IA real ni cobros. No introducir datos reales.

## Validación completada
- **81/81** pruebas funcionales de la bandeja: pertenencia cliente/sitio, estados, revisión, aprobaciones, control de acceso, revocación, cambios, aplicación, notificaciones y copias defensivas.
- **30/30** pruebas de interfaz V12 con DOM simulado: listas y contadores, perfiles, cambio entre clientes, notificaciones, revisión, enlaces y sintaxis de paneles.
- **49/49** pruebas de regresión del asistente V9.
- **52/52** pruebas de regresión del intercambio manual V10.
- **64/64** pruebas de regresión de revisión V11.
- **TOTAL: 276/276 comprobaciones automatizadas simuladas correctas.**

Estos resultados NO incluyen prueba de navegador real, QA móvil, seguridad real, SQL RLS o sincronización entre equipos. Visores externos como HTMLPreview podrían no resolver scripts relativos; usar servidor estático local para prueba integral.

Comandos reproducibles desde la raíz del repositorio:
\`\`\`powershell
node apps/mg-web-studio-cloud/tests/proposal-inbox-v12.test.cjs
node apps/mg-web-studio-cloud/tests/proposal-inbox-v12-ui.test.cjs
node apps/mg-web-studio-cloud/tests/ai-web-assistant-demo.test.cjs
node apps/mg-web-studio-cloud/tests/proposal-exchange-v10.test.cjs
node apps/mg-web-studio-cloud/tests/proposal-review-v11.test.cjs
\`\`\`

## Próxima etapa técnica propuesta: V13

**Sin activar infraestructura hasta recibir autorización específica de costos, región y proveedor:**
1. Preparar diseño SQL en archivos de revisión (no ejecutar): \`site_proposals\`, \`proposal_revisions\`, \`proposal_reviews\`, \`notifications\`, \`notification_reads\`, \`draft_versions\`, \`outbox_events\`, claves foráneas compuestas por tenant/sitio.
2. Corregir RLS actual del esquema preliminar para permisos por sitio; tests de intrusión horizontal entre tenants y entre sitios de un mismo negocio.
3. Endpoints con sesión real, MFA administrativo, scopes, auditoría y escrituras transaccionales con versionado CAS/idempotencia.
4. Clientes reciben datos desde backend y pasan a tener una bandeja real compartida (no desde parámetros URL ni selectores ficticios).
5. Notificaciones posteriores a commit; los eventos push son solo avisos que requieren recarga autenticada.
6. QA en navegador real, Android, restauración y pruebas de seguridad.

## Restricciones mantenidas
- Solo se escribieron archivos en la rama GitHub V5; \`main\` no fue editada.
- No se realizaron llamadas a Supabase, Lovable ni modelos IA de pago.
- No se crearon dominios, correos, usuarios, sesiones, bases, despliegues ni pagos.
- No se modificaron los proyectos BAZAR-ONLINE, Regaladitos Club, FINZY ni otros existentes.
