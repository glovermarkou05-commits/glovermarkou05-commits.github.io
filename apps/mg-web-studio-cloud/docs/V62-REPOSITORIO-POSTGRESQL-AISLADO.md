# MG WEB STUDIO CLOUD — V62 | Repositorio PostgreSQL aislado

**Rama:** feature/mg-digital-v5-web-services  
**Estado:** código y pruebas locales, sin integración de red ni instalación en STAGING. Producción/publicación: NO GO.

## Resultado verificable

Se añadió server/pg-tenant-repository.cjs, adaptador CommonJS diseñado para suministrar al autorizador V61 cuatro búsquedas de datos de V45:

| Método | Tabla PostgreSQL V45 | Clave de búsqueda |
| --- | --- | --- |
| getOrganization | public.mg_organizations | id |
| getSite | public.mg_sites | id |
| getMembership | public.mg_memberships | user_id + organization_id |
| getSiteScope | public.mg_membership_site_scopes | user_id + organization_id + site_id |

El adaptador utiliza SELECT con parámetros $1, $2 y $3 tipados como uuid; las tablas son identificadores constantes en el código, nunca suministrados por cliente. Los resultados deben coincidir con claves, tipos y nombres de campos esperados; errores de integridad se rechazan. El módulo no almacena autorizaciones positivas entre peticiones y no incluye funciones de escritura, cliente pg, credenciales, variables de entorno, conexiones ni endpoints HTTP.

La construcción requiere inyectar expresamente una función query compatible con el contrato query({text, values}) => {rows}. Sin esa inyección no hay acceso a base de datos. Esta inyección aún no está implementada con pg ni ha sido probada contra PostgreSQL real.

## QA realizado en el entorno aislado del agente

Comando desde apps/mg-web-studio-cloud:

    node --test tests/pg-tenant-repository-v62.test.cjs tests/pg-tenant-v62-integration.test.cjs

**32/32 tests correctos, cero fallos**, con Node 22.16.0:

- 23 pruebas del repositorio: sentencias SELECT fijas, parámetros UUID, formato V45, filas duplicadas, resultados faltantes o falsificados, errores, revocación en consultas sucesivas, aislamiento y concurrencia.
- 9 pruebas de integración simulada entre el código V60/V61 y V62: autorización de editor, rechazo previo a consulta, bloqueos entre empresas, publicación denegada, revocación, retiro de scope, errores 503 y aislamiento de identidad.
- Los verificadores de acceso y respuestas de PostgreSQL **son simulados**. Estas pruebas NO demuestran uso de SSL, conexión real, Auth/JWT real, RLS efectivo, MFA, transacciones, backup/restore ni cumplimiento de rendimiento.

## Límites estrictos

1. **Nada se conecta automáticamente.** No se creó un pool de conexiones, no se instaló pg ni se leyó DATABASE_URL. Una conexión de PostgreSQL debe configurarse únicamente en servidor y sobre un destino autorizado.
2. El driver de producción deberá imponer validación de TLS/certificado según el proveedor, tiempos máximos de conexión y consultas, límite de recursos, credenciales separadas y un rol PostgreSQL dedicado de solo lectura y mínimo privilegio. No utilizar postgres administrador ni service_role como permiso por defecto.
3. **RLS/GRANT debe verificarse con el rol efectivo del servidor.** La aplicación no podrá confiar exclusivamente en RLS si el rol elegido omite sus políticas o carece de claims adecuados. El contrato V61 sigue siendo un control en aplicación, no una política RLS.
4. **La revocación probada solo cubre lecturas sucesivas simuladas.** Consultas separadas admiten carreras entre verificación y mutación; cuando existan escrituras, se deberá comprobar pertenencia y privilegios en la misma transacción que la operación y repetir la validación antes de devolver replays de idempotencia.
5. La operación seleccionada (read/edit/publish/etc.) debe fijarse por el código del endpoint, no confiar en un campo del navegador. El control del recurso individual (página, propuesta, medios) aún no existe.
6. Las claves UUID con formato inválido devuelven ausencia sin ejecutar la función query. Esto es una defensa adicional, no sustituye validación de rutas y límites HTTP.
7. V62 no ejecutó SQL remoto, migraciones, operaciones de Supabase ni pruebas de recuperación. El respaldo/restauración aislada siguen pendientes; el disco C: del usuario tenía 2,6 GB libres según la última evidencia, no es una medida actual.

## Continuidad V63 propuesta

Preparar una **frontera HTTP aislada**: detección de Authorization duplicada antes de normalizarla, esquema estricto por ruta, límites de solicitud y errores sanitizados; se mantendrá simulada, sin escuchar puertos ni tocar STAGING, hasta autorizar integración real. Separar posterior validación Auth/JWT/MFA, permisos de base y recuperación antes de cualquier publicación.

## Referencias técnicas internas

- V45: db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt, estructura aplicada históricamente a STAGING según V57.
- V60: server/auth-boundary.cjs.
- V61: server/tenant-authorization.cjs.
- Código V62: server/pg-tenant-repository.cjs.
- Pruebas V62: tests/pg-tenant-repository-v62.test.cjs y tests/pg-tenant-v62-integration.test.cjs.

**Dictamen:** V62 desarrollada y probada con datos sintéticos; falta validación PostgreSQL real y política de conexión del futuro backend. NO GO para backend productivo, SQL adicional y publicación.
