# MG WEB STUDIO CLOUD — V22: simulador de migración y recuperación

Fecha: 2026-10-19
Rama: feature/mg-digital-v5-web-services
Estado: NO GO. Solo pruebas en memoria.

## Entregables
- shared/mg-migration-simulator-v22.js: normaliza Home y estados en objetos ficticios y verifica revisiones esperadas.
- tests/migration-simulator-v22.test.cjs: casos correctos y fallidos.

## QA realizado
20 de 20 comprobaciones correctas mediante un arnés JavaScript que cargó los archivos recuperados de GitHub. No se ejecutó Node en el equipo del usuario, ni SQL ni pruebas de PostgreSQL.

## Resultados y límites
- Se comprueba que la entrada original no cambia.
- Se comprueba la detección de ausencia de Home, duplicación y estados desconocidos.
- Se simula el rechazo por versión o estado desactualizado.
- Ante una operación inválida el simulador no devuelve un estado parcial.
- La función de control de despliegue siempre responde go=false.

No se ha demostrado atomicidad SQL ni un rollback en base de datos. Tampoco se han verificado RLS, permisos, sesiones, concurrencia simultánea real, copias de seguridad ni recuperación.

## Contratos todavía pendientes
1. Garantizar exactamente una Home para cada sitio publicado.
2. Coordinar la transición de nombres de estados SQL con API y consumidores.
3. Revisar SECURITY DEFINER, search_path, roles, privilegios EXECUTE, GRANT y RLS.
4. Diseñar transacciones reales de versiones esperadas, idempotencia y outbox.
5. Acordar procedimiento de reversión con respaldo y pruebas aisladas antes de una eventual autorización.

## Restricciones conservadas
Sin cambios en main, sin Lovable, sin ejecución SQL, sin tocar Supabase, sin IA pagada, sin modificar otros proyectos y sin publicación.