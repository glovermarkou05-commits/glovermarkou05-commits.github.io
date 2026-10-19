# MG WEB STUDIO CLOUD — QA V27 | Ciclo de propuestas y auditoría de intentos rechazados

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Dictamen:** **PASS en memoria; NO GO para SQL, staging, servidores, gastos y producción.**

## Objetivo y revisión previa

Se verificaron los contratos V20, el evaluador ficticio de permisos V23, la cadena de auditoría V24, la integración V25 y el diagnóstico técnico V26. V25 ya incluía **approve/reject/apply**; su instancia tiene estado privado y no ofrece un mecanismo para registrar propuestas nuevas desde fuera. V27 **reutiliza V20, V23 y V24** y añade un coordinador independiente para las siete acciones, manteniendo el de V25 y sus pruebas sin reemplazarlo.

**Entregables:**
- `shared/mg-audit-trail-v24.js` (ampliación compatible): agrega los eventos `proposal_created`, `proposal_submitted`, `proposal_changes` y `proposal_revised`, así como `recordSimulatedDecision`, que agrega decisiones permitidas/denegadas **exclusivamente en fixtures**. La interfaz V24 previa se conserva.
- `shared/mg-proposal-flow-v27.js`: simulador separado que coordina V20 + V23 + V24 en una copia de memoria.
- `tests/proposal-flow-v27.test.cjs`: casos positivos, negativos y regresiones funcionales.
- `QA-FLUJO-PROPUESTAS-V27.md`: informe actual.

## Flujo ensayado

| Acción V20 | Transición esperada | Actor permitido en simulación |
|---|---|---|
| `create` | Sin propuesta → `draft` (revisión 1) | SUPERADMIN con MFA ficticio |
| `submit` | `draft` → `submitted` | SUPERADMIN con MFA ficticio |
| `changes` | `submitted` → `needs_changes` | OWNER / ADMIN / EDITOR asignado |
| `revise` | `needs_changes` o `rejected` → `draft` (revisión +1) | SUPERADMIN con MFA ficticio |
| `approve` | `submitted` → `approved` | OWNER / ADMIN |
| `reject` | `submitted` → `rejected` | OWNER / ADMIN, observación válida |
| `apply` | `approved` → `applied` (versión borrador +1) | OWNER / ADMIN / EDITOR asignado |

`apply` valida una única Home por sitio y convierte el slug legado `""` a `home` **solo en memoria**. Ninguna acción publica el sitio. Los datos históricos SQL V13 no fueron migrados y mantienen etiquetas `submitted_for_review` y `applied_to_draft`. La lectura de esos estados antiguos usa el normalizador V20.

## Auditoría y operaciones rechazadas

- Cada acción aceptada en el simulador agrega un evento permitido a la cadena V24 y cambia el estado de la propuesta en una única sustitución de **snapshot de memoria**. No hay transacción SQL/ACID.
- Cuando una acción falla por autorización, estado, revisión esperada, observación, alcance o idempotencia y tiene contexto bien formado, **el negocio no cambia**, pero se agrega un evento de rechazo a la cadena ficticia.
- Las acciones de solicitud inválida sin identificadores suficientes se rechazan **antes** de intentar registrar evento, y una repetición con el mismo `eventId` puede fallar como `AUDIT_FAILED`. No afirmar que se registra absolutamente todo intento.
- El evento rechazado contiene `actorId=null`, acción, empresa, sitio, objeto y código de resultado, sin texto de propuesta, claves, contraseñas, correos ni cuerpo libre.
- Para un reintento bloqueado tras una revocación, se usa un **nuevo identificador de evento** y la prueba comprueba el registro de rechazo. Las repeticiones exitosas de una operación con clave idéntica devuelven el resultado anterior solo después de volver a comprobar permisos.
- Las identidades, sesiones y controles de permisos son totalmente manipulables en el test. `recordSimulatedDecision` admite una decisión suministrada por código de simulación: **nunca debe exponerse en una API o navegador real**. FNV-1a de 32 bits sigue siendo un checksum NO criptográfico.
- No se capturan bloqueos de red, fallos de autenticación del servidor, ataques reales ni almacenamiento duradero. La idempotencia es un `Map` de una sola instancia.

## QA efectivamente ejecutado

Se recuperaron desde GitHub los archivos de la rama y se evaluaron con JavaScript aislado y sustitutos de `fs`, `path`, `assert`. Se corrigió y volvió a comprobar el caso de reintento tras revocación con un identificador de evento nuevo.

| Suite revisada | Comprobaciones correctas |
|---|---:|
| V20 contratos canónicos | 114/114 |
| V21 compatibilidad SQL ↔ API | 25/25 |
| V22 migraciones simuladas | 20/20 |
| V23 permisos multiempresa | 81/81 |
| V24 auditoría (regresión tras ampliación) | 70/70 |
| V25 integración anterior (regresión) | 91/91 |
| V26 preparación técnica | 91/91 |
| V26 CLI de solo lectura | 11/11 |
| **V27 flujo completo nuevo** | **213/213** |
| **Total V20–V27 ejecutado en esta sesión** | **716/716** |

Las 716 comprobaciones son **exclusivamente estáticas o simuladas**; no equivalen a pruebas HTTP, navegador real, SQL, Supabase, MFA, RLS, permisos efectivos, restauración o producción. No se reejecutó la totalidad histórica V9–V19.

## Riesgos y bloqueos sin resolver

1. Incompatibilidad de Home y de etiquetas de estado entre SQL V13 y capa simulada, aun con alias de lectura.
2. Pendiente verificar `SECURITY DEFINER`, políticas heredadas, grants y aislamiento con PostgreSQL real.
3. Pendiente backend con autenticación y MFA verificables, sin aceptar sesión/rol/identidad de un navegador.
4. Pendiente persistencia y transacciones ACID (estado + revisión + outbox + auditoría), concurrencia, auditoría criptográficamente verificable, duplicados y recuperación real.
5. Pendiente completar experiencia UI/servicio real: edición de contenido de propuestas, notificaciones, publicación separada, pruebas de múltiples dispositivos.
6. V26 mantiene NO GO y 16 requisitos de manifiesto V18 pendientes; completar simuladores **no** habilita infraestructura, uso de Lovable, cobros o IA de pago.

## Pruebas locales opcionales sin conexiones

```powershell
node apps/mg-web-studio-cloud/tests/proposal-flow-v27.test.cjs
node apps/mg-web-studio-cloud/tests/audit-trail-v24.test.cjs
node apps/mg-web-studio-cloud/tests/e2e-workflow-v25.test.cjs
```

**Restricciones respetadas:** `main` intacta; no se ejecutó SQL ni se tocó Supabase; sin publicación, Lovable, IA pagada, planes con costo, ni cambios en FINZY, BAZAR ONLINE o demás proyectos.

**Próxima etapa propuesta — V28:** pruebas de casos límite en el flujo de propuestas y una matriz de backend/RLS documental de implementación futura, con gate NO GO y sin activar infraestructura. Antes de afirmar preparación de staging se requerirán aprobación expresa y pruebas reales.
