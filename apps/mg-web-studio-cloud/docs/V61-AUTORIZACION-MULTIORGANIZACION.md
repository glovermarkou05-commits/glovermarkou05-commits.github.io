# V61 — Autorización multiempresa y por sitio (servidor aislado)

**Rama:** feature/mg-digital-v5-web-services  
**Alcance:** módulo CommonJS sin dependencias externas, pruebas unitarias y documentación. No se creó endpoint HTTP, conexión a STAGING, SQL, migración, servicio de pago ni publicación.

## Implementación

server/tenant-authorization.cjs exporta createTenantAuthorizer({ authenticate, repository }) y exige la inyección explícita de un autenticador de servidor (V60) y un repositorio de pertenencias. No acepta roles ni MFA proporcionados por el navegador como autoridad.

Contrato del repositorio confiable, solo en servidor:

- getOrganization({organizationId}) devuelve {id,status}; organización en estado active.
- getSite({siteId}) devuelve {id,organizationId,status}; V45 permite draft y review, rechaza suspended.
- getMembership({userId,organizationId}) devuelve {userId,organizationId,role,status}; solo active.
- getSiteScope({userId,organizationId,siteId}) devuelve {userId,organizationId,siteId}; se exige a CLIENT_EDITOR y CLIENT_VIEWER.

Las firmas reflejan los campos reales de la instalación V45: **no existe membershipId ni status en mg_membership_site_scopes**. La clave compuesta es (organization_id,user_id,site_id); la ausencia se representa como null. La implementación futura del repositorio debe consultar registros vigentes, devolver a lo sumo un registro y no usar una caché de autorizaciones entre solicitudes.

Una autorización correcta devuelve {ok:true,context:{userId,organizationId,siteId,role}}, exclusivamente para el código servidor. No debe serializarse al navegador. Rechazos: 401 sin autenticación; 400 selector, acción o cuerpo inválido; 404 empresa, sitio, pertenencia o scope ausente sin revelar existencia; 403 permiso insuficiente dentro del ámbito reconocido; 503 consulta del repositorio fallida.

El handler servidor debe fijar la acción: nunca debe confiarse en la acción procedente del cuerpo HTTP. Este módulo comprueba solo las operaciones generales read, edit, publish, members, support y billing. No es un servicio de publicación, propuesta, facturación ni administración global.

## Matriz

| Rol V45 | read | edit | publish | members | support | billing |
|---|---|---|---|---|---|---|
| CLIENT_OWNER | Sí | Sí | Sí | Sí | Sí | Sí |
| CLIENT_ADMIN | Sí | Sí | Sí | Sí | Sí | No |
| CLIENT_EDITOR (sitio asignado) | Sí | Sí | No | No | No | No |
| CLIENT_VIEWER (sitio asignado) | Sí | No | No | No | No | No |

SUPERADMIN es un rol interno distinto y no hereda permisos de una empresa. MFA y funciones especiales de propuestas de V29 requieren comprobaciones separadas.

## Comprobación local

Desde apps/mg-web-studio-cloud:

    node --test tests/auth-boundary-v60.test.cjs tests/tenant-authorization-v61.test.cjs

Se ejecutó localmente la suite V61: **24/24 pruebas correctas con Node 22.16.0**. Casos: credenciales inválidas, falsificación de identidad/rol/MFA, scopes por sitio, multiempresa, permisos owner/admin/editor/viewer, revocación por nueva consulta, suspensión, respuestas anómalas, errores de repositorio y usuarios paralelos. Las 12 pruebas originales de V60 constan en su propio documento; no constituyen evidencia de autenticación HTTP real.

## Puertas pendientes antes de integración operativa

1. Implementar un repositorio PostgreSQL con consultas parametrizadas, privilegios mínimos y pruebas de integración en entorno autorizado.
2. Implementar verificación criptográfica real, expiración/revocación de tokens y MFA; V60 solo define el contrato de entrada.
3. Añadir un adaptador HTTP seguro con detección de Authorization duplicada, límites del cuerpo, manejo de errores y validación cerrada por endpoint.
4. Validar que cada recurso concreto (página, propuesta, media) pertenezca al sitio y empresa autorizados. Revalidar permisos dentro de las transacciones e idempotencia antes de mutar: V61 **no elimina el riesgo TOCTOU**.
5. Comprobar RLS/grants y sesiones reales; auditar revocaciones, proteger al último OWNER y definir la política de SUPERADMIN.
6. Ensayar backup/restauración aislada antes de publicación; la recuperación del PC permanece pausada por 2,6 GB libres en C: según la última evidencia.

Las pruebas se realizaron con identidades y repositorios sintéticos, sin datos de clientes. Aunque STAGING contiene migraciones de etapas previas, **V61 no consultó ni modificó STAGING**. SQL nuevo, producción y publicación: **NO GO**.

## Registro de integridad

- server/tenant-authorization.cjs: blob SHA 38b67df33126aab3bff7f57e6c3b82eb6b487232.
- tests/tenant-authorization-v61.test.cjs: blob SHA 1eb06fb273070b0b5e2b49be30eb6e3fa86747c1.
