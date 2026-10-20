# MG WEB STUDIO CLOUD | V41 — Respaldo y recuperación antes de migraciones

**19 de octubre de 2026 · Documento de revisión, NO EJECUTADO.**

El STAGING gratuito está creado y la inspección V39/V40 no detectó tablas de aplicación en `public`. **No existe respaldo ni restauración verificados**. Este procedimiento no permite aplicar los tres borradores V40; requiere aprobación separada del entorno, del SQL y de las acciones de backup/restauración.

## Decisión de recuperación recomendada

Para un staging que utilizará **únicamente datos sintéticos**, acordar una de dos vías antes de crear objetos:

- **Recreación desde migraciones versionadas** en un entorno nuevo, vacío y autorizado: válida únicamente mientras no exista información valiosa que conservar, y luego de ensayar el procedimiento y permisos, roles y defaults.
- **Copia lógica antes de cada fase** y restauración **en un destino aislado distinto**, con validación de integridad. Una copia no probada no sirve para declarar GO. Supabase recomienda al plan Free exportar periódicamente mediante su CLI; los backups diarios administrados se proporcionan en planes pagos.

El mecanismo definitivo se decidirá con el responsable antes de ejecutar cambios, en función de costos reales y posibilidades técnicas. No se hará `DROP ... CASCADE` ni se restaurará automáticamente el proyecto actual.

## Secuencia pendiente de autorización

| Fase | Acción futura | Evidencia requerida |
|---|---|---|
| R0 | Identificar proyecto correcto, propietario de cambios y estado de facturación | Proyecto STAGING aislado; sin cuentas ni datos de clientes |
| R1 | Volver a leer esquema y migraciones; inspeccionar propietario, privilegios por defecto y roles | Lista de objetos y huellas sin secretos |
| R2 | Acordar RPO/RTO de prueba, responsable, cifrado, ubicación y caducidad | Política aprobada |
| R3 | Tomar copia lógica/snapshot permitido de datos ficticios mediante herramienta oficial cuya versión se verifique | Archivo cifrado fuera de GitHub, hash y fecha |
| R4 | Restaurar **en otro entorno previamente autorizado**, nunca sobre un proyecto existente de FINZY/BAZAR u otro | Hash, lista de tablas, filas y restricciones coincidentes |
| R5 | Probar permisos tras recuperación con `anon`, `authenticated`, usuarios ficticios de dos empresas y rol servidor | Denegaciones documentadas, cero filtraciones |
| R6 | Ejecutar **solo tras autorización SQL posterior** los bloques 01, 02 y 03 de forma controlada | Pruebas negativas en cada paso, transacción completa o rollback |
| R7 | Ante fallo: detener nuevos escritores, proteger evidencia, decidir restauración o migración compensatoria versionada | Dictamen firmado y recuentos de auditoría consistentes |

**Importante:** los tres SQL V40 se delimitan con `BEGIN` y `COMMIT` individualmente. Un error durante el bloque 03 no revierte automáticamente los bloques 01 y 02 ya confirmados. Antes de iniciar 01 debe estar definida la recuperación desde una confirmación parcial.

## Condiciones de parada inmediata

**Detener cambios** si sucede cualquiera de las siguientes situaciones: proyecto/cuenta/plan no coinciden, hay tablas inesperadas, falta copia validada, falla un test de RLS, se activa acceso `anon` accidental, cambian grants predeterminados de forma no comprendida, hay un rol o función `SECURITY DEFINER` sin auditoría, se solicita usar datos reales, o existe un costo no aprobado.

## Registro mínimo de la eventual ejecución

Un registro de incidentes/QA debe incluir el ID de cambio (no credenciales), hashes de borradores revisados, fecha y responsable, permisos autorizados, esquema observado antes/después, resultados de RLS/roles, referencia protegida de copia, restauración verificada y decisión de liberación. **No guardar claves, strings de conexión o dumps en GitHub.**

No se garantiza un RPO/RTO ni un tiempo de recuperación hasta ensayarlo en un ambiente autorizado. El plan Free puede pausar proyectos inactivos. Una copia de base tampoco incluye automáticamente los objetos binarios del servicio Storage; si se usa Storage en fases futuras habrá que respaldarlo por separado.

## Enlaces oficiales

- [Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

**Resultado V41:** `RECOVERY_NOT_TESTED`; restauraciones reales **0**; SQL ejecutado **0**; producción **NO GO**.
