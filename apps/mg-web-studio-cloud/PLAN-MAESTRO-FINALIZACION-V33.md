# MG WEB STUDIO CLOUD — V33 | Plan maestro de finalización

**Fecha de corte:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama de desarrollo:** `feature/mg-digital-v5-web-services`  
**Dictamen actual:** **NO GO para staging, SQL, producción, IA paga, correo y cobros**. Esta fase es un inventario y plan de trabajo; no ejecuta infraestructura.

## 1. Qué existe y qué no

El desarrollo **ya cuenta con prototipos web y paneles de demostración**, contratos canónicos V20, revisión de SQL V19/V21, escenarios de permisos V23, auditoría ficticia V24, coordinación de propuestas V25/V27, matriz de backend V28/V29, gestión de outbox/notificaciones V30, observabilidad V31 e inspección de fallos combinados V32.

**No existe evidencia de:**
- Backend de producción con persistencia transaccional de estas operaciones.
- Proyecto de staging exclusivo **autorizado y ensayado** con PostgreSQL real.
- Inicio de sesión y MFA, permisos y RLS probados contra identidades reales.
- Worker de notificaciones, outbox durable, cron, email, pagos ni IA paga operativos.
- QA navegador/dispositivos/recuperación real, aprobación de costos o de salida a producción.

Los resultados de suites JavaScript anteriores certifican exclusivamente lo que probaron: **fixtures y validaciones estáticas**, no comportamiento de infraestructura.

## 2. Inventario de bloqueos con evidencia

| Origen | Estado documentado | Implicación |
|---|---|---|
| V17 | Catálogo de 32 controles hipotéticos | No representa autorización |
| V18 | **16/16 precondiciones** `pending` | No está autorizado staging |
| V19 | **2 incompatibilidades principales:** `HOME_SLUG_CONFLICT` y `STATUS_CONTRACT_MISMATCH` | No se puede asumir contrato SQL/API compatible |
| V19 | `SECURITY_DEFINER_REVIEW`, `CAS_SQL_TRANSACTION_UNPROVEN`, `POSTGRES_REQUIRED` | Revisión de permisos/consistencia real pendiente |
| V28 | **30/30** escenarios `NOT_EXECUTED` | Backend, RLS, concurrencia y seguridad reales pendientes |
| V30 | **18/18** escenarios `NOT_EXECUTED` | Entrega externa, leases, DLQ y deduplicación no probados |
| V31 | **20/20** escenarios `NOT_EXECUTED` | Monitorización operativa y respuesta a incidentes no probadas |
| V32 | **24/24** escenarios `NOT_EXECUTED` | Atomicidad y recuperación ante fallos combinados no probadas |

**Cuidado con los números:** V28 + V30 + V31 + V32 suman **92 registros de escenarios**, varios referidos al mismo control técnico. No son 92 defectos distintos. Tampoco se suman a los 32 controles V17 ni a los 16 controles V18 como si fueran todos independientes.

En V20 ya se acordó la representación canónica Home `slug=home` y la ruta pública `/`; lo pendiente no es volver a escoger un slug, sino compatibilizarlo con esquemas, datos heredados, reglas de Home única y publicación. Para estados V13/V20, los alias son solo de **lectura**: una migración real deberá sincronizar escritura, esquema, API y eventos antes de eliminar el bloqueo.

## 3. Ruta crítica recomendada — 13 tareas y cuatro hitos

### Hito M1 — GitHub, sin costo ni ejecución de SQL

| Prioridad | ID | Acción | Condición de salida |
|---|---|---|---|
| **P0** | `C01` | Cerrar ajuste documentado del contrato Home entre SQL/API/UI | Diffs revisables y pruebas estáticas de Home única, ausente y duplicada |
| **P0** | `C02` | Resolver diseño de equivalencia de estados V13 y V20 | Migración conceptual versionada, lectura/escritura y rollback con ensayos estáticos |
| **P0** | `C03` | Preparar paquete de cambios revisables tras C01+C02 | Archivos de revisión y pruebas de compatibilidad reproducibles, sin comandos SQL ejecutados |

**Estado:** C01 y C02 pueden empezar inmediatamente en GitHub. C03 depende de ambas. Se prohíben despliegues y cambios de datos.

### Hito M2 — Solo tras autorización expresa de staging

| Prioridad | ID | Acción | Salida verificable |
|---|---|---|---|
| **P0** | `G01` | Aprobación de proveedor, región, cuenta exclusiva y presupuesto | Permiso humano específico, **no** un cambio de JSON |
| **P0** | `S01` | Autenticación y MFA de servidor | Identidad, scopes y revocación probados con sesiones reales |
| **P0** | `S02` | Migración probada, grants, RLS y SECURITY DEFINER | Pruebas PostgreSQL/roles cruzados/rollback |
| **P0** | `D01` | Transacción ACID + CAS + auditoría + idempotencia + outbox | Fallos parciales y concurrencia confirmados con rollback |
| **P1** | `D02` | Auditoría de negocio y seguridad separadas | Eventos durables, redacción y acceso mínimo verificables |
| **P1** | `D03` | Notificaciones, worker, deduplicación y DLQ | Reintentos y recuperación reales sin envíos duplicados |
| **P0** | `R01` | Respaldos, recuperación y rollback | Restauración verificada con RPO/RTO documentados |
| **P1** | `Q01` | QA multidispositivo y multiempresa | Pruebas reales end-to-end, seguridad, accesibilidad e incidentes |

**Importante:** el hito M2 es un **plan futuro bloqueado**. No se autoriza crear Supabase, ejecutar DDL, activar herramientas ni asumir presupuesto.

### Hito M3 — Producción

`P01`: una **segunda autorización humana separada** después de los resultados de M2, revisión de infraestructura, seguridad, dominio/TLS, costos, privacidad y rollback. Un `GO` de pruebas aisladas no publica automáticamente.

### Hito M4 — Complementos comerciales opcionales

`X01`: IA de pago, cobros y servicios externos **no forman parte del mínimo técnico de MG WEB STUDIO CLOUD** y solo se habilitarían mediante una decisión independiente posterior. Ningún cobro o consumo de créditos está aprobado.

## 4. Criterios formales de cierre de cada tarea

Cada tarea requiere:
1. Evidencia identificable en GitHub (archivo, versión, suite y compromiso) o, cuando corresponda, evidencia real del ambiente aislado.
2. Revisión de permisos, límites tenant, datos personales y rutas de recuperación pertinentes al cambio.
3. Pruebas negativas además de casos correctos, sin presentar fixtures como autenticación o PostgreSQL auténticos.
4. Registro de dependencias cumplidas; no cerrar por repetición de «PASS» histórico si cambió el código.
5. Aceptación explícita del propietario para costos, staging, credenciales, publicación o servicios pagos, por separado.

**Regla GO/NO GO:** aprobar el formato del plan o completar suites estáticas nunca genera permiso de despliegue. El verificador V33 devuelve siempre `NO_GO`.

## 5. QA V33 — verificaciones realizadas

| Suite efectivamente ejecutada en esta sesión | Resultados |
|---|---:|
| `tests/master-roadmap-v33.test.cjs` | **146/146** |
| `tests/technical-readiness-v26.test.cjs` | **91/91** |
| `tests/technical-readiness-v26-cli.test.cjs` | **11/11** |
| **Total de comprobaciones ejecutadas durante V33** | **248/248** |

Las pruebas se evaluaron en un arnés de JavaScript, usando archivos obtenidos de GitHub y sustitutos para `fs`, `path`, `assert` y `process`. No se ejecutó Node en el equipo del usuario, SQL, PostgreSQL ni un navegador; **no se volvió a ejecutar todo V9–V32**.

En la primera versión del verificador V33 se detectó que la matriz V30 usa los campos `status/evidence`, a diferencia de las matrices V28/V31/V32 (`evidenceStatus/evidenceRef`). La corrección se incorporó en la rama y luego pasaron las 146 pruebas nuevas. La regresión V26 permaneció correcta, conservando su NO GO.

### Comandos locales de solo lectura

```powershell
node apps/mg-web-studio-cloud/tests/master-roadmap-v33.test.cjs
node apps/mg-web-studio-cloud/staging/v33-master-preflight.cjs
```

`v33-master-preflight.cjs` retorna **exit code 2** cuando el inventario de solo lectura es coherente pero no hay autorización, y **exit code 1** cuando hay inconsistencia o faltan archivos. Ningún código significa «listo para producción».

## 6. Recomendación inmediata: V34

**No añadir otro simulador transversal.** Desarrollar `C01`: corrección revisable de Home canónica (V13/V20, API, UI y casos de Home única, ausente o duplicada), sin ejecutar SQL. Después abordar `C02` y `C03`. Esta secuencia produce avances hacia un sistema implementable, en vez de aumentar el número de pruebas ficticias sin resolver los conflictos básicos.

## 7. Restricciones conservadas

No se modifica `main`, Supabase, Lovable, producción, la infraestructura real ni otros proyectos. No se ejecutan scripts SQL, migraciones, correos, IA de pago, cobros o despliegues. El JSON de V33 es un **documento de planificación**, nunca una autoridad operativa.
