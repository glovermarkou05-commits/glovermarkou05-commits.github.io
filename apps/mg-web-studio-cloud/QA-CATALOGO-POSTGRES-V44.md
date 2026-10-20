# MG WEB STUDIO CLOUD — V44 | Resultado real del diagnóstico PostgreSQL

**Fecha:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Destino exclusivamente consultado:** `MG WEB STUDIO CLOUD - STAGING`, São Paulo.  
**Dictamen:** **Diagnóstico real ejecutado; NO GO para aplicar V42, otras escrituras, desplegar o publicar.**

## 1. Alcance autorizado y ejecutado

El propietario autorizó continuar inmediatamente después de la pregunta específica sobre ejecutar las **siete consultas SELECT del V43**. Se comprobó antes de ejecutarlas que:

- El proyecto Supabase es el STAGING correcto y está `ACTIVE_HEALTHY`.
- El archivo de GitHub permanece idéntico al hash previamente fijado: `b66d015f5fc21b3b43f36bb046192191f1a67d97`.
- El archivo contiene siete SELECT de catálogo sin DML, DDL ni funciones destructivas.

**Se enviaron exactamente siete SELECT independientes**, uno por cada R01–R07. No se ejecutaron `BEGIN` ni `ROLLBACK` del borrador V43, porque cada SELECT se ejecutó por separado mediante el conector. Por ello **no deben interpretarse como una instantánea consistente de una única transacción `REPEATABLE READ`**. No se creó ningún objeto ni se modificaron permisos o datos.

## 2. Resultados reales

| Consulta | Estado | Resultado |
|---|---|---|
| R01, versión y sesión | Ejecutada y recuperada | PostgreSQL **17.11**, `current_user=postgres`, `session_user=postgres` |
| R02, propietarios de esquemas | **Ejecutada, salida no recuperada** | Falló el intérprete local del formato devuelto por el conector; no se volvió a consultar |
| R03, `pg_default_acl` | Ejecutada y recuperada | **6 entradas**, tres para `postgres` y tres para `supabase_admin` en `public` |
| R04, roles relevantes | Ejecutada y recuperada | `postgres` y `service_role`: `bypassrls=true`; `anon` y `authenticated`: `bypassrls=false` |
| R05, objetos `mg_*` y `mg_private` | Ejecutada y recuperada | **0** |
| R06, funciones `mg_*` | Ejecutada y recuperada | **0** |
| R07, tablas de usuario en `public` | Ejecutada y recuperada | **0** |

El rol `postgres` puede iniciar sesión en PostgreSQL según el catálogo; el diagnóstico no divulgó contraseñas ni credenciales.

**Limitación R02:** el problema ocurrió después de enviar el SELECT al interpretar el envoltorio de datos del conector. No hubo evidencia de error SQL; se marcó como **resultado no recuperado**, sin declarar que se conoce el propietario de `public` o `mg_private`. No se repitió para respetar la autorización de siete consultas.

## 3. Riesgo crítico real: permisos de objetos nuevos

R03 encontró para **ambos roles creadores** (`postgres` y `supabase_admin`) privilegios predeterminados en `public` que incluyen `anon`, `authenticated` y `service_role`:

- Tipo `r`, tablas: privilegios amplios de lectura/escritura definidos por el catálogo.
- Tipo `f`, funciones: concesiones `EXECUTE`.
- Tipo `S`, secuencias: concesiones de uso/acceso.

Esto **no prueba exposición actual de datos de la aplicación**: todavía no hay tablas MG en `public`. Es una advertencia seria sobre permisos que podrían heredarse al crear objetos nuevos.

**Consecuencia técnica:** la V42 no debe aplicarse tal como está. Solo revoca privilegios predeterminados para el creador supuesto `postgres`; la configuración de `supabase_admin` también existe. No se deben revocar permisos de `supabase_admin` indiscriminadamente sin revisar dependencias y comportamiento de los servicios administrados de Supabase. Se necesitan decisiones basadas en propietarios, permisos realmente efectivos y pruebas de roles.

La lista R03 consultó valores de esquema `public` y de defaults globales; **no devolvió entradas globales**. Eso no significa que una política futura de seguridad deba ignorar defaults de otros roles/esquemas.

## 4. Verificación posterior y restricciones

Al finalizar se repitieron **solo consultas de metadatos de la plataforma**, que confirmaron:

- STAGING: `ACTIVE_HEALTHY` en `sa-east-1`.
- Tablas de usuario del esquema `public`: **0**.
- Migraciones registradas: **0**.

No se consultaron filas de clientes, credenciales o datos personales; no se ejecutó SQL DDL/DML ni se modificaron `main`, Lovable, otros proyectos, pagos o despliegues. **No hay prueba de backup/restore ni pruebas de RLS con usuarios reales.**

## 5. Siguiente corrección recomendada (V45)

1. **Recuperar el dato faltante de propietarios de esquema** con aprobación separada para una consulta puntual de solo lectura (o mecanismo de metadatos equivalente).
2. Revisar dependencias de `pg_default_acl` para los dos creadores observados y los privilegios reales sobre objetos del STAGING, sin modificar cuentas administradas sin revisión.
3. **Corregir en GitHub el borrador V42**, dejando una nueva versión fijada por hash, con permisos seguros para objetos futuros y pruebas negativas.
4. Formalizar el respaldo/restauración con datos ficticios en ambiente independiente; no existe evidencia de recuperación real.
5. Solicitar después autorización específica para el **SQL DDL exacto**, seguida de validación PostgreSQL/RLS, seguridad multiempresa y recuperación. Mantener producción en `NO GO`.

**Avance general:** el proyecto aislado existe, pero las 16 tablas propuestas todavía no están instaladas; el plan maestro mantiene **8 bloques operativos obligatorios pendientes**. El diagnóstico V44 es la primera comprobación real del catálogo, no la instalación de la aplicación.

## 6. Trazabilidad

- Entrada: `db/v43-drafts/CATALOG_ONLY_SELECT.review.sql.txt`.
- Evidencia derivada: `staging/v44-real-catalog-observations.review.json`.
- Informe: `QA-CATALOGO-POSTGRES-V44.md`.

Los resultados públicos están resumidos; no se añadieron volcados completos del catálogo ni información de conexión al repositorio.
