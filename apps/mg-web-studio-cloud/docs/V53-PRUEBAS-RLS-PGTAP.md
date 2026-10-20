# MG WEB STUDIO CLOUD — V53 | Prueba runtime RLS con pgTAP

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Proyecto:** MG WEB STUDIO CLOUD - STAGING · `yefcgjtovfnsqtdjdsod` · PostgreSQL 17.11.0.003 · sa-east-1  
**Resultado:** 56/56 aserciones pgTAP correctas. Fixtures temporales revertidos.

## Alcance ejecutado

- Se verificó el proyecto de STAGING activo y pgTAP 1.3.3.
- Se habilitó pgTAP en `extensions`; Supabase registró `mg_web_studio_v53_enable_pgtap_staging`, versión `20261020183045`.
- La suite creó cuatro identidades sintéticas sin contraseña, dos organizaciones, tres sitios y relaciones de muestra dentro de una transacción.
- Las consultas RLS se ejecutaron como `authenticated` mediante `SET LOCAL ROLE authenticated`, con `request.jwt.claim.sub` de cada identidad.
- La prueba cubrió las 12 tablas públicas para owner A, editor A con scope de un solo sitio, viewer A sin scope y owner B de otro tenant.
- Ocho aserciones adicionales revisaron grants de anon, ausencia de DML para authenticated y aislamiento del esquema `mg_private` frente a roles de navegador; se comprobó acceso de lectura de `service_role` a una tabla privada.

## Interpretación

La suite ejercita la evaluación de RLS en PostgreSQL para claims simulados. No crea cuentas de acceso ni usa credenciales; por eso **no equivale a un login real de Supabase Auth ni a una solicitud HTTP por PostgREST**. El backend y su validación de actor siguen sin probarse.

Las dos ejecuciones iniciales devolvieron 47 fallos porque el generador no aplicaba el cambio de rol de forma efectiva; ambas transacciones revirtieron los fixtures. Tras corregir el harness, la ejecución válida fue 56/56. No se cuentan aquellos resultados inválidos como fallos de política.

## Limpieza comprobada

Después de la prueba, `auth.users` y cada una de las 16 tablas MG quedaron en cero filas. El script finaliza con `ROLLBACK`. No se modificaron políticas, grants, filas de usuario persistentes, ni otros proyectos.

## Límites que continúan abiertos

- **Defaults ACL:** V54 retiró los grants futuros de `anon` y `authenticated` en TABLES/SEQUENCES de `postgres/public`; siguen pendientes los defaults de funciones (incluido PUBLIC EXECUTE global) y los tres tipos de objetos de `supabase_admin`. No crear funciones públicas sin revisar y fijar sus grants efectivos.
- **Trazabilidad V45:** la procedencia se reconcilió en V57 con el historial y logs PostgreSQL de STAGING. El cuerpo enviado coincide con `db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt` (blob SHA `135ff2c25d935d87e5c8e9e0f9189705cd40b411`). Su encabezado de borrador/no registrar está obsoleto. No se reejecutó ni se promovió a migración activa; restauración local y estrategia canónica siguen pendientes.
- **Backend:** endpoints, validación de actor/organización/sitio e integración Auth/PostgREST aún no se probaron.
- **Rendimiento:** EXPLAIN con cardinalidad sintética y resolución de 14 alertas FK vs. 10 brechas V50 siguen pendientes.
- **Recuperación:** backup/restore real, RPO/RTO, retención, destino y aprobación siguen pendientes.
- **Producción/publicación:** NO GO. No se cambió producción, no se desplegó y no se activó ningún servicio pago.

## Registro

| Etapa | Estado |
|---|---|
| V46 | 72/72 comprobaciones estáticas reportadas. |
| V47 | 8/8 pruebas locales reportadas. |
| V48 | Recuperación incompleta; parámetros operativos pendientes. |
| V49–V52 | Revisión estática, instalación V45 y auditoría del catálogo completadas; gates runtime documentados. |
| V53 | pgTAP instalado solo en STAGING; matriz RLS 56/56; fixtures limpiados y cero filas confirmadas. |
| V54 | Defaults futuros de tablas/secuencias para `postgres/public` aplicados y verificados; en ese momento, la trazabilidad V45 seguía pendiente. V57 la reconcilió; la fuente canónica aún falta. |
| V55 | Auditoría de funciones en `public` y ruta de recuperación revisadas en solo lectura; sin cambios de esquema ni backup/restore. |
| V56 | Ensayo de recuperación autorizado; bloqueado por falta de PostgreSQL 17/Supabase CLI/Docker en el entorno. No se creó dump ni se restauró. |
| V57 | Procedencia de V45 confirmada con blob de GitHub, historial de migraciones y logs PostgreSQL. Sin SQL ni cambios en STAGING; archivo ejecutable canónico y recuperación siguen pendientes. |
| V58+ | Backend/Auth real, prueba de recuperación aislada, defaults restantes y publicación autorizada pendientes. |

Archivos reproducibles: `tests/v53-rls-runtime.test.sql`, `staging/v53-rls-runtime.review.json`, y migración V53 en `supabase/migrations/`.

Registro V57 detallado: `docs/V57-TRAZABILIDAD-V45.md`.
