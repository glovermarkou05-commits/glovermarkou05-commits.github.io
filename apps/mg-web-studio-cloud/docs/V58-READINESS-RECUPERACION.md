# MG WEB STUDIO CLOUD — V58 | Preparación para recuperación

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**STAGING:** `yefcgjtovfnsqtdjdsod` · PostgreSQL 17.11.0.003 · `ACTIVE_HEALTHY`  
**Resultado:** auditoría de preparación completada en solo lectura. El ensayo de exportación y restauración sigue bloqueado por falta de herramientas locales.

## Herramientas disponibles en este entorno

Se verificó la disponibilidad de `psql`, `pg_dump`, `pg_restore`, `postgres`, `initdb`, Docker y Supabase CLI. Ninguno está instalado o disponible en PATH. No se instaló software, se descargó un cliente, se pidió una cadena de conexión ni se activó un servicio pago.

## Inventario de STAGING obtenido por conectores de lectura

- Proyecto activo y saludable; motor PostgreSQL 17.
- Historial: V45 (`20261020181753`), V53 (`20261020183045`) y V54 (`20261020191612`).
- Las 16 tablas MG aparecen con RLS habilitada y cero filas: 12 en `public` y 4 en `mg_private`.
- pgTAP 1.3.3 está instalado en el esquema `extensions`; también están instaladas `pgcrypto` y `uuid-ossp`.
- La lectura de asesores de seguridad devuelve cuatro avisos informativos `rls_enabled_no_policy`, todos para `mg_private.mg_audit_events`, `mg_private.mg_operation_idempotency`, `mg_private.mg_proposal_outbox` y `mg_private.mg_staff_roles`.

## Evaluación de los avisos RLS

Las cuatro tablas están en el esquema no expuesto `mg_private`, tienen RLS activa y no tienen políticas. Ese patrón deniega acceso a roles ordinarios por RLS y es compatible con el diseño de tablas internas; el aviso es informativo, no prueba una exposición. Antes de operar el backend, aún se debe verificar en PostgreSQL aislado que los grants efectivos sean los mínimos previstos y que el acceso de servicio no exponga estas tablas a clientes.

No se cambiaron políticas ni grants en esta etapa.

## Manifiesto mínimo para el ensayo

La restauración aislada deberá demostrar, antes de declarar `RECOVERY_TESTED`:

1. El dump puede leerse y restaurarse con herramientas PostgreSQL 17 en un destino local aislado y enlazado solo a localhost.
2. Se conservan versiones de migración, esquemas `public` y `mg_private`, constraints, índices, RLS, policies, grants y extensiones relevantes.
3. Los conteos de filas y de tablas MG coinciden entre el origen y el destino restaurado.
4. La suite V53 se ejecuta en el destino local sin escribir en STAGING.
5. Se anotan duración real, retención, ubicación/cifrado del backup y RPO/RTO medidos.

Los datos observados hoy (16 tablas, todas vacías) son una línea base de esquema; no reemplazan un dump ni una restauración real.

## Estado y próximo bloqueo

**V58 readiness:** completada. **V56/V58 recuperación real:** bloqueada por herramientas PostgreSQL/Docker ausentes. Para continuar se requiere un entorno local con PostgreSQL 17 y Supabase CLI/Docker, sin costo adicional y sin cambios en producción. Las credenciales deben ingresarse localmente, no en el chat ni en GitHub; el dump debe mantenerse cifrado fuera del repositorio.

No se ejecutó SQL, migración, backup, restore ni despliegue. STAGING fue consultado únicamente con operaciones de lectura. Producción y publicación continúan en **NO GO**.
