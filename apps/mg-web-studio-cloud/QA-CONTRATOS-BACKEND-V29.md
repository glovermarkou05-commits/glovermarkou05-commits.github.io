# MG WEB STUDIO CLOUD — V29 | QA de contratos de persistencia y seguridad del backend

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Dictamen:** **PASS solo estático/simulado**. **NO GO** para backend real, PostgreSQL, Supabase, staging, publicación, IA de pago o cobros.

## 1. Revisión previa para evitar duplicaciones

Se revisó `shared/mg-transactional-api-v14-demo.js`, `QA-API-TRANSACCIONAL-V14.md`, `shared/mg-proposal-flow-v27.js`, `shared/mg-fixture-boundaries-v28.js`, la matriz documental V28 y el manifiesto V18.

V14 ya define rutas virtuales `/api/v1/.../proposals` y un motor de transacciones simuladas. V20 define 7 transiciones y estados canónicos. V27 ensaya las 7 acciones, y V28 ya identifica colisiones de idempotencia por tenant/actor y 30 pruebas de backend pendientes. **V29 no duplica un backend**: añade una especificación estructurada, un verificador estático y un documento de arquitectura. No se modificaron los módulos históricos, SQL, manifiestos de aprobación, paneles ni otros proyectos.

## 2. Entregables GitHub

| Archivo | Propósito |
|---|---|
| `staging/v29-backend-contract.review.json` | Contrato **no ejecutable** de 7 acciones, 12 errores, trust boundaries, unidad transaccional, idempotencia, seguridad de auditoría y NO GO |
| `shared/mg-backend-contract-v29.js` | Validador puro fail-closed de los campos del contrato; no habilita ejecución |
| `tests/backend-contract-v29.test.cjs` | Ensayos positivos y manipulación intencionada de permisos, rutas, errores, roles, flags y auditoría |
| `ARQUITECTURA-BACKEND-CONTRATOS-V29.md` | Explicación de decisiones técnicas y riesgos de backend |
| `QA-CONTRATOS-BACKEND-V29.md` | Este informe |

La especificación no es OpenAPI desplegable ni contiene credenciales, un servicio HTTP, procedimientos SQL, migraciones o acceso a una base de datos.

## 3. Decisiones del diseño V29

- **Siete operaciones:** create, submit, changes, revise, approve, reject y apply. Se reutilizan las rutas conceptuales propuestas en V14 y las autorizaciones V20/V23. No se añade publicación.
- **Confianza:** el cliente suministra solo su solicitud y revisiones esperadas; la identidad, el rol, el MFA, el scope, el requestId y el auditEventId deben derivarse **en el servidor**, nunca de una afirmación del navegador.
- **Persistencia futura:** una sola transacción con CAS de propuestas y borradores, idempotencia persistente, auditoría de negocio y evento outbox; error = rollback total de las escrituras. Nivel de aislamiento y retención aún no decididos.
- **Idempotencia:** clave conceptual por organización + actor autenticado + Idempotency-Key; huella del payload canonizado sin secretos, revalidando siempre permisos y revocación antes de cualquier replay.
- **Auditoría:** el historial visible de una empresa exige verificar de manera independiente la pertenencia del recurso. Los intentos no autorizados, requests sin identidad y exploración de recursos ajenos pertenecen a un registro **de seguridad privado y separado**, sin asociarlos automáticamente al tenant indicado por quien ataca.
- **Respuestas:** 12 códigos normalizados (401/403/404/405/409/429/500/503 y 400), texto público genérico, requestId generado por servidor; nunca stacktrace SQL, claves, cuerpos privados de propuestas o outbox.
- **Incompatibilidades:** se mantienen abiertos los estados V13 frente a V20, Home, SECURITY DEFINER, CAS SQL, PostgreSQL y seguridad real; ningún alias de lectura equivale a migración.

## 4. QA realmente ejecutado

Se leyeron los archivos recién guardados desde la rama de GitHub y se evaluaron en un arnés JavaScript con sustitutos de `fs`, `path` y `assert`. No se ejecutó un proceso Node real del usuario ni conexión, navegador, servidor HTTP, SQL o Supabase.

| Suite comprobada en esta sesión | Resultado |
|---|---:|
| V20 — Contratos | 114/114 |
| V21 — Compatibilidad SQL/API | 25/25 |
| V22 — Migraciones en memoria | 20/20 |
| V23 — Aislamiento multiempresa | 81/81 |
| V24 — Auditoría de ejemplo | 70/70 |
| V25 — Integración anterior | 91/91 |
| V26 — Evaluación técnica | 91/91 |
| V26 — CLI NO GO | 11/11 |
| V27 — Ciclo de propuestas | 213/213 |
| V28 — Casos límite | 105/105 |
| **V29 — Contratos de backend nuevos** | **341/341** |
| **Total de regresión estática V20–V29** | **1.162/1.162** |

Las pruebas V29 comprueban siete acciones, doce códigos de error, ausencia de autorización, el límite de auditoría entre tenant y seguridad operativa, orden transaccional, reintentos idempotentes y una amplia batería de alteraciones peligrosas de contrato. **No** son 341 pruebas de base de datos ni un pentest.

## 5. Bloqueos y autorización

**Siguen pendientes:** proyecto y región de staging aprobados, presupuesto y responsable de pagos, SQL V13/V20 coordinado, Home obligatoria, roles y sesiones verificados, MFA, RLS/GRANT, SECURITY DEFINER, CAS/outbox transaccionales, almacenamiento de idempotencia, auditoría resistente a manipulación, backup/recovery y pruebas reales de concurrencia y dispositivos.

El catálogo de V28 conserva **30 pruebas en NOT_EXECUTED**; V18 mantiene **16 precondiciones pending**. El validador V29 retorna `go:false`, `mayRunSQL:false`, `mayDeploy:false`, `mayPublish:false`, `mayCharge:false` y `mayCallPaidAI:false` incluso si el JSON trae un indicador de aprobación falsificado.

### Comando local opcional, solo lectura

```powershell
node apps/mg-web-studio-cloud/tests/backend-contract-v29.test.cjs
```

Para información sobre los límites de arquitectura consultar `ARQUITECTURA-BACKEND-CONTRATOS-V29.md`.

## 6. Próximo objetivo

**V30: diseño de contratos de eventos outbox, notificaciones y reconciliación**, en revisión estática y pruebas ficticias, sin crear workers, conectar mensajería ni publicar. Antes de implementar backend, sería necesario un mandato específico de infraestructura y costo, además de pruebas reales de seguridad/recuperación.

**Restricciones respetadas:** ninguna escritura sobre `main`; no se ejecutó SQL; no se modificó Supabase, producción, Lovable, servicios pagos ni proyectos ajenos.
