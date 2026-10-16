# MG WEB STUDIO CLOUD — Contrato de permisos multiorganización (diseño para revisión)

**Estado:** propuesta. No implementada en base de datos, servicio API ni producción.

## Entidades de seguridad
- `organizations`: tenant que posee sitios y miembros.
- `sites`: `organization_id` de la empresa titular; cada sitio pertenece a exactamente una organización.
- `memberships`: `user_id`, `organization_id`, rol, estado, fechas y auditoría. Un usuario puede pertenecer a varias organizaciones con roles distintos, jamás se mezclan permisos.
- `membership_site_scopes`: relación entre membresías de EDITOR/VIEWER y sitios del mismo tenant. Validar FK compuesta (`organization_id`, `site_id`) y pertenencia de membresía al tenant.
- `invitations`: tenant, correo, rol máximo solicitado, ámbito permitido, expiración, estado, token de un uso almacenado solo como hash, autor y trazabilidad.
- `audit_events`: actor, tenant, sitio, objeto, decisión, fecha, IP/metadata mínima según política de privacidad.

## Matriz de referencia

| Acción | OWNER | ADMIN | EDITOR | VIEWER |
|---|---|---|---|---|
| Leer contenido | Sí | Sí | Sí, sitio asignado | Sí, sitio asignado |
| Editar borradores, productos, medios | Sí | Sí | Sí, sitio asignado | No |
| Publicar contenido | Sí | Sí | No | No |
| Administrar colaboradores | Sí | Sí | No | No |
| Consultar soporte interno | Sí | Sí | No | No |
| Gestionar suscripción | Sí | No | No | No |

Este modelo es un criterio inicial de producto; permisos y contratos deberán aprobarse antes de lanzar.

## Autorización por operación (servidor)
1. Verificar sesión y credenciales del usuario.
2. Resolver el tenant y sitio desde registros confiables; no tomar el `organization_id` proporcionado por el navegador como prueba.
3. Validar membresía `active`, rol apropiado y ámbito de sitio; para páginas, productos, archivos, publicaciones y tickets comprobar misma pertenencia de tenant/sitio.
4. Aplicar RLS en todas las tablas expuestas con políticas `USING`/`WITH CHECK` para impedir lecturas, inserciones, actualizaciones o borrados entre organizaciones.
5. Registrar cambios de rol/alcance, publicaciones, eliminación y revocación con auditoría persistente.
6. Al revocar acceso: invalidar sesiones/suscripciones de Realtime, tokens y accesos por caché; comprobar sobrecargas con concurrencia.
7. Nunca permitir que EDITOR/VIEWER se autoasignen ADMIN/OWNER. Proteger el último propietario, exigir verificación reforzada para transferir titularidad.
8. Las APIs públicas de contacto deben ser independientes de los endpoints administrativos y de la Data API de registros internos.

## Pruebas futuras exigidas
- Usuario sin sesión: ningún acceso a datos privados.
- USER de empresa A contra recursos B, con IDs adivinados: todas las operaciones denegadas.
- Misma cuenta con rol en A y B: cambio de contexto sin privilegios heredados.
- EDITOR de A sitio 1 a sitio 2 sin asignación: denegado.
- EDITOR intentando publicar o cambiar rol: denegado.
- OWNER/ADMIN intentando roles SUPERADMIN: denegado.
- Membresía revocada y sesión todavía vigente: denegado en siguiente petición.
- Transferencia y protección del último OWNER: reglas de auditoría y aprobación probadas.
- Servicios con key elevada: nunca exponerla al navegador; restringir endpoints y monitorizar.

**No aplicar este documento en un proyecto existente. Crear proyecto MG WEB STUDIO CLOUD exclusivo solo tras la autorización de costos, región y condiciones de operación.**
