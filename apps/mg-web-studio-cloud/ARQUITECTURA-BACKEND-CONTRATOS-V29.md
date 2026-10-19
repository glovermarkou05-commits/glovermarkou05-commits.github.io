# MG WEB STUDIO CLOUD — V29 | Arquitectura propuesta de persistencia y seguridad

**Fecha:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** DOCUMENTO DE REVISIÓN — **NO GO**. No representa código servidor, SQL desplegable, autenticación real ni autorización de gasto.

## Alcance

Se revisaron las rutas virtuales V14, los contratos canónicos V20, el flujo en memoria V27 y la matriz de 30 casos V28. Ya existían siete transiciones de propuesta y una simulación de idempotencia. V29 no recrea esas funciones ni toca el esquema SQL: propone la **frontera entre cliente y servidor**, los parámetros y salidas seguros, la secuencia de transacción futura, los códigos de error y la separación de auditoría.

Inventario de diseño: `staging/v29-backend-contract.review.json` y comprobador estático `shared/mg-backend-contract-v29.js`. Ninguno expone endpoints HTTP ni puede ejecutar SQL.

## Modelo de confianza y orden de evaluación

```text
NAVEGADOR (NO CONFIABLE)
  Solicitud: acción, ruta, expectedRevision, expectedDraftVersion,
  Idempotency-Key, nota validable, contenido permitido
                      |
                      v
SERVIDOR FUTURO (NO IMPLEMENTADO)
  1. Verificar credenciales y sesión criptográficamente
  2. Derivar actor/roles/MFA desde autoridad de servidor
  3. Resolver pertenencia real y recurso dentro de la empresa
  4. Validar scope por sitio, acción, estado y versiones esperadas
  5. Revalidar idempotencia dentro de transacción
  6. Ejecutar operación, auditoría privada y outbox juntos
                      |
                      v
POSTGRESQL FUTURO (NO CREADO / NO PROBADO)
  RLS y GRANT por rol real; CAS, locks, UNIQUE y constraints
  Una confirmación o rollback de todas las escrituras
                      |
                      v
DESPACHADOR DE OUTBOX (NO IMPLEMENTADO)
  Reintentos y deduplicación después del COMMIT, sin datos secretos
```

El cliente **no** suministra actorId, rol, pertenencia, scope, MFA, eventId de auditoría ni identidad de la organización confiable: la organización en la ruta solo es un selector que debe cotejarse con la sesión autenticada. No reutilizar los objetos `trustedSession` ficticios V23–V28 en una aplicación real.

## Rutas de propuestas propuestas

Las siete operaciones de V20 usan las rutas virtuales V14:

| Acción | Método y ruta relativa | Requisito futuro |
|---|---|---|
| create | POST `/organizations/:org/sites/:site/proposals` | SUPERADMIN con MFA real; revisión inicial 0 |
| submit | POST `.../proposals/:id/submit` | SUPERADMIN con MFA real; revisión esperada |
| changes | POST `.../proposals/:id/review` | OWNER, ADMIN o EDITOR asignado; nota válida |
| revise | POST `.../proposals/:id/revise` | SUPERADMIN con MFA real y nueva revisión |
| approve | POST `.../proposals/:id/review` | OWNER o ADMIN |
| reject | POST `.../proposals/:id/review` | OWNER o ADMIN; motivo validado |
| apply | POST `.../proposals/:id/apply` | OWNER, ADMIN o EDITOR asignado; CAS del borrador |

**Prefijo:** `/api/v1`. El endpoint `/review` requiere un campo de decisión validado por el servidor para distinguir `approve`, `changes` y `reject`; nunca debe confiarse en un rol enviado por el cliente. No existen estas rutas activas por V29.

## Unidad de persistencia futura

Una sola transacción PostgreSQL deberá confirmar o revertir conjuntamente:
- Cambio de estado de propuesta y revisión vinculada, con control compare-and-swap (CAS).
- Versión del borrador y sus páginas únicamente al aplicar una propuesta aprobada. **Aplicar no significa publicar.**
- Registro privado de operación idempotente, con respuesta compatible para reintentos.
- Auditoría **de negocio validada** después de resolver un recurso perteneciente a una empresa.
- Evento outbox durable con identificadores internos y payload mínimo; el despacho sucede después del COMMIT.

Antes de iniciar modificaciones: validar identidad y MFA, organización/sitio existente y autorizado, permiso activo, estado actual, versión esperada, clave idempotente y contenido admitido. El detalle exacto de nivel de aislamiento, retry/backoff, locks, retención y tiempos de expiración sigue **pendiente** hasta pruebas concurrentes reales.

## Idempotencia — prevención de colisiones y replay

- Índice único conceptual: `(organization_id, authenticated_actor_id, idempotency_key)`.
- Huella conceptual: método, ruta normalizada, empresa, sitio, propuesta, acción, revisión esperada, versión de borrador y contenido funcional canonizado (sin secretos).
- Cada repetición debe **revalidar credenciales, scopes, permisos y estado de la sesión** antes de devolver una respuesta histórica.
- Misma clave y mismo payload: respuesta histórica o recuperación determinística. Misma clave y diferente payload: `IDEMPOTENCY_CONFLICT` HTTP 409.
- Una nueva sesión válida del **mismo actor** no debería invalidar automáticamente una operación anterior. Una sesión revocada no obtiene replay.
- Evitar guardar tokens, cookies, claves privadas, contraseñas o cabeceras Authorization en huellas, logs y recibos.
- La idempotencia en memoria V28 solo sirve como ensayo; no protege reinicios, multiproceso ni carreras reales.

## Auditoría: distinguir dos niveles

**Auditoría de negocio (por empresa).** Únicamente tras comprobar en servidor la propiedad real del objeto/tenant; registra actor validado, empresa, sitio, revisión, acción y resultado. Escribe de manera atómica junto a propuestas/outbox en transacciones exitosas.

**Auditoría de seguridad (privada y restringida).** Intentos sin sesión válida, recursos ajenos, credenciales incorrectas o intentos de falsificar ámbito se registran en un sistema aislado y de acceso operativo restringido. No debe asociarse un intento con un tenant solo porque el atacante escribió ese `organizationId` o `siteId` en una URL; de otro modo podría contaminar o enumerar la auditoría ajena. Correlación mediante `requestId` generado por el servidor y actor únicamente cuando esté verificado.

Ambos registros deben aplicar política de retención, acceso mínimo, redacción de secretos y controles fuertes de integridad. FNV-1a V24 **no garantiza autenticidad criptográfica**. Si la auditoría de seguridad falla, el backend debe definir respuesta, alertas y continuidad según nivel de riesgo, sin confundirla con el COMMIT de negocio. Este criterio necesita diseño y pruebas reales.

## Manejo de errores sin divulgación

La matriz V29 propone **12 códigos** y errores públicos genéricos:
- 401 `UNAUTHENTICATED`: falta sesión válida.
- 404 `RESOURCE_UNAVAILABLE`: recurso inexistente o fuera del ámbito permitido, sin confirmar qué caso.
- 403 `FORBIDDEN`: autenticado con acceso reconocido pero rol insuficiente (tras resolver ámbito).
- 400 `INVALID_REQUEST`, 405 `METHOD_NOT_ALLOWED`, 409 por estado, CAS o idempotencia.
- 429 `RATE_LIMITED`, 503 `RETRY_LATER`, 500 `INTERNAL_ERROR`.

Nunca devolver SQL interno, stack traces, cuerpos de auditoría, emails privados ni tokens. El servidor genera `requestId` para correlacionar de forma segura. Evitar revelar ID existentes en otros tenants por diferencias entre 403 y 404; medir además tiempos y códigos de respuesta para impedir enumeración.

## Compatibilidad, RLS y migración pendientes

- SQL V13 usa `submitted_for_review` / `applied_to_draft` mientras V20 define `submitted` / `applied`. Hace falta una conversión coordinada, reversible y probada.
- La Home canónica es `slug='home'` y ruta pública `/`, pero `unique(site_id,slug)` no garantiza por sí solo exactamente una Home.
- Verificar RLS, grants de columna y tabla, `SECURITY DEFINER` (owner, search_path, EXECUTE), roles y políticas legadas con PostgreSQL real en entorno segregado.
- Controles de autenticación reales, cookies/CSRF, invalidación de sesión, cuentas de prueba, MFA, límites por cliente, monitorización y privacidad siguen sin evidencia real.
- Los 30 casos V28 permanecen `NOT_EXECUTED`. V18 conserva 16 controles pendientes, sin autorización de staging. IA y cobros seguirán sujetos a aprobaciones separadas.

## Condición de continuidad

El siguiente paso permitido sin gastos es seguir refinando diagramas, contrato de datos, mensajes y casos de pruebas estáticos. **Ningún diseño permite crear un proyecto Supabase, ejecutar SQL, publicar una web, activar IA paga o acceder a datos reales.** Para infraestructura y pruebas efectivas se necesita autorización explícita de proveedor, región, plan, presupuesto, responsable y entorno aislado.
