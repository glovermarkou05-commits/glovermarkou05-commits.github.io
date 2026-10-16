# MG WEB STUDIO CLOUD — SERVICIOS COMUNES V6

**Fecha:** 16 de octubre de 2026. **Implementado únicamente en la rama V5 del repositorio.**

## Entrega
Módulo JavaScript común:
\`apps/mg-web-studio-cloud/shared/mg-web-studio-services.js\`

Lo cargan (con script relativo local) ambas maquetas:
- \`prototipo.html\` (SUPERADMIN)
- \`portal-cliente.html\` (portal del emprendedor)

Es un adaptador **en memoria**, sin acceso a red ni a bases de datos. Provee una interfaz de lectura coherente para ambos paneles, tomando los registros que ya maneja cada demo. **Cada panel sigue teniendo su propia copia de los datos**, no existen sincronización entre ventanas, persistencia ni autorización real.

### API actual

| Función | Propósito |
|---|---|
| \`listOrganizations()\` | Devuelve organizaciones ficticias del panel |
| \`getOrganization(id)\` | Recupera un negocio por identificador |
| \`listSites(clientId)\` | Devuelve los sitios del mismo negocio |
| \`getSite(clientId,siteId)\` | Comprueba que el sitio pertenece al negocio |
| \`getFixtureSite(siteId)\` | Resuelve los dos ejemplos estáticos (c1/s1, c2/s2) |
| \`can(memberId,siteId,action)\` | Evalúa rol, estado y alcance **solamente en demostración** |
| \`createNavigation(contexto)\` | Construye URL contextual de la demo; comprueba rol y plan |
| \`readNavigation(query)\` | Analiza URL y rechaza identificadores de ejemplo no reconocidos |

El adaptador lee los registros en cada operación (no guarda una copia desactualizada), y entrega **copias** de objetos consultados para evitar mutaciones accidentales.

Cuando el archivo compartido no está disponible, ambas páginas conservan los controles locales anteriores. Esta funcionalidad de respaldo es útil para visores externos que no resuelven rutas relativas.

## Integración por panel
**SUPERADMIN**
- Usa el servicio común para validar si un miembro ficticio puede leer/editar/publicar en un sitio y para resolver asociaciones.
- Genera enlaces de demostración a partir del servicio común con el plan referencial aprobado **solo para la demo**.
- La pantalla «Conexión de paneles» informa si el servicio compartido se cargó o se usa el respaldo autónomo.

**Portal del emprendedor**
- Usa el servicio común para listar organizaciones ficticias y resolver el contexto recibido del SUPERADMIN.
- Los parámetros URL solo seleccionan una **vista de demostración**. No sirven para iniciar sesión, identificar usuarios ni proteger datos.

## Pruebas
**85/85 comprobaciones** efectuadas con ejecución JavaScript y DOM simulado en la revisión del 16/10/2026, incluyendo:
- Métodos de servicio, aislamientos lógicos entre tenants, roles, revocación y roundtrip de URLs.
- 14 vistas SUPERADMIN y 18 vistas del emprendedor.
- Modo compartido habilitado y modo de respaldo con el archivo ausente.
- Copias retornadas aisladas de mutaciones accidentales.

Pruebas automáticas reutilizables sin dependencias: \`tests/services-demo.test.cjs\` (31 casos con Node). Comando para ejecutar desde la raíz del repo:
\`node apps/mg-web-studio-cloud/tests/services-demo.test.cjs\`
**Nota:** la cifra 85/85 corresponde a la ejecución del entorno de revisión; no se afirmó ejecutar aquí el test de Node en navegador real.

## Contrato para la futura integración real
En producción deberá reemplazarse este adaptador por uno de **consultas asíncronas** a la API del servidor, implementando:
1. \`GET /api/me/organizations\`: obtener solo empresas que permite la sesión autenticada.
2. \`GET /api/organizations/{orgId}/sites\`: autorización server-side y RLS.
3. \`GET /api/organizations/{orgId}/sites/{siteId}\`: misma organización por FK y permisos.
4. \`GET /api/organizations/{orgId}/sites/{siteId}/capabilities\`: capacidades derivadas de membresía verificable, nunca del rol pasado en URL.
5. \`GET /api/admin/organizations\`: solo SUPERADMIN con MFA y auditoría.
6. Servicios específicos y separados para contenido, medios, formularios, invitaciones, publicaciones y facturación.
7. \`PATCH/POST\` con versionado, idempotencia, validación, permisos y auditoría. No inferir éxito por cambios visuales.
8. Un backend exclusivo de MG WEB STUDIO CLOUD tras aprobación expresa de proyecto/región/costos. Jamás reutilizar otros proyectos.

### Seguridad
- Los datos y roles ficticios de \`?mgdemo\` son manipulables; ninguna vista está autenticada.
- El script compartido **NO garantiza seguridad, secreto, cifrado, RLS ni sesiones**.
- No tratar el chequeo \`can()\` de frontend como autorización real.
- No se almacenan secrets/tokens ni correos reales. Los datos de demo terminan al recargar.
- Los visores HTML externos no garantizan cargar scripts relativos. La prueba real requerirá abrir ambos HTML desde la misma carpeta y origen.
- Mantener \`main\` sin publicar, no ejecutar migraciones ni activar Supabase Pro.
