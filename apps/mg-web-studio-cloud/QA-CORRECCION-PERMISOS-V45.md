# MG WEB STUDIO CLOUD — V45 | Corrección segura de privilegios y control de acceso

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Destino futuro:** MG WEB STUDIO CLOUD - STAGING; **ningún SQL ejecutado en V45**.  
**Dictamen:** **Borrador de instalación corregido y revisado estáticamente. PostgreSQL / RLS real / recuperación / producción: NO GO.**

## 1. Hallazgo real que motivó V45

La etapa V44 leyó el catálogo de un proyecto nuevo de Supabase y encontró **seis filas de privilegios predeterminados en `public`**, repartidas entre dos roles creadores: **`postgres`** y **`supabase_admin`**. Ambos contemplan concesiones para `anon`, `authenticated` y `service_role` sobre futuros objetos. El diagnóstico PostgreSQL fue real, pero R02 (dueño del esquema) no tuvo un resultado recuperable.

La propuesta V42 introducía cuatro cambios `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`. Suponer que esos cuatro cambios resolvían **todos** los permisos predeterminados era incorrecto: los defaults de `supabase_admin` son independientes y forman parte de la configuración administrada de Supabase.

Además, PostgreSQL explica que los permisos globales no pueden quitarse mediante un `REVOKE` limitado a un esquema. Es necesario diferenciar los defaults globales y los específicos y verificar cada rol creador antes de hacer cambios persistentes.

Fuentes:
- [Supabase — Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [PostgreSQL — ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)

## 2. Corrección preparada

Nuevo SQL: **`db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt`**.

**Correcciones incluidas:**

1. **Eliminé las cuatro instrucciones `ALTER DEFAULT PRIVILEGES` de la propuesta de instalación.** El nuevo borrador no cambia los privilegios futuros de `postgres` ni `supabase_admin` y no puede afectar de forma general a futuros objetos de la plataforma. Esto no elimina por sí mismo la configuración preexistente de defaults.
2. **Conservé una sola transacción** para crear las 16 tablas, habilitar RLS para cada una y ajustar sus permisos mediante `REVOKE` y `GRANT` explícitos sobre los objetos de MG. La atomicidad evita que *estas* tablas queden confirmadas sin sus revocaciones y políticas si la transacción falla antes de `COMMIT`.
3. **Conservé 12 políticas de lectura**, sin conceder operaciones directas de escritura a `anon` o `authenticated`.
4. **Protegí el esquema privado `mg_private`** con revocaciones de acceso al esquema y de permisos sobre sus secuencias y funciones existentes, sin modificar otros esquemas.
5. **Mantuve las restricciones de negocio V42:** FK en auditoría, unicidad de eventos del outbox y notificaciones, rechazo de `published` hasta validar Home bajo concurrencia.
6. **Creé un borrador de auditoría posterior:** `db/v45-drafts/VERIFY_SCOPED_ACL.review.sql.txt`, con cinco consultas de catálogo de solo lectura para verificar los permisos efectivos de las tablas y esquema privado, habilitación de RLS, política de acceso y defaults reales después de una instalación separadamente autorizada.

**Importante:** ambas propuestas contienen SQL, pero son archivos de revisión `.sql.txt` fuera del directorio de migraciones. **No deben copiarse al SQL Editor ni ejecutarse** con una aprobación general como «sigamos» o «corrígelo».

## 3. Qué se corrige y qué permanece pendiente

| Área | Estado del nuevo diseño |
|---|---|
| Riesgo de modificar defaults del rol administrado `supabase_admin` sin analizar impacto | **Evitado en el nuevo borrador** |
| RLS y permisos explícitos de las 16 tablas de MG | **Preparados para prueba real** |
| Privilegios de secuencias y funciones en el nuevo `mg_private` | **Revocaciones explícitas propuestas** |
| Permisos predeterminados sobre objetos **futuros** en `public` | **Siguen abiertos**: requieren decisión específica por propietario de objeto |
| Propietario efectivo del esquema `public` | **No confirmado**: recuperar R02 bajo un permiso puntual de lectura |
| PostgreSQL parser, permisos efectivos, RLS con dos tenants y MFA | **Sin pruebas reales** |
| Backup/restauración del proyecto Free | **Sin prueba real ni aprobación** |
| Instalación de la base o despliegue del backend | **No autorizados** |

Los defaults existentes para `postgres` y `supabase_admin` continúan tal como estaban. Esta corrección **mitiga la exposición de las 16 tablas previstas mediante controles por objeto**, pero no autoriza afirmar que «todo Supabase ya es seguro» ni que futuras migraciones creen objetos cerrados automáticamente. Cada migración nueva debe integrar RLS, `REVOKE`, `GRANT` mínimo y una comprobación real de permisos, o requerirá otra política de defaults autorizada.

La función `service_role` elude RLS: sus credenciales deberán permanecer únicamente en backend y sus acciones deberán comprobar actor/empresa/rol/MFA. Las políticas propuestas no sustituyen esa validación.

## 4. Pruebas y trazabilidad

- **49/49** comprobaciones estáticas V45 superadas en un arnés JavaScript en memoria, incluyendo **22 alteraciones adversas** que intentan reintroducir permisos predeterminados indiscriminados, acceso `anon`, escritura desde navegador, eliminación de RLS, políticas faltantes, cambios de estado o pérdida de la transacción única.
- Los borradores históricos V42 permanecen intactos y se conservan como referencia; **V42 queda sustituido como candidato de instalación por V45**, pero ninguno está aprobado para ejecución.
- La fuente V44 mantiene el dato incompleto de R02; no se inventó su resultado.
- **Cero ejecuciones SQL en V45, cero migraciones, cero despliegues y cero pruebas reales de recuperación**.

## 5. Paso para poder instalar sin crear riesgos nuevos

1. Obtener por autorización específica la propiedad del esquema `public` y revisar los default ACL por rol; **no efectuar revocaciones generales a `supabase_admin`** de forma automática.
2. Acordar quién administra el backup cifrado y ensayar una recuperación con datos sintéticos en un destino aislado, antes de aplicar cambios irreversibles.
3. Revisar y autorizar por separado el SQL **V45 exacto** y destino STAGING. Su hash en GitHub se encuentra en `staging/v45-permission-correction.review.json`.
4. Ejecutar PostgreSQL y verificar la política RLS/privilegios en la base realmente creada con `anon`, `authenticated`, roles de prueba y `service_role` solo del servidor, incluyendo comparación de resultados de las cinco consultas V45.
5. Solicitar permisos diferentes para backend, workers y producción.

**Límites conservados:** no se modifica `main`, FINZY, BAZAR ONLINE, otras bases de datos, Lovable, pagos ni producción. **STAGING y producción siguen NO GO para instalar el diseño nuevo hasta autorización explícita.**
