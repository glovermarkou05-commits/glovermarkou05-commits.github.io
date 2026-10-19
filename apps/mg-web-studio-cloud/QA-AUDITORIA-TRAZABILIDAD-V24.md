# MG WEB STUDIO CLOUD — V24 | Auditoría y trazabilidad (simulación)

**Fecha:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado de despliegue:** **NO GO**. No hay auditoría ni autorización real en producción.

## Revisión previa / trabajo no duplicado

V13 ya proponía la tabla privada `mg_private.mg_audit_events` en `db/schema_core.review.sql`, con `actor_id`, `organization_id`, `action`, `details` y `happened_at` y revocación de acceso directo de roles públicos. V23 ya tenía un evaluador de permisos, scopes por sitio, revocaciones y MFA ficticio. V24 **no reescribe ni ejecuta** esos SQL ni reemplaza V23.

## Entregables GitHub

- `shared/mg-audit-trail-v24.js`: un registro **solo en memoria** que incorpora secuencia, referencia al checksum previo, evento, hora ficticia, acción, empresa, sitio, objeto, resultado y código de decisión.
- `tests/audit-trail-v24.test.cjs`: suite con 70 comprobaciones de integridad básica, privacidad, consultas y autorizaciones ficticias.
- `QA-AUDITORIA-TRAZABILIDAD-V24.md`: este informe.

## Operaciones de ejemplo

Se registran intentos admitidos y rechazados de lectura, aprobación/rechazo/aplicación de propuestas, revocación de miembros y scopes y acceso administrativo. **La función de registrar no realiza ninguna de esas operaciones reales.** La autorización se calcula con el módulo ficticio V23 mediante una sesión de pruebas suministrada por el llamador, que no es una identidad fiable en un navegador.

Un intento denegado queda con `actorId=null` para evitar atribuciones no verificadas; en producción la correlación de intentos requerirá una fuente de identidad autenticada y una política de privacidad. No se copian de la petición los campos arbitrarios como claves, tokens, cuerpos de mensajes, correos o contraseñas.

## QA efectivamente realizado

**70/70 comprobaciones simuladas aprobadas**, evaluando el archivo de pruebas **recuperado después de guardar en GitHub**, junto con módulos V23 y V24. Las pruebas se ejecutaron en un arnés JavaScript con sustitutos de `fs`, `path` y aserciones Node. **No** se ejecutó PostgreSQL, Supabase, navegador real, servidor HTTP ni proceso local del usuario.

Cobertura:
1. Secuencia incremental y checksum enlazado; consulta ordenada por los eventos más recientes.
2. Detección de cambios accidentales del historial, eventos borrados o reordenados, IDs repetidos y campos inesperados.
3. Rechazo de duplicados, tiempos retrocedidos, tipos de evento desconocidos, contextos incompletos y motores de permisos inválidos.
4. Intentos denegados registrados sin convertirlos en permisos concedidos.
5. Consulta de auditoría de empresa/sitio limitada a OWNER/ADMIN en V23; EDITOR/VIEWER y propietarios de otra empresa quedan fuera.
6. Consultas administrativas separadas mediante SUPERADMIN de ejemplo con MFA ficticio; no concede automáticamente acceso al historial específico de una empresa.
7. Revocación de membresías y vencimiento de sesión reflejados en consultas posteriores.
8. No persistencia ni mutación de los datos de entrada; no se realizan operaciones de red.

## Advertencia sobre integridad

Se usa **FNV-1a de 32 bits**, una suma de comprobación **NO criptográfica**: puede detectar errores accidentales, **no impide falsificación, colisiones, reescritura completa del historial ni eliminación del registro completo**. No es una firma digital, WORM, auditoría legal, evidencia de consentimiento ni protección contra un administrador malicioso. Un registro de eventos de producción necesita escritura transaccional desde servidor, controles de acceso, claves gestionadas fuera del cliente, hash fuerte encadenado y/o almacenamiento inmutable externo, tiempo confiable, retención y comprobaciones independientes.

## Pendientes críticos V25+

- Implementar con autorización específica de proyecto segregado la escritura de eventos en una transacción ACID junto a cambios de membresías/propuestas; si falla el evento, debe fallar la operación de negocio.
- Revisar RLS/GRANT, `SECURITY DEFINER`, actor confiable, trazabilidad de acciones elevadas, revocación de sesiones y retención/supresión de datos.
- Pruebas reales de alteración, eventos perdidos, duplicados, concurrencia, restauración y correlación de eventos sin exponer datos privados.
- Resolver Home, estados heredados SQL/API y otros bloqueos V19–V23 antes de evaluar staging.
- Conservar manifiesto NO GO V18; no inferir autorización de un archivo o resultado simulado.

## Comando local opcional

`node apps/mg-web-studio-cloud/tests/audit-trail-v24.test.cjs`

**Restricciones conservadas:** sin Lovable, sin SQL ejecutado, sin cambios en Supabase, sin IA de pago, sin publicación, sin modificar `main` ni otros proyectos.
