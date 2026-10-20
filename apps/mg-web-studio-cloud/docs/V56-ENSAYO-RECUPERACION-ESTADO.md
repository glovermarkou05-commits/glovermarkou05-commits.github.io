# MG WEB STUDIO CLOUD — V56 | Ensayo de recuperación autorizado

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**STAGING:** `yefcgjtovfnsqtdjdsod` · PostgreSQL 17.11.0.003  
**Autorización:** recibida para exportar STAGING y ensayar la restauración en un destino local PostgreSQL 17 aislado.  
**Resultado:** **BLOQUEADO POR HERRAMIENTAS LOCALES NO DISPONIBLES**. La prueba todavía no se ha ejecutado.

## Comprobaciones del entorno de ejecución

El entorno disponible es Ubuntu 24.04. No se encontraron `supabase`, `psql`, `pg_dump`, `pg_restore`, `postgres`, `initdb` ni Docker. Tampoco hay un servidor PostgreSQL local ni paquetes PostgreSQL 17 en caché local.

El conector Supabase disponible permite consultas y migraciones, pero no expone una operación de exportación lógica ni un inventario de backups. La operación disponible de restauración puede modificar un proyecto y no es una vía de exportación; **no se invocó**.

## Resultado y protección del proyecto

- No se generó archivo de respaldo.
- No se realizó una restauración.
- No se ejecutó SQL, migración, cambio de datos ni despliegue durante V56.
- STAGING permanece intacto; producción no se tocó.
- Ninguna credencial o cadena de conexión se solicitó, registró o guardó en GitHub.
- No se activó ningún servicio pago ni se creó otro proyecto.

## Requisito concreto para completar el ensayo

Habilitar en el mismo entorno de ejecución un cliente/servidor PostgreSQL 17 (`pg_dump`, `pg_restore`, `initdb`) o PostgreSQL 17 dentro de Docker junto con Supabase CLI. Luego volver a comprobar versiones, validar que el destino local escuche solo en localhost y confirmar la conexión directa al STAGING desde ese entorno.

La URL/contraseña de base de datos debe introducirse localmente mediante un método que no la imprima, no incluirse en archivos del repositorio ni pegarse en el chat. Guardar el dump cifrado fuera del repositorio. Restaurar solamente en el cluster local aislado; nunca ejecutar restore sobre el proyecto STAGING o producción.

Después del restore, comparar versión, extensiones, esquemas, migraciones, tablas, ACL, conteos de filas y repetir la suite pgTAP. Solo entonces registrar RPO/RTO observados y marcar `RECOVERY_TESTED`.

**Estado final V56:** autorización recibida; infraestructura local faltante; exportación/restauración pendiente. Producción/publicación: **NO GO**.
