# MG WEB STUDIO CLOUD — QA V20: Contratos canónicos

**Fecha:** 19 de octubre de 2026  
**Rama:** feature/mg-digital-v5-web-services  
**Conclusión:** contratos propuestos y comprobados en simulación. **NO GO** para migraciones, staging o producción. Los SQL originales V1/V13 permanecen intactos.

## Resultados ejecutados

| Componente | Comprobaciones |
|---|---:|
| Contrato V20 de rutas, Home, estados, permisos y transiciones | 114/114 |
| Laboratorio V20 (DOM simulado) | 36/36 |
| **Nuevas V20** | **150/150** |
| Regresión V9–V13 | 398/398 |
| Regresión V14–V15 | 240/240 |
| Regresión V16–V17 | 236/236 |
| Regresión V18–V19 | 207/207 |
| **Acumulado V9–V20** | **1.231/1.231** |

Se evaluaron archivos actuales del repositorio GitHub con un arnés JavaScript y DOM simulado. **No son pruebas de navegador real ni de PostgreSQL/Supabase, RLS, MFA, sesiones, servidor, sincronización entre dispositivos o producción.**

## Entregables

- **shared/mg-contracts-v20.js:** módulo puro de normalización de slug, path, estado heredado y transiciones de propuestas. No usa red ni persistencia.
- **db/v20-contratos-propuestos.review.sql:** propuesta de SQL con comentarios exclusivamente. No contiene sentencias ejecutables, no es migración.
- **tests/contracts-v20.test.cjs:** 114 casos de rutas, duplicados, estados, permisos ficticios, versiones, observaciones, rechazo de acciones y compatibilidad.
- **laboratorio-contratos-v20.html:** visualiza transformaciones de Home y los cambios de estado con usuarios de ejemplo.
- **tests/contracts-v20-ui.test.cjs:** 36 casos de controles y enlaces con DOM simulado.
- **CONTRATOS-CANONICOS-V20.md:** decisiones, limitaciones y secuencia recomendada.
- **QA-CONTRATOS-V20.md:** este documento.

Enlaces al laboratorio agregados a prototipo.html (SUPERADMIN) y portal-cliente.html. No se reemplazaron sus flujos previos.

## Decisiones propuestas

**Página Inicio:** el contenido nuevo debe guardarse con slug **home** y resolverse en la ruta pública **/**. El prototipo existente usa slug vacío, que se puede leer y convertir con el adaptador, pero **la diferencia con el modelo SQL existente todavía NO está corregida**. La unicidad por (site_id, slug) no demuestra que cada sitio publicado tenga obligatoriamente una Home; esa invariante necesita diseño y pruebas de base.

**Estados canónicos:** draft, submitted, needs_changes, rejected, approved, applied. Los dos nombres anteriores usados en SQL V13 —submitted_for_review y applied_to_draft— pueden interpretarse mediante alias de lectura. No se modificó el CHECK de V13 y no se hizo backfill.

**Transiciones:** SUPERADMIN ficticio con MFA crea/envía/revisa; OWNER o ADMIN puede aprobar/rechazar y solicitar cambios; EDITOR asignado puede solicitar cambios o aplicar una aprobación al borrador; VIEWER no muta. Se exige la revisión esperada y la versión del borrador. Se rechazan permisos de otro tenant o sitio. Estas reglas reciben una identidad ficticia manipulable y **no constituyen autorización real**. Aplicar una propuesta no publica el sitio.

## Bloqueos abiertos

1. **HOME_SLUG_CONFLICT:** SQL original y prototipo difieren; el nuevo contrato propone una solución, todavía no migrada.
2. **STATUS_CONTRACT_MISMATCH:** el SQL V13 conserva submitted_for_review y applied_to_draft; el contrato V20 propone submitted y applied.
3. **SECURITY_DEFINER_REVIEW:** falta auditar el helper privado de acceso, propietario, EXECUTE, privilegios, search_path y RLS real.
4. **CAS_SQL_TRANSACTION_UNPROVEN:** no se implementaron en PostgreSQL transacciones atómicas, CAS, idempotencia y outbox.
5. **POSTGRES_REQUIRED:** faltan parser SQL real, instalación y pruebas aisladas, pgTAP, autenticación, revocaciones, backups, restauración y rollback.

Los dos primeros continúan bloqueantes para migraciones. No se reetiquetan como corregidos por haber pasado pruebas de simulador.

## Próximos pasos V21

Preparar cambios de esquema propuestos y una matriz de pruebas cruzadas entre contrato V20 y SQL de una futura base aislada, **sin ejecutar los cambios**. Mantener el control de versiones, revocación de políticas antiguas y autorización real por empresa/sitio. Solo conectar recursos tras aprobación expresa de proyecto exclusivo, región, proveedor, plan y presupuesto.

## Restricciones conservadas

No se editó main, no se conectó Supabase ni se ejecutó SQL. Sin gastos de Lovable o IA de pago, cobros, dominios, producción o cambios en FINZY, BAZAR-ONLINE, Regaladitos Club y demás proyectos.

**Referencia de seguridad:** https://supabase.com/docs/guides/database/postgres/row-level-security
