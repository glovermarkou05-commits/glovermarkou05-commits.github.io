# MG WEB STUDIO CLOUD — V51 | Paquete de validación PostgreSQL 17

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Base:** V45 SQL blob `135ff2c25d935d87e5c8e9e0f9189705cd40b411`  
**Estado:** **PLAN PREPARADO; CERO EJECUCIONES.** V51 convierte los bloqueos de V46–V50 en una secuencia de aceptación para un destino PostgreSQL aislado. No constituye aprobación para usar STAGING.

## Alcance

**Dato de preflight leído en Supabase:** proyecto `MG WEB STUDIO CLOUD - STAGING`, ID `yefcgjtovfnsqtdjdsod`, estado `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.003`, región `sa-east-1`. Este inventario de control no abrió conexión a la base ni autoriza SQL. El proyecto sigue necesitando confirmación de aislamiento y autorización específica antes de usarlo.

El paquete especifica el orden y las evidencias mínimas para validar PostgreSQL 17, privilegios/RLS, los candidatos de índice de V50 y recuperación. Los scripts de catálogo de V45 son borradores; las pruebas de roles, EXPLAIN ANALYZE y restauración siguen pendientes. Ninguna evidencia está marcada como completada por esta etapa.

## Secuencia de ejecución futura

| Puerta | Evidencia que debe producirse | Condición de aprobación |
|---|---|---|
| **P51-01 — Identidad y aislamiento** | Confirmar por lectura el ID del proyecto, versión PostgreSQL, región, branch/ref y que el destino no es producción; registrar el hash exacto V45. | Destino aislado identificado y autorización específica vigente para ese destino. Si el destino es STAGING compartido, detenerse hasta recibir aprobación explícita. |
| **P51-02 — Instalación PostgreSQL** | Ejecutar V45 solo en la base aislada expresamente autorizada; capturar resultado transaccional y versión del servidor. | Parseo/aplicación sin error; tablas y políticas esperadas; la transacción falla completa si hay error. Este paso requiere aprobación DDL. |
| **P51-03 — Catálogo y ACL** | Aplicar la consulta de verificación V45 en modo de solo lectura; exportar propietario efectivo, grants actuales y por defecto, RLS, políticas, secuencias y funciones. | Sin privilegios de navegador inesperados; revisar por separado los defaults de `postgres` y `supabase_admin`. No inferir que V45 arregla defaults futuros. |
| **P51-04 — Matriz RLS** | Ejecutar casos pgTAP o equivalentes como `anon`, dos usuarios de organizaciones distintas, miembro sin alcance, editor, lector, propietario, administrador y destinatario/no destinatario. | Para las 16 tablas: filas permitidas y denegadas documentadas; ninguna lectura cruzada entre tenants; recibos/notificaciones solo para su destinatario; tablas privadas fuera del navegador. |
| **P51-05 — Rol de servidor** | Validar que los permisos de `service_role` son de servidor y que cada endpoint comprueba usuario, organización y sitio antes de leer/escribir. | RLS bypass registrado como propiedad del rol; la autorización de aplicación se prueba aparte. No usar `service_role` como evidencia de aislamiento RLS. |
| **P51-06 — Índices y planes** | En datos sintéticos aislados, comparar consultas de lectura con filtros RLS y operaciones FK usando `EXPLAIN (ANALYZE, BUFFERS)`; guardar plan, filas, buffers y tamaño de índices antes/después de candidatos V50. | Recomendar solo índices cuyo plan y carga los justifique; registrar coste de escritura/almacenamiento y no añadir los diez por defecto. Las pruebas con ANALYZE ejecutan consultas y requieren aprobación específica. |
| **P51-07 — Recuperación** | Definir responsable, retención, RPO/RTO, cifrado, destino independiente; tomar respaldo sintético y restaurarlo en destino aislado; comparar integridad y permisos. | Restauración íntegra y tiempos observados dentro del objetivo aprobado. La política V48 sigue sin aprobación; no restaurar el proyecto actual ni producción. |

## Evidencias que deben conservarse

- Hash del SQL, proyecto/ref exactos, versión Postgres y timestamp UTC.
- Resultado de instalación, consulta de catálogo y suite pgTAP.
- Identidad/rol de ejecución y matriz de fixtures sintéticos, sin secretos ni datos reales.
- Planes EXPLAIN y mediciones de buffers/filas para candidatos V50.
- ID y ubicación aislada del respaldo, manifiesto de contenido, checksum y acta de restore.
- Aprobaciones separadas para consultas, DDL, respaldo/restauración y cualquier despliegue.

## Criterio final NO GO / GO

**NO GO** mientras falte autorización de destino, haya grants/default ACL no explicados, falle una fila denegada, se observe fuga cross-tenant, no se valide el backend que usa `service_role`, falte la política de recuperación o no exista restore aislado comprobado.

Solo el responsable del proyecto puede declarar **GO para la siguiente etapa** después de revisar las evidencias. Esto no autoriza producción ni publicación.

## Estado registrado

- V46: 72/72 comprobaciones estáticas reportadas; sin QA PostgreSQL runtime ni restauración.
- V47: 8/8 pruebas locales.
- V48: recuperación documentada; owner, retención, RPO/RTO y destino pendientes.
- V49: revisión estática RLS; sin prueba runtime.
- V50: 4/4 pruebas estáticas; 10 FKs y un filtro RLS requieren evaluación por planes.
- **V51: protocolo y pruebas del protocolo listos; 0 conexiones, 0 SQL, 0 migraciones, 0 restauraciones.**
- **Estado general: NO GO** para instalación en STAGING, restauración o producción.

**Próximo movimiento seguro:** revisión del paquete y de las autorizaciones necesarias para un destino aislado. No ejecutar estas puertas automáticamente por aprobar este documento.
