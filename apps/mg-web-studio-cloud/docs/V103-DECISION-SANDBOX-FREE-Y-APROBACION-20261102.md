# MG Web Studio Cloud · V103 | Decisión operativa del sandbox Auth QA

**Fecha:** 2026-11-02 (Ecuador). **Estado:** PROPUESTA A APROBAR; SIN CREAR PROYECTO.  
**Objetivo:** sustituir las simulaciones V97–V102 por pruebas aisladas de Supabase Auth, sin interferir con productos reales ni registrar pagos inesperados.

## 1. Inventario comprobado en Supabase (lectura de API, sin cambios)

- **Organización disponible:** `glovermarkou05-commits`; plan reportado por Supabase: **`free` / `tier_free`**.
- **Proyectos accesibles:** 7, de los cuales **1 `ACTIVE_HEALTHY`**, 6 `INACTIVE`. No se identifica un sandbox nuevo y exclusivo de MG Web Studio Cloud.
- **Proyecto MG WEB STUDIO CLOUD - STAGING:** `INACTIVE`; no reactivar ni reutilizar. Otros proyectos pertenecen a Regaladitos Club, BAZAR-ONLINE, Ventry, Clínica y otros fines.
- **Datos consultados:** únicamente inventario y detalle del plan; **no se leyeron tablas, usuarios, secretos, JWT, logs ni base de datos**.
- **Precaución:** el inventario es instantáneo; puede cambiar. No conservar project refs, hosts, credenciales ni identificadores de otros productos en documentación pública.

## 2. Precio y capacidad: hallazgo orientativo, no cotización

La documentación oficial de Supabase vigente indica **2 proyectos activos gratuitos** en Free; los **pausados no cuentan** al límite. Se observó **solo 1 proyecto activo**. Por tanto, *podría* haber una plaza gratuita. El plan de la organización es `free`, pero **ningún costo exacto ha sido cotizado o confirmado por el sistema de creación**.

- Fuente de precio: https://supabase.com/docs/guides/platform/billing-on-supabase
- Fuente de límites: https://supabase.com/docs/guides/platform/billing-faq
- Fuente de precios: https://supabase.com/pricing
- Proyectos Free pueden pausarse tras ~7 días de baja actividad: https://supabase.com/docs/guides/platform/free-project-pausing

**Regla operativa:** antes de crear, el propietario debe confirmar la **organización destino** y el alcance. Consultar después la **cotización exacta para esa organización**. Si la cotización no es US$0, **detenerse y solicitar aceptación expresa del cargo y periodicidad**. Nunca activar Pro, add-ons, branching pagado ni compute de pago automáticamente.

## 3. Propuesta concreta de sandbox

| Campo | Propuesta | Estado |
| --- | --- | --- |
| Nombre | `MG WEB STUDIO AUTH QA` | **PROPOSED** |
| Organización | `glovermarkou05-commits` | **PENDING OWNER SELECTION** |
| Región | `sa-east-1` (correspondencia aproximada con los proyectos MG anteriores) | **PENDING APPROVAL** |
| Plan | Free, solo si el cargo confirmado es **US$0** | **QUOTE NOT REQUESTED** |
| Destino | Solo autenticación, sesión/MFA de pruebas V97–V102 | **NOT CREATED** |
| Usuarios | Identidades 100% ficticias; sin correo/WhatsApp productivo | **NOT CREATED** |
| Datos | Ningún cliente, pedido, factura, banco, teléfono o cuenta existente | **NONE** |
| Integraciones | Cero vínculos con web pública, FINZY, MG CLUB+, Ventry, BAZAR-ONLINE | **NONE** |
| Permisos | Credenciales de servicio solo en backend/secret manager, nunca repositorio ni navegador | **NOT CONFIGURED** |
| Seguridad | No añadir grants públicos, RLS improvisado ni `SECURITY DEFINER` | **REQUIRED** |
| MFA | Primero validar compatibilidad/SDK y procedencia del evento por sesión; luego challenge/verify con cuentas ficticias en etapa autorizada | **BLOCKED** |
| Destrucción | Registrar recursos, revocar sesiones y eliminar el sandbox al terminar si el propietario lo aprueba | **PLAN REQUIRED** |

## 4. Etapas de ejecución para evitar repeticiones y costos

**G103-A — Decisión de cuenta/costo:** confirmar organización, región y nombre. Consultar costo con el conector; si no es US$0, recabar autorización. No reactivar STAGING.

**G103-B — Creación mínima:** crear un proyecto nuevo solo tras confirmar G103-A; verificar que quedó `ACTIVE_HEALTHY`. Aun si llega a crearse, **esto no autoriza usuarios MFA, SQL, cambios a otras apps ni despliegue**.

**G103-C — Lectura inicial autorizada:** inspeccionar sin revelar secretos versión/capacidades disponibles de Supabase Auth y los roles/grants necesarios. Redactar consultas/llamadas mínimas antes de usarlas, con revisión de seguridad. No acceder a datos de otros proyectos.

**G103-D — Prueba MFA separada:** sólo después de aprobación de cuentas ficticias, enrolar TOTP para un usuario de laboratorio, registrar desafío, verificarlo, comprobar identidad+session_id del JWT renovado, revocación y proceso de un solo uso. No inventar vínculo entre `mfa_challenges` y `auth.sessions` a partir de fechas.

**G103-E — Aceptación formal:** un revisor técnico independiente revisa evidencia y riesgos de `AUTH-01/02/03` y `DATA-01/02` según V67; cualquier PASS requiere firma real. Revisar costos, limpieza y control distribuido de replay.

## 5. Lo que se puede reutilizar inmediatamente

- **V94B:** restauración PostgreSQL 17 sintética, **56/56 pgTAP**.
- **V95:** matriz firmemente separada de los 32 controles V67, todos aún PENDING.
- **V96:** telemetría efímera, sin activación de alertas.
- **V97–V102:** contratos de JWT, sesión, factor, AMR y vínculo de challenge, incluyendo **100/100 tests** del run https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41471990965.
- **Issue #8:** solicitud centralizada de revisión independiente; **sin revisor**.
- **PR #7:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7 — **draft, no merge**.

No repetir V94B ni pruebas offline aprobadas por defecto. Reutilizar esas evidencias para ahorrar trabajo.

## 6. Decisión actual y prohibiciones

**V103 — INVENTARIO Y PLAN Free CONFIRMADOS.**  
**COSTO DE UN PROYECTO NUEVO: TODAVÍA SIN COTIZAR.**  
**ORGANIZACIÓN DESTINO: PENDIENTE DE CONFIRMACIÓN EXPLÍCITA.**  
**SANDBOX: NO CREADO, SIN NUEVAS CLAVES, USUARIOS NI SESIONES.**  
**REVISOR HUMANO: NO ASIGNADO.**  
**V67: 32 PENDING / 0 PASS.**  
**G7/PRODUCCIÓN: NO_GO; STAGING no intervenido, PR sin fusión.**
