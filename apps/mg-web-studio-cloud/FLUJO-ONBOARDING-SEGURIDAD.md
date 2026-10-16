# MG WEB STUDIO CLOUD — Flujo de incorporación segura (propuesta, NO implementado)

## Principios
La organización de cliente es un tenant. El SUPERADMIN opera en una consola separada. El usuario cliente no puede seleccionar arbitrariamente tenant o rol mediante inputs del navegador para obtener acceso; el backend verifica asignaciones en una membresía segura.

## Estados deseados
**Cliente comercial:** propuesta → datos verificados → contrato/condiciones aprobadas → servicio en preparación → activo. Los estados «pausado» y «cancelado» no eliminan contenido histórico ni datos contractuales.

**Invitación:** preparada → enviada mediante proveedor aprobado → pendiente de verificación → aceptada / expirada / revocada. Los links serán de un solo uso, con TTL, firmados y nunca expuestos en logs. La invitación jamás debe generar membresía administradora antes de ser validada. No usar enlaces basados solamente en un email sin verificación.

**Aprovisionamiento:** proyecto de sitio creado en tenant → plantilla asignada → configuración mínima revisada → permisos listos → hosting/dominio/SSL verificados (en sistemas proveedores reales) → primer despliegue auditado. Debe ser idempotente, reversible y accesible únicamente para el propietario correcto.

## Roles de cliente
- `CLIENT_OWNER`: titular delegado con autorización de uso, propiedad/contrato verificables y administración de sus colaboradores.
- `CLIENT_ADMIN`: gestiona colaboradores dentro del alcance contractual y controles del tenant.
- `CLIENT_EDITOR`: administra páginas, catálogo, medios y borradores; publicar solo si el propietario lo autoriza explícitamente con permisos de backend.
- `CLIENT_VIEWER`: lectura autorizada de métricas y contenido según su membresía, nunca escritura.
- `SUPERADMIN`: acceso interno MG, mínimo privilegio, MFA obligatorio, auditoría reforzada y posibilidad de revocación administrativa. No es un rol que se pueda autoconceder el invitado.

## Datos mínimos propuestos
`organizations`, `memberships`, `sites`, `client_onboarding`, `invitations` y `audit_events`. Toda FK entre sitio, miembro e invitación debe anclarse al tenant correcto. Evitar exponer emails y tokens a usuarios no autorizados.

## Reglas importantes
- No vincular ni alterar BAZAR ONLINE, Regaladitos Club, FINZY ni otros proyectos Supabase.
- No reutilizar bases compartidas entre productos, ni exponer service role keys en frontend.
- Los pagos se concilian por un flujo independiente; el marcador de incorporación no acredita cobro.
- En la demo solo hay flags locales y direcciones `.invalid`; NO hay entrega de emails, cuentas, contraseñas ni invitaciones verdaderas.
- Cualquier integración con Supabase o terceros requiere aprobación previa del usuario y verificación de costos.

Este documento es un diseño para revisión, no una implementación técnica de autenticación ni despliegue.
