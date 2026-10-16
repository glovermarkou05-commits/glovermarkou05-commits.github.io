# MG WEB STUDIO CLOUD — V11 · Revisión y aprobación de propuestas

**Fecha:** 16 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Estado:** simulación local, sin backend, autenticación real, firma digital, IA de pago ni publicaciones.

## Funcionalidades entregadas

### SUPERADMIN
1. Genera una propuesta ficticia en **Asistente web IA (demo)**.
2. La propuesta recibe un número de revisión local, inicialmente v1.
3. **Enviar a revisión / preparar JSON** genera un paquete V10 con información auxiliar V11 de revisión y un checksum local, y marca «Enviada a revisión» **solo en el SUPERADMIN**.
4. El SUPERADMIN copia manualmente el paquete y lo pega en el portal del negocio ficticio correspondiente (no se envían correos ni notificaciones).
5. Recibe manualmente la **respuesta JSON de revisión** desde el portal, la pega en el formulario «Registrar respuesta de revisión» y el sistema compara empresa, sitio, plan, revisión y checksum contra el documento efectivamente exportado.
6. Estados posibles: «Aprobada (demo)», «Cambios solicitados (demo)» y «Rechazada (demo)».
7. Queda un historial local de respuestas, con revisión, estado, nota y fecha de demostración.
8. Al preparar otra propuesta del mismo sitio, se incrementa la revisión; una respuesta de una versión anterior ya no coincide.

### Portal del emprendedor
1. Pega el paquete ficticio en **Asistente web IA (demo) → Recibir propuesta desde SUPERADMIN**.
2. Se validan estructura, negocio, sitio, plan y metadatos de revisión antes de mostrarla.
3. La propuesta **no se aplica automáticamente**.
4. Roles simulados:
   - **CLIENT_OWNER / CLIENT_ADMIN**: pueden aprobar, solicitar cambios o rechazar.
   - **CLIENT_EDITOR**: puede solicitar cambios pero no aprobar/rechazar.
   - **CLIENT_VIEWER**: puede ver la propuesta; no puede decidir ni aplicar.
5. Solicitar cambios o rechazar exige observación ficticia con 8–500 caracteres.
6. La decisión genera una **respuesta JSON** para copiar manualmente al SUPERADMIN.
7. Una propuesta importada únicamente puede **aplicarse al borrador** después de la aprobación. Cambios solicitados o rechazo no permiten aplicar.
8. Incluso aprobada, se vuelven a revisar plan, versión del borrador, permisos simulados, número de páginas y rutas antes de aplicar; se preservan releases/publicaciones previas.

## Estados de referencia (en ambas maquetas)

\`\`\`text
Borrador agencia
    └─ Enviada a revisión (paquete JSON)
         ├─ Aprobada ─→ Aplicada a borrador (portal)
         ├─ Cambios solicitados ─→ Nueva revisión vN+1
         └─ Rechazada ─→ Nueva revisión opcional vN+1
\`\`\`

**No existe un estado equivalente a publicación real.** Un sitio aprobado no aparece en internet por esta acción.

## Archivos
- \`shared/mg-proposal-review-demo.js\` — normalización de metadatos y decisiones.
- \`prototipo.html\` — UI de envíos e importación de respuesta.
- \`portal-cliente.html\` — UI de decisiones, observaciones y bloqueo de aplicación.
- \`tests/proposal-review-v11.test.cjs\` — pruebas V11.
- \`tests/proposal-exchange-v10.test.cjs\` — regresión V10 actualizada al requisito de aprobación.

## Validación de seguridad: alcance MUY limitado
- El checksum FNV32 es **una huella no criptográfica**, pensada para identificar diferencias accidentales entre propuestas locales. No prueba autoría ni evita manipulación deliberada: cualquiera puede editar/recalcular el paquete.
- No existe autenticación del SUPERADMIN ni del cliente. Los roles y \`organization_id\` son ficticios y manipulables en el frontend.
- Tampoco existe autorización de servidor, RLS, consentimiento verificable, almacenamiento seguro, historial inmutable ni trazabilidad legal.
- Ninguno de los dos HTML transporta mensajes de revisión de forma automática. Todo el intercambio se hace mediante copiar/pegar JSON **con datos ficticios**.
- Los datos se pierden al recargar, y el formato V10 sin metadatos de revisión se interpreta como «revisión heredada» local únicamente.
- No introducir nombres, correos, direcciones, contratos, información privada ni datos verdaderos de clientes.
- Los visores HTML externos no están verificados para cargar scripts relativos; deben comprobarse mediante un servidor estático local con la carpeta \`shared\`.

## Pruebas realizadas
- **64/64** pruebas V11: decisiones, notas, roles, cambios solicitados, rechazo, aprobación, revisión v1/v2/v3, comparación de paquetes, rechazo de respuesta de versión anterior, sitio ajeno, borradores publicados intactos y renderizado simulado.
- **52/52** regresión V10 actualizada: transferencia manual, saneamiento, importación, aprobación explícita y protección de conflictos.
- **49/49** regresión V9: propuestas guiadas, planes, permisos simulados, edición de borradores y vistas.
- **Total 165/165 comprobaciones automatizadas simuladas** durante esta entrega. No representan pruebas de navegador/servidor/RLS reales.

Para reproducir con Node desde la raíz del repositorio:
\`\`\`powershell
node apps/mg-web-studio-cloud/tests/ai-web-assistant-demo.test.cjs
node apps/mg-web-studio-cloud/tests/proposal-exchange-v10.test.cjs
node apps/mg-web-studio-cloud/tests/proposal-review-v11.test.cjs
\`\`\`

## Requisitos futuros para un flujo real
1. Backend exclusivo MG WEB STUDIO CLOUD, proyecto/plan/región y gastos aprobados.
2. API de propuestas con ID UUID, revisión inmutable, actor y timestamps, estado auditable.
3. Sesión verificable, autorización server-side por tenant/sitio/acción, MFA obligatorio en SUPERADMIN y RLS con scopes por sitio.
4. La agencia crea/envía desde servidor; el cliente recibe mediante inbox autorizada (sin enviar JSON manualmente).
5. Cliente acepta/rechaza/solicita cambios; la API guarda la decisión vinculada al **contenido inmutable exacto** y al usuario autenticado, no a un checksum de frontend.
6. Una propuesta nueva invalida la aprobación previa; aplicar exige \`approved\`, versión de propuesta esperada, versión actual del borrador y clave idempotente.
7. La publicación es una operación posterior separada, con permisos superiores, revisión de privacidad, validaciones y auditoría.
8. Notificaciones únicamente con proveedores aprobados, privacidad, retención y controles antiabuso; ninguna respuesta automática sin autorización.

**No se modificó \`main\`, no se activó Supabase, no se gastaron créditos Lovable ni se usaron APIs de pago.**
