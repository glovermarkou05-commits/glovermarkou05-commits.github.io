# MG WEB STUDIO CLOUD — V42 | Correcciones de diseño SQL y cuánto falta para terminar

**Fecha:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Entorno futuro:** `MG WEB STUDIO CLOUD - STAGING`, São Paulo, proyecto Free ya creado.  
**Dictamen:** **V42 revisado estáticamente, NO GO para migraciones, SQL real, backend, publicación o producción.**

## 1. Qué se hizo realmente

Se crearon dos artefactos nuevos, sin sobrescribir los tres diseños históricos V40:

- `db/v42-drafts/INSTALL_ATOMIC.review.sql.txt` — propuesta **real de SQL pero NO autorizada ni ejecutada**, conservada fuera de `supabase/migrations`. Une el SQL de estructura, propuestas y políticas en una única transacción con un solo `BEGIN` y `COMMIT`.
- `staging/v42-review-manifest.json` — inventario de mejoras de diseño, bloqueos P0, autorizaciones negadas y trabajo operativo restante.
- `tests/atomic-review-v42.test.cjs` — revisión de texto y pruebas negativas que rechazan supuestos inseguros. No es un parser PostgreSQL, ni prueba de permisos reales.

**Cambios propuestos en el SQL nuevo:**
1. Cuatro comandos `ALTER DEFAULT PRIVILEGES` basados en el ejemplo oficial para el creador **`postgres` supuesto**. **No se verificó todavía el creador verdadero, `pg_default_acl` ni el impacto en la plataforma; no aplicar a ciegas.**
2. **Una sola transacción** para las 16 tablas, RLS y grants. Si PostgreSQL detecta un error antes del único `COMMIT` puede hacerse `ROLLBACK` del conjunto; **después del `COMMIT` todavía se requiere recuperación aprobada**, no un `DROP CASCADE` improvisado.
3. `mg_private.mg_audit_events.organization_id` recibe FK opcional a `mg_organizations` y `ON DELETE RESTRICT`, dejando abierta la decisión de retención y eventos del sistema.
4. Índice único `(proposal_id,revision,event_type)` para los registros de outbox, como protección de duplicados de **eventos del mismo tipo y revisión**; queda pendiente comprobar si esta cardinalidad corresponde exactamente a los flujos de negocio.
5. Índice único por `(proposal_id,revision,event_type,recipient_user_id)` para evitar repetir una misma notificación persistida a un mismo destinatario.
6. Se conserva `published` deshabilitado hasta asegurar la existencia de Home bajo concurrencia. No hay datos de clientes, importación, worker, web público ni secretos.

El cambio de índices **no prueba entrega exactamente una vez**, ni implementa por sí mismo CAS, idempotencia de acciones HTTP, notificaciones externas, RLS o transacciones del backend.

## 2. Cinco bloqueos P0 — situación V42

| Hallazgo V41 | Mejora de V42 | ¿Está realmente cerrado? |
|---|---|---|
| V41-01 Privilegios por defecto | DDL de revocación propuesto | **No**. Falta comprobar roles y defaults reales, y efectos de Supabase |
| V41-02 Respaldo/confirmaciones parciales | SQL agrupado en una transacción | **No**. Falta política de backup y restauración probada |
| V41-03 Autorización SQL separada | Paquete exacto identificable | **No**. No hay aprobación de ejecución |
| V41-04 Parser PostgreSQL, RLS y aislamiento reales | Suite estática nueva | **No**. PostgreSQL aún no ha validado el SQL |
| V41-10 Datos actuales de STAGING | Línea base documentada V39/V41 | **No**. Es preciso revalidar objetos/roles inmediatamente antes de ejecutar |

**Resultado:** ningún P0 se declara cerrado por una modificación de GitHub. La V42 prepara decisiones y reduce riesgos de diseño; no sustituye pruebas técnicas autorizadas.

## 3. ¿Cuánto falta para terminar?

El **plan maestro V33** identifica **13 bloques originales**, de los cuales el último (**X01**, IA de pago y cobros) es **opcional y sujeto a otra autorización**. La documentación del plan V33 es histórica, por lo que sus flags de staging no se reescribieron: el STAGING se aprobó y creó efectivamente después, en las etapas V38–V39.

**Base preparada (4 bloques):** G01 (STAGING real creado, no esquema); C01, C02, C03 (Home, estados, migraciones **diseñados**, no aplicados).

**Siguen faltando 8 bloques mayores para una versión operativa:**

| Orden sugerido | ID | Trabajo pendiente |
|---|---|---|
| 1 | S01 | Backend autenticado, sesiones, roles y MFA |
| 2 | S02 | Aplicar migración revisada y probar PostgreSQL/RLS y grants reales |
| 3 | D01 | API transaccional ACID, control de versiones CAS, idempotencia, outbox |
| 4 | D02 | Auditoría de negocio y seguridad con trazabilidad independiente |
| 5 | D03 | Worker/cola de notificaciones, deduplicación, errores y conciliación |
| 6 | R01 | Respaldos, restauración, reversión y recuperación verificados |
| 7 | Q01 | Pruebas integrales multiempresa, multidispositivo, fallos y regresión |
| 8 | P01 | Aprobación humana independiente de producción y eventual despliegue |

El orden no es totalmente secuencial: recuperación debe revisarse **antes de aplicar SQL**, y las pruebas de autorización deben acompañar al backend. También faltan las funciones excluidas de V40 (dominios, contenido compartido, productos/promociones, publicaciones), cuya planificación detallada debe cerrarse contra los requisitos del producto antes de considerar que la web está terminada.

**No hay una estimación honesta de días, porcentaje global o créditos Lovable verificables** hasta revisar y probar el backend real, recursos de ejecución y el alcance funcional de lanzamiento. La V42 completa la **preparación de diseño**, no equivale a tener la aplicación desplegada.

## 4. QA y límites

La nueva suite V42 revisa el SQL unificado y rechaza alteraciones intencionales de transacciones, permisos anónimos, escrituras de navegador, eventos, constraints, estado `published` e índices de deduplicación. Las comprobaciones son **estáticas de texto**, no ejecución PostgreSQL.

El archivo `db/v42-drafts/INSTALL_ATOMIC.review.sql.txt` **contiene instrucciones SQL activas** y solo está guardado como texto para revisión. No lo copie al SQL Editor ni lo convierta en migración sin autorización específica, revisión de propietario/defaults, backup, procedimiento de recuperación y pruebas de seguridad.

Documentación oficial: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) y [Database Backups](https://supabase.com/docs/guides/platform/backups).

## 5. Próximo avance útil

**V43 recomendada:** validar el paquete para una **aprobación SQL concreta** identificando el blob/versión exactos, responsable de backup, plan de rollback, alcance autorizado y entorno correcto. Posteriormente, previa autorización separada, instalar y comprobar PostgreSQL **solo en STAGING**. No publicar ni activar pagos.

**Restricciones conservadas:** ningún SQL ejecutado, ninguna migración registrada, ningún despliegue, ningún cobro, sin Lovable, sin editar `main` ni otros proyectos.
