# MG WEB STUDIO CLOUD — QA SUPERADMIN V3: Incorporación e invitaciones

**Fecha:** 16 de octubre de 2026.
**Estado:** demostración temporal dentro de `apps/mg-web-studio-cloud/prototipo.html`; NO hay autenticación, backend, envío de mensajes ni conexiones a servicios.

## Flujo implementado
1. Registrar negocio ficticio desde SUPERADMIN. Se inicializa checklist de incorporación.
2. Asociar un sitio ficticio desde Sitios web.
3. Marcar pasos administrativos en la demo: revisar perfil comercial, plan/condiciones, contenido, estrategia de dominio y privacidad.
4. Preparar una invitación ficticia con correo terminado en `.invalid` y rol `CLIENT_OWNER`, `CLIENT_ADMIN`, `CLIENT_EDITOR` o `CLIENT_VIEWER`.
5. Simular aceptación o revocación. No se envía invitación real ni se genera URL/token de acceso.
6. Incorporación ficticia solamente cuando hay: checklist completo, al menos un sitio asociado y un `CLIENT_OWNER` con aceptación simulada.
7. Marcar «Incorporado (demo)» solo localmente. Si cambia el plan o se desmarca un requisito, la incorporación se devuelve a pendiente.

## Paneles
- Nuevo módulo **Incorporación**: selección de empresa, barra de avance, checklist, sitios relacionados, invitaciones del propietario y acción final simulada.
- Nuevo módulo **Invitaciones**: preparación, filtros, roles, estados Preparada/Aceptada (demo)/Revocada, acciones de simulación.
- Tabla de **Clientes** incorpora estado de incorporación y acceso directo.
- **Dashboard** muestra número de incorporaciones listas (simulación, no cuentas activas).
- **Actividad demo** registra las acciones de incorporación e invitación solo en memoria.

## Comprobaciones
**61/61 pruebas automáticas en ejecución JavaScript con DOM simulado:**
- Inicialización de clientes, correo ficticio permitido y rechazo de correos reales o dominios malformados.
- Activación bloqueada mientras faltan requisitos, sitio o propietario aceptado (demo).
- Rechazo de rol inválido, duplicación de email o de invitación de propietario activa.
- Aceptación ficticia, revocación y transiciones no permitidas.
- Creación/edición de cliente y asociación de sitio sin modificar la producción.
- Cambio de plan desde «Suscripciones» o «Clientes» obliga a revisar nuevamente las condiciones y desactiva el marcador de incorporación ficticia.
- Desmarcar paso obligatorio devuelve el estado a pendiente.
- No se crean tokens, URLs de acceso, sesiones ni llamadas a servicios externos.
- Renderización simulada de 12 módulos, incluida la bandeja de incorporación, sin excepción.

## Puntos pendientes antes de permitir datos reales
- Autenticación del SUPERADMIN con MFA y sesión verificable en servidor.
- Registro e invitación de usuarios mediante servicio de identidad seguro, tokens expiran y se usan una sola vez; verificación de correo, dominio empresarial y protección contra enumeración.
- Permisos por organización y sitio mediante roles verificados server-side, aislamiento RLS, y reglas al transferir propiedad o revocar membresías.
- Onboarding comercial con contrato, titularidad de dominio, comprobación de información y tratamiento de datos conforme normas vigentes.
- Activación real solo con servicios contratados/aprobados y sin suponer que el estado de un pago implica facturación.
- QA real en navegador, accesibilidad, concurrencia, recuperación y seguridad. Los checks simulados NO validan RLS ni seguridad.
- Los nombres Start, Crece y Pro se mantienen; tarifas y límites requieren aprobación comercial.

**Sin cargos, sin envíos, sin migraciones y sin cambios en `main`.**
