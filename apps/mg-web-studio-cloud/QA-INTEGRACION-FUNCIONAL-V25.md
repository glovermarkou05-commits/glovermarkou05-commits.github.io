# MG WEB STUDIO CLOUD — QA V25 | Integración funcional de propuestas, permisos y auditoría

**Fecha:** 19 de octubre de 2026  
**Rama de trabajo:** `feature/mg-digital-v5-web-services`  
**Resultado:** **NO GO** para base de datos, servidor y producción; **PASS solo en simulación**.

## Revisión y no duplicación

Se revisaron módulos V20 (`shared/mg-contracts-v20.js`), V23 (`shared/mg-tenant-security-v23.js`), V24 (`shared/mg-audit-trail-v24.js`), V22 (simulador de migración), así como la API simulada V14. Los componentes existentes no se sustituyeron. V25 implementa un **coordinador separado y de solo memoria** para comprobar consistencia entre ellos.

## Archivos nuevos

- `shared/mg-e2e-workflow-v25.js`: integra la decisión de transición V20, autorización V23 y escritura en el registro ficticio V24. Ofrece `createWorkflow({directory,contracts,security,audit,initial})`, `execute(request)` y `snapshot()`.
- `tests/e2e-workflow-v25.test.cjs`: suite de integración con flujos correctos, denegaciones y regresiones.
- `QA-INTEGRACION-FUNCIONAL-V25.md`: informe de resultados y limitaciones.

## Alcance funcional

La integración admite exclusivamente **aprobar, rechazar y aplicar** propuestas ya existentes en fixtures, porque V24 dispone de eventos específicos para esas acciones. La creación, envío, solicitud de cambios, nueva revisión y publicación no están conectados en V25. El alcance reducido impide afirmar que exista un circuito completo en producción.

Un cambio pasa por: sesión ficticia y permisos V23 → rol/scope derivados del directorio ficticio (no del cuerpo de la petición) → transición y control de revisión V20 → comprobación Home del sitio para aplicar → inserción de auditoría V24 → reemplazo del snapshot de memoria. Si la auditoría falla, la propuesta **no cambia en la simulación**. No se genera ningún release público.

Controles de ensayo:
- Solo OWNER/ADMIN pueden aprobar y rechazar; EDITOR asignado puede aplicar, pero no aprobar o rechazar; VIEWER no modifica.
- Empresa ajena, sitio ajeno, membresía revocada, scope revocado, sesión revocada o identidad falsificada se deniegan.
- Las revisiones incorrectas, dobles aprobaciones y versiones antiguas del borrador no crean una operación confirmada.
- La misma clave de operación con idéntica solicitud devuelve el recibo previo **solo después de reevaluar el permiso actual**; con parámetros distintos se rechaza.
- Se valida la existencia de una única página Inicio cuando se aplica una propuesta, convirtiendo en memoria el slug antiguo vacío a `home`.
- El historial V24 mantiene eventos de operaciones **confirmadas en el simulador**. Intentos rechazados antes de la decisión de V24 no se registran en él. **No es una auditoría de seguridad completa**.

## QA efectivamente ejecutado

Se recuperaron los **archivos guardados en la rama GitHub** y se evaluaron en un arnés JavaScript con sustitutos de `fs`, `path` y `assert` (sin proceso Node del usuario, sin navegador y sin red de la aplicación).

| Suite | Correctas |
|---|---:|
| Contratos y transiciones V20 | 114/114 |
| Permisos multiempresa V23 | 81/81 |
| Auditoría simulada V24 | 70/70 |
| Nueva integración V25 | 91/91 |
| **Regresión revisada en esta sesión** | **356/356** |

Esto **no** es un acumulado completo de todas las suites V9–V25. No se repitieron todas las pruebas históricas, ni se verificaron sistemas externos, servidor, PostgreSQL o RLS.

### Advertencias de seguridad

Las identidades y sesiones son **datos de prueba manipulables**. Ni V23 ni V25 son middleware de autenticación para uso real. La suma de comprobación FNV de V24 **no es criptográfica** y no protege un historial ante un atacante. El reemplazo de objetos de V25 **no es una transacción ACID, aislamiento concurrente ni idempotencia persistente**. No se usa un servicio pagado.

La normalización de estados heredados es solo de lectura/fixture: el SQL V13 sigue usando `submitted_for_review` / `applied_to_draft`. No se ha ejecutado conversión de datos ni ALTER TABLE.

## Bloqueos para la siguiente etapa

1. Resolver contrato de Home y estados SQL/API en migraciones coherentes, con reversión segura.
2. Preparar backend real con identidad y MFA verificados en servidor; no utilizar datos de rol aportados por el navegador.
3. Implementar validación RLS/GRANT/SECURITY DEFINER con sesiones reales y entorno segregado.
4. Integrar transiciones restantes, eventos outbox, auditoría y versiones en transacciones SQL reales y pruebas de concurrencia.
5. Ejecutar pruebas de PostgreSQL aislado, backup/restauración y casos de error, solo tras autorización específica de proveedor, región, plan, costos y proyecto.
6. Conservar el manifiesto de V18 en **NO GO** hasta cumplir todas las condiciones.

## Comandos para revisión local opcional

```powershell
node apps/mg-web-studio-cloud/tests/contracts-v20.test.cjs
node apps/mg-web-studio-cloud/tests/tenant-security-v23.test.cjs
node apps/mg-web-studio-cloud/tests/audit-trail-v24.test.cjs
node apps/mg-web-studio-cloud/tests/e2e-workflow-v25.test.cjs
```

**Restricciones conservadas:** sin ejecutar SQL; sin cambios en Supabase, `main` o producción; sin Lovable, IA pagada, servicios con costo ni modificaciones en proyectos ajenos.
