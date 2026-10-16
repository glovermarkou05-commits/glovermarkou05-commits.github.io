# MG WEB STUDIO CLOUD — V10: intercambio de propuestas y diseño de la base central

**Fecha:** 16 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Estado:** intercambio manual de **datos ficticios exclusivamente**, con pruebas de código. No existe backend, autenticación, base de datos compartida ni IA real conectada.

## Entrega implementada

- Nuevo contrato común de propuesta \`shared/mg-proposal-exchange-demo.js\`.
- SUPERADMIN / \`prototipo.html\`: sobre una propuesta V9 preparada, el administrador puede pulsar **«Preparar paquete JSON»** y copiarlo.
- Portal del emprendedor / \`portal-cliente.html\`: formulario **«Recibir propuesta desde SUPERADMIN»**. El usuario pega el JSON, el sistema verifica empresa, sitio, plan y estructura, muestra los contenidos y permite **«Aplicar al borrador»** tras confirmación.
- El paquete se recibe como texto, sin subida automática ni conexión de red. El archivo JSON **no está firmado ni demuestra autorización**. Úsese solo con empresas/correos/datos ficticios.
- Se rechazan HTML dentro de textos, bloques fuera de catálogo o fuera de plan, rutas \`slug\` inválidas/duplicadas y paquetes sobre el límite de 40.000 caracteres.
- Datos adicionales no previstos se eliminan en la importación (por ejemplo, propiedades \`image\` con URL externa, \`extraKey\`), y nunca se ejecuta HTML proporcionado en el JSON.
- La propuesta que llega de la agencia se guarda como revisión temporal del negocio activo; no modifica el borrador hasta aprobación.
- Se conserva comprobación de versión referencial del borrador y se impide aplicar si el plan, sitio o versiones cambiaron.
- Si alguna ruta de página propuesta ya existe, **bloquea la aplicación completa**, no omite silenciosamente páginas ni modifica Inicio. Se debe revisar y generar una propuesta nueva.
- Las publicaciones, recursos multimedia, historiales, pedidos, productos, promociones y mensajes reales no se modifican.

## Importante: no es sincronización real

Las dos maquetas funcionan por separado. La **única transferencia entre paneles en V10 es manual, por copiar y pegar un paquete JSON de demostración**. El destino confirma estructura contra su propia selección local de empresa/sitio/plan, pero cualquier usuario puede modificar estos valores en JavaScript. No es una prueba criptográfica de autor, integridad ni identidad. Nunca usarlo para datos de clientes reales.

La plantilla del asistente V9 utiliza reglas deterministas; no genera contenido con un modelo de IA real.

## Contrato de paquete demo

\`\`\`json
{
  "format": "mg-web-studio-proposal/v10-demo-1",
  "source": "superadmin-demo",
  "target": {"clientId": "c1", "siteId": "s1", "plan": "Crece"},
  "proposal": {
    "mode": "template-simulation",
    "businessName": "Café Horizonte",
    "plan": "Crece",
    "color": "#347b63",
    "pages": []
  }
}
\`\`\`

La muestra anterior **es ilustrativa e incompleta** (\`pages\` vacío se rechaza). El generador V9 crea el objeto completo y el adaptador V10 lo normaliza antes de exportar. No usar la muestra como archivo de importación.

## Modelo para futura base central (solo diseño)

| Entidad lógica | Campos/relaciones esenciales | Consideraciones |
|---|---|---|
| \`organizations\` | ID UUID, nombre, estado | Tenant de pertenencia |
| \`sites\` | ID UUID, \`organization_id\`, plan | FK única por empresa/sitio |
| \`memberships\` | \`user_id\`, \`organization_id\`, rol, estado | Sesión real, MFA según rol |
| \`membership_site_scopes\` | Membresía y sitio con mismo \`organization_id\` | Bloquear acceso EDITOR/VIEWER fuera de alcance, incluido otro sitio del **mismo** tenant |
| \`site_drafts\` | \`site_id\`, \`organization_id\`, \`revision\`, documento | Comprobación CAS con expectedVersion |
| \`site_proposals\` | ID UUID, empresa, sitio, plan, snapshot de propuesta, estado | Borrador independiente de producción |
| \`proposal_revisions\` | \`proposal_id\`, versión, fecha, autor, documento inmutable | Comparación, auditoría y recuperación |
| \`proposal_reviews\` | Propuesta/versión, actor, decisión, notas, fecha | Aceptación autenticada y auditada |
| \`site_releases\` | Versión publicada, puntero activo, hash de contenido y recursos | Publicación transaccional; no incluir datos privados |
| \`idempotency_keys\` | Tenant, actor, operación, huella, resultado | Impedir duplicados tras reintentos |
| \`outbox_events\` | Tenant/sitio, versión, tipo, fecha, estado | Notificación posterior a commit, sin depender de push |

### Estados propuestos de una propuesta
\`draft\` → \`submitted_for_review\` → \`needs_changes\` / \`approved\` / \`rejected\` → \`applied_to_draft\`.
Nunca equivale a \`published\`. Una nueva revisión invalida la aprobación de la revisión anterior.

### Comportamiento requerido del backend real
1. La agencia verifica identidad interna SUPERADMIN con MFA. El emprendedor tiene una sesión real y membresía vigente.
2. Las propuestas pertenecen a un sitio identificado por claves de base de datos, **no por un parámetro de URL de navegador**.
3. La agencia crea la propuesta en el servidor. El backend registra actor, tenant/sitio, revisión y evento de notificación sin exponer secretos.
4. El miembro autorizado del negocio revisa la propuesta que la API le entrega, puede rechazarla, pedir cambios o aprobarla. EDITOR solo aplica a borradores si contrato/roles lo autorizan; VIEWER no modifica.
5. Aplicar a borrador compara \`proposal_revision\` y \`site_draft_revision\`, controla límites reales del plan, aplica una transacción atómica y guarda auditoría/outbox. Conflictos devuelven \`409\`.
6. Publicar se maneja en una operación separada, con permisos elevados, revisión de privacidad/SEO, almacenamiento versionado e idempotencia.
7. Un evento de Realtime solo avisa de cambios, **nunca confiere acceso ni contiene textos privados**; el cliente recarga datos con autorización en servidor.
8. Todos los accesos exigen RLS y validación de scope de sitio, incluso dentro del mismo tenant. Nunca exponer \`service_role\` en el frontend.

## API futura sugerida (NO DISPONIBLE)
- \`POST /api/admin/sites/:siteId/proposals\`: crear desde agencia con MFA.
- \`GET /api/organizations/:orgId/sites/:siteId/proposals\`: listar propuestas accesibles según rol.
- \`GET /api/organizations/:orgId/sites/:siteId/proposals/:proposalId\`: recuperar revisión.
- \`POST /api/organizations/:orgId/sites/:siteId/proposals/:proposalId/review\`: pedir cambios/aprobar/rechazar con revisión esperada.
- \`POST /api/organizations/:orgId/sites/:siteId/proposals/:proposalId/apply\`: aplicar una revisión aprobada al borrador, \`expectedVersion\`, idempotencia y permisos.
- \`GET /api/organizations/:orgId/sites/:siteId/changes?afterVersion=...\`: sincronización incremental autorizada.

## QA ejecutado
- **48/48 pruebas reutilizables** del intercambio manual V10: exportación, importación, validaciones de tenant/sitio/plan, saneamiento, esquema y rutas, aprobación, bloqueo VIEWER, rutas preexistentes, separación entre negocios y publicaciones intactas.
- Archivo \`tests/proposal-exchange-v10.test.cjs\`; se ejecutó el cuerpo del test en un entorno JavaScript simulado, utilizando los scripts reales recuperados del repositorio. El script está preparado para ejecutarse también con Node local.
- Otra ronda exploratoria alcanzó 34/34.
- **Pruebas visuales con navegador y uso real del portapapeles siguen pendientes**. Los visores HTML externos pueden bloquear la carga de los scripts relativos.

## Controles operativos
- No crear/activar nuevos proyectos Supabase, no ejecutar SQL ni cambiar planes.
- No enviar solicitudes a OpenAI, Lovable o a terceros.
- No insertar claves, datos reales ni correos verdaderos en GitHub o paquetes JSON.
- No publicar el sitio ni modificar rama \`main\`.

**Cualquier integración real queda supeditada a revisión de costos, región, seguridad y autorización explícita.**
