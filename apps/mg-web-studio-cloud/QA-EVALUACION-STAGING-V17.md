# MG WEB STUDIO CLOUD — V17 | Evaluación previa a staging y despliegue

**Fecha de revisión:** 19 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Decisión actual:** **NO GO** para crear recursos, activar gastos, ejecutar migraciones o publicar.  
**Tipo de evidencia disponible:** prototipos locales, documentos de diseño y QA simulado. **No existen pruebas reales de backend/staging para esta etapa.**

## Resultado ejecutivo

Se creó una evaluación interactiva de **32 controles** divididos en dos puertas:
- **Staging:** aprobaciones, gobierno, presupuesto, proyecto aislado, secretos, migraciones, RLS, Auth/MFA, ensayos de rollback y copia de seguridad, datos ficticios y costos.
- **Producción:** pruebas reales entre empresas y dispositivos, transacciones PostgreSQL y outbox, pruebas de restauración, privacidad, auditoría, dominios/TLS, publicación humana e IA/cobros aprobados **por separado**.

Los requisitos se pueden marcar como «Pendiente», «Plan documentado» o «Comprobado (solo simulación)». La última opción es HIPOTÉTICA; **ni siquiera la lista completa autoriza a desplegar**. Nunca se carga información al servidor y todos los cambios de la pantalla desaparecen al recargar.

**Situación inicial al 19/10/2026:**
- Proyecto Supabase exclusivo MG WEB STUDIO CLOUD: **no autorizado, no creado ni comprobado**.
- Presupuesto, región, plan y responsable de pagos: **pendientes de decisión**.
- Validación real de sesiones/MFA/RLS en PostgreSQL: **pendiente**; V13 es solo SQL de revisión.
- Backups reales cifrados, RPO/RTO y ensayo de recuperación: **pendientes**; V15 es solo memoria de JavaScript.
- Paneles SUPERADMIN y emprendedor sincronizados entre dispositivos: **pendiente**; V16 probó dos fachadas contra un motor JS compartido en un mismo proceso.
- IA real, pasarela de cobros, dominio público y publicación: **desactivados**, sujetos a aprobación aparte.

## Entregables V17

1. \`shared/mg-staging-readiness-v17.js\` — catálogo de 32 controles y evaluación de puertas hipotéticas, sin acciones remotas.
2. \`evaluacion-staging-v17.html\` — panel con filtros por etapa/categoría, registros de prueba, bloqueos, estimación mínima de costos y copia local de reporte NO GO.
3. \`tests/staging-readiness-v17.test.cjs\` — 90 comprobaciones del motor y condiciones de bloqueo.
4. \`tests/staging-readiness-v17-ui.test.cjs\` — 42 comprobaciones de interfaz con DOM simulado.
5. Enlaces al panel V17 desde \`prototipo.html\`, \`portal-cliente.html\` y \`preparacion-backend-v16.html\`.

No se almacenan textos de evidencia en GitHub ni en almacenamiento del navegador. El módulo no llama a \`fetch()\`, no envía datos a servicios externos ni solicita claves.

## Estimación orientativa de costos de Supabase

Referencia: [Supabase, precios oficiales](https://supabase.com/pricing), consultados durante V17 (19/10/2026).

| Escenario de prueba | Importe base mínimo orientativo | Condiciones y riesgos |
|---|---:|---|
| Free | USD **0/mes** | Sujeto a elegibilidad y límite de proyectos gratis; pausas tras una semana de inactividad y **sin backups automáticos**. No asumir adecuado para staging persistente. |
| Pro nuevo, un proyecto Micro | Desde USD **25/mes** | Plan Pro con USD 10/mes de créditos de compute para una primera instancia Micro; comparar gastos del total de la organización y uso efectivo. Incluye backups diarios de 7 días según tarifas actuales. |
| Proyecto Micro adicional en una organización que YA paga Pro | Desde USD **10/mes adicionales** | Solo incremento del proyecto adicional bajo esos supuestos; NO incluye el valor Pro que ya está contratado. |
| Compute superior, PITR, logs/drains, dominio personalizado, egreso/storage adicional | **Por cotizar** | Pueden aumentar el total; los topes de gasto y alertas deben revisarse antes de aprobar. |
| Hosting web, correo corporativo, dominio público, IA real, proveedores de mensajería y pasarelas | **Por cotizar** | No incluidos en ninguna estimación base; autorización independiente. |

No hay garantía de disponibilidad de un nuevo proyecto Free ni de una tarifa para la cuenta específica. Los precios y el funcionamiento de los límites del proveedor pueden cambiar. Los costos de implementación, desarrollo y soporte tampoco están incluidos. Ecuador utiliza USD, pero pueden existir impuestos o cargos adicionales.

Para una primera prueba técnica de corta duración con datos ficticios, **Free podría evaluarse únicamente si la cuota disponible, suspensión por inactividad y ausencia de backups son aceptables**. Para validar recuperación persistente es preferible presupuestar un entorno que soporte respaldos adecuados y ensayos reales, sin asumir que Pro cubre todas las necesidades del proyecto.

## Riesgos que bloquean un GO real

### P0 — Prohibido crear recursos sin resolver
- Autorización explícita de **MG WEB STUDIO CLOUD** para proveedor, proyecto aislado, región, plan, responsable, tope mensual y costos incidentales.
- No reutilizar ni alterar Supabase de FINZY, BAZAR-ONLINE, Regaladitos Club u otras aplicaciones.
- Revisión y migración de los esquemas de V13, incompatibilidad del slug de Home, privilegios/grants y RLS con cuentas reales.
- Autenticación verificable en servidor, MFA de SUPERADMIN, revocación inmediata y scopes por tenant/sitio.
- Revisión de privacidad, datos de prueba y retención; sin cargar contratos/correos/documentos personales en el laboratorio.
- Reversión, backups, restauración y alarmas de costos validadas. El checkpoint V15 **no** cuenta.

### P1 — Antes de producción
- Publicación separada de aprobación de contenido, idempotencia transaccional/PostgreSQL, outbox procesado y pruebas de carreras entre dispositivos.
- E2E del SUPERADMIN y roles cliente, verificación anti-IDOR y RLS para otro sitio del mismo negocio.
- Auditoría, alertas, seguridad de DNS/TLS, performance, accesibilidad, protección antiabuso, incidentes y políticas comerciales.
- Cobros e IA real únicamente con aprobación y presupuestos propios.

## Criterios que sí permitirían iniciar una futura autorización de staging

La autorización debe contener **en texto claro**:
- Proyecto: MG WEB STUDIO CLOUD exclusivamente; indicar que no toca los otros proyectos.
- Proveedor y región elegidos.
- Plan y tope mensual expresado en USD, con encargados de revisar gastos.
- Permisos de trabajo: si se autoriza **solo crear un staging vacío** o también Auth, Storage, SQL, pruebas, etc.
- Política de datos: exclusivamente ficticios inicialmente, sin producción ni correos reales.
- Confirmación expresa de que se mantiene **bloqueada la publicación en producción, cobros e IA de pago**.
- Procedimiento de revertir/retirar recursos, riesgos aceptados, criterios para detener el trabajo y revisión del gasto real antes de escalar.

Un «perfecto sigamos» o la selección de casillas de demostración **no** se debe interpretar como aprobación para activar servicios de pago ni como un permiso de migración real.

## QA efectuado

- **V17 motor: 90/90** pruebas. Contratos de controles, estado inicial NO GO, costes orientativos, bloqueos críticos, controles completos solo hipotéticos, errores de evidencia, detección de HTML en evidencias y ausencia de red.
- **V17 interfaz: 42/42** pruebas. Listas, filtros, escenarios Free/Pro/Micro adicional, reporte NO GO, reinicio de evaluación, contadores y ausencia de almacenamiento y peticiones.
- **Regresión de V9–V16: 742/742** en 12 suites existentes.
- **TOTAL V9–V17: 874/874 comprobaciones simuladas correctas**, ejecutadas sobre el código actual de la rama GitHub.

Estos resultados no incluyen navegador Chrome/Android real, tests HTTP, SQL PostgreSQL, RLS Supabase, backups, autenticación multiusuario real, auditoría de terceros o costes de una cuenta concreta. Son pruebas de código y DOM simulado, no una certificación de seguridad.

Comandos reproducibles desde la raíz:

\`\`\`powershell
node apps/mg-web-studio-cloud/tests/staging-readiness-v17.test.cjs
node apps/mg-web-studio-cloud/tests/staging-readiness-v17-ui.test.cjs
\`\`\`

## Siguiente etapa sugerida (V18), sin autorización de infraestructura

Preparar un **paquete de despliegue de staging en seco**: manifiestos revisables, variables de entorno **solo nombres (sin secretos)**, migraciones propuestas sin aplicar, checklist de rollback, smoke test y criterios GO/NO GO verificables en el futuro. El despliegue automático y la ejecución de migraciones reales seguirán completamente deshabilitados, hasta autorización específica del usuario.

## Restricciones conservadas

Se trabajó únicamente en GitHub en la rama \`feature/mg-digital-v5-web-services\`. No se editó ni desplegó \`main\`; no se creó un proyecto de Supabase, no se ejecutó SQL ni se consumieron créditos de Lovable o APIs de IA. No se enviaron correos ni se cobraron servicios. Ningún otro proyecto fue modificado.
