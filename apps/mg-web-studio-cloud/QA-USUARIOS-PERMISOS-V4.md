# MG WEB STUDIO CLOUD — QA Usuarios y permisos V4

**Fecha:** 16 de octubre de 2026. **Ámbito:** HTML de demostración SUPERADMIN, en memoria, sin autenticación ni backend.

## Implementado
- Módulo «Usuarios y permisos» con membresías ficticias separadas por negocio.
- Matriz referencial de CLIENT_OWNER / CLIENT_ADMIN / CLIENT_EDITOR / CLIENT_VIEWER con seis tipos de acción: lectura, edición, publicación, colaboradores, soporte y suscripciones.
- Invitaciones ficticias: solo correos .invalid, roles permitidos y selección de sitio obligatoria para EDITOR/VIEWER.
- OWNER/ADMIN abarcan todos los sitios de un mismo negocio; EDITOR/VIEWER abarcan **un sitio específicamente asignado** en esta demo.
- Aceptar una invitación crea una membresía en memoria (no una cuenta). Se puede cambiar rol/alcance del miembro no propietario y revocar su estado.
- Se rechaza la asignación a sitios de otro negocio y se impide la transferencia del rol OWNER mediante la interfaz de permisos.
- Se protege al único propietario ficticio activo de la revocación.
- Una revocación niega los permisos simulados; tras revocar, la misma dirección ficticia puede ser invitada de nuevo sin reactivar automáticamente su membresía antigua.
- El checklist de incorporación solo reconoce propietarios con membresía activa de demostración.
- Comprobador visual de acceso por colaborador + sitio + acción, con aviso inequívoco de que no es seguridad real.
- Auditoría de prueba en memoria por cambios de miembros y permisos, sin persistencia.

## Pruebas ejecutadas
**61/61 comprobaciones correctas** sobre código JavaScript en V8 con DOM simulado:
- Propietario: publicación permitida en su sitio, prohibida en un sitio de otro negocio, no revocable cuando es el único propietario.
- Editor: lectura/edición del sitio asignado, sin publicar ni gestionar usuarios/pagos; no accede a otras organizaciones.
- No aceptar acceso a sitio de otro negocio, ni múltiples sitios para EDITOR/VIEWER en la demo.
- Cambios EDITOR→VIEWER→ADMIN con sus capacidades esperadas; OWNER no asignable por edición normal.
- Revocar membresía elimina inmediatamente capacidades en la simulación; miembro revocado no editable.
- Reinvitación posterior: requiere nueva aceptación para crear una nueva membresía, permaneciendo revocada la antigua.
- Una misma dirección ficticia puede pertenecer a dos empresas solo con membresías separadas y alcances individuales.
- Un OWNER con alcance de empresa ve automáticamente los sitios nuevos; un VIEWER no adquiere acceso implícito.
- Comprobador disponible en pantalla; renderizado de los 13 módulos SUPERADMIN sin excepciones.
- Sin `fetch`, XMLHttpRequest, credenciales, correo real, API ni red.

## Limitaciones críticas
Los permisos únicamente filtran datos de ejemplo en el navegador: **NO existe autenticación, MFA, políticas RLS, tokens, sesiones, API, ni protección de datos real**. No entrar datos personales auténticos, contraseñas ni direcciones de correo verdaderas. Manipular JavaScript del navegador invalida completamente los controles simulados. La aceptación de una invitación es un botón de prueba, no prueba de titularidad de correo.

No se realizaron pruebas en navegador real ni se verificó accesibilidad/responsive; las verificaciones anteriores son exclusivamente del código con elementos DOM simulados.

## Antes de producción
- Identidad e invitaciones con tokens únicos, expiración, aceptación comprobada y MFA administrativo.
- Modelo de organización y sitio con claves foráneas de ámbito y restricciones transaccionales.
- Validación de permisos en servidor y RLS con pruebas usando sesiones reales de organizaciones diferentes.
- Modelo de sitios asignados y resolución del sitio por servidor; no confiar en IDs enviados desde frontend.
- Protección contra escalar privilegios, protección del último propietario, auditoría persistente y revocación de sesiones.
- Reglas del plan, privacidad y políticas de retención aprobadas, sin modificar otras instancias Supabase.

**Se trabajó en la rama V5 y NO en main. Sin créditos Lovable y sin gastos de infraestructura.**
