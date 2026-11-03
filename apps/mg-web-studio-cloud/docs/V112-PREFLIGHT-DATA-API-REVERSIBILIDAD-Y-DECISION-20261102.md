# MG WEB STUDIO CLOUD · V112 | Auditoría previa a DDL, Data API y reversión controlada

**Corte de trabajo:** 2026-11-02 en Ecuador (los jobs en GitHub reportan 2026-11-03 UTC).  
**Estado:** `PREFLIGHT_AND_ROLLBACK_PG17_VERIFIED` / `SUPABASE_DDL_NOT_AUTHORIZED`.  
**Alcance real:** auditoría de solo lectura del Supabase `MG WEB STUDIO AUTH QA`; propuesta de reversión y **11 pruebas PG17** ejecutadas exclusivamente en contenedor temporal. **No se desplegó SQL ni se añadieron roles, datos, políticas, funciones o usuarios al Supabase real.**

## 1. Alcance y evidencias del ambiente QA

`get_project`: proyecto MG WEB STUDIO AUTH QA `ACTIVE_HEALTHY`, región `sa-east-1`. PostgreSQL indicó versión **17.11** al consultar el catálogo.

Una sola consulta SELECT de metadatos `pg_namespace`, `pg_roles`, `pg_class` y `current_setting` devolvió:

| Objeto / señal | Resultado observado |
| --- | --- |
| Existe esquema `mg_auth_ledger` | `false` |
| Existe rol `mg_auth_ledger_writer` | `false` |
| Existe tabla `mg_auth_ledger.mfa_redemptions` | `false` |
| `current_setting('pgrst.db_schemas', true)` | `null` / no visible en esta conexión |
| Versión PostgreSQL | `17.11` |

**Interpretación:** no hay conflicto de nombres de esos tres objetos en el QA consultado. La lectura `null` de `pgrst.db_schemas` **NO prueba** que `mg_auth_ledger` esté fuera de los esquemas expuestos en la Data API. **Es obligatorio revisar visualmente** la lista de esquemas expuestos en la configuración de Supabase antes y después de aplicar DDL. La documentación [Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas) explica que la exposición requiere configurar el esquema en el API y privilegios. Por defecto `public` es expuesto.

V110+V111 permanecen como **archivos `proposals/`** para revisión. No se deben mover a `migrations/` ni aplicar por automatismos antes de que exista una decisión documentada de seguridad.

## 2. Hallazgo: modelo real de conexión backend todavía incompleto

**V111 PASS 12/12 PG17** demostró con `SET ROLE` desde el superusuario de un contenedor efímero que `mg_auth_ledger_writer` puede realizar únicamente `INSERT` y no `SELECT`, `UPDATE`, `DELETE` ni `TRUNCATE`. El rol se creó `NOLOGIN`.

Esto **no significa** que el backend pueda conectarse como ese rol a Supabase. La futura arquitectura exige que DBA y Seguridad acuerden:

1. Cómo obtiene el **principal backend confiable** el permiso de usar `mg_auth_ledger_writer` sin exponer usuario/contraseña de base de datos en un frontend, SDK público o GitHub.
2. Si se permite una conexión directa privada a PostgreSQL; configuración TLS, pool, rotación de credenciales, límites de conexiones y registro de accesos.
3. Cómo se evitan membresías del escritor en `anon`, `authenticated` y `service_role` u otros roles compartidos.
4. Cómo proteger la base del escritor ante un backend comprometido: `FOR INSERT WITH CHECK (true)` **no corrobora JWT, permiso comercial, MFA ni sesión**. Es una puerta de escritura para un proceso privilegiado.
5. Cómo coordinar una sesión vigente comprobada en origen autoritativo y la transacción final de negocio (publish/members/billing). **No crear funciones `SECURITY DEFINER` para rodear permisos de `auth.sessions`.**
6. Cómo registrar, sin exponer JWT/OTP/secretos, que un evento fue consumido con commit confirmado; tratar `23505` como denegación y timeout de commit como resultado incierto, siempre fail-closed.

## 3. V112: reversión protegida, SOLO EN CI

Archivo de revisión `proposals/v112-rollback-guarded-review-only.sql`, **no es migración**, **no se aplicó a QA**.

Comportamiento previsto: `BEGIN`, validar objetos esperados, bloquear si existen eventos MFA, objetos extra (tablas/rutinas) o cualquier membresía del rol escritor, y únicamente entonces retirar política, grants, tabla, esquema y rol con `DROP ... RESTRICT`. Nunca `CASCADE`, no tocar usuarios Auth ni roles `anon/authenticated/service_role`, ni borrar objetos de productos ajenos.

**Límite:** incluso una tabla vacía no garantiza que la reversión sea segura si hay transacciones en vuelo o dependencias de negocio. En un entorno real deberá desconectarse primero el backend escritor, aprobarse retención/respaldos, inspeccionarse dependencias y ejecutarse exclusivamente con autorización del responsable. El script no automatiza eliminación en Supabase.

### Pruebas de GitHub

- Suite: `tests/v112-guarded-rollback-pg17.test.cjs`.
- Workflow: `.github/workflows/mg-web-studio-v112-rollback-pg17-disposable.yml`.
- Resultado: [GitHub Actions #41574504278](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41574504278) — **11/11 PASS, 0 FAIL**.
- Entorno: `postgres:17` desechable, roles `anon/authenticated/service_role` creados **solo en CI**, más propuestas V110 y V111 aplicadas **solo allí**. No hay credenciales Supabase ni conexiones reales.

La suite confirmó:
1. PostgreSQL 17 local y ausencia de claves/conexiones de producción.
2. Existencia de esquema, rol y tabla esperados.
3. Roles públicos sin `USAGE` en el esquema privado.
4. Una fila existente impide rollback y no se pierde.
5. Una tabla extra impide rollback.
6. Una función extra impide rollback.
7. Una membresía del rol escritor impide rollback.
8. Solo con tabla vacía y sin dependencias extra se desinstalan los tres objetos previstos.
9. Los roles externos `anon/authenticated/service_role` siguen intactos.
10. Intento de ejecutar rollback de nuevo se rechaza, no crea objetos.
11. No hay `CASCADE`, modificaciones `auth.*`, credenciales ni acceso a recursos externos.

Todos esos casos aprobaron **solo en una base descartable**; no constituyen ensayo de rollback con un servicio comercial real.

## 4. Matriz de preparación para aplicar en Supabase QA

| Puerta | Requisito | Estado |
| --- | --- | --- |
| G112-01 | Proyecto QA activo y nombres V110/V111 libres | **VERIFICADO** |
| G112-02 | Contrato y RLS mínimo probados con PostgreSQL17 | **VERIFICADO EN CI** |
| G112-03 | Rollback con guarda probado en PostgreSQL17 | **11/11 PASS CI** |
| G112-04 | Verificación visual de **Exposed schemas** (Data API) y settings de API | **PENDIENTE** |
| G112-05 | Decisión de DBA/Seguridad sobre rol `NOLOGIN`, identidad backend, grants y custodia de secretos | **PENDIENTE** |
| G112-06 | Revisión de riesgos `WITH CHECK(true)`, DoS, tasa, retención y auditoría | **PENDIENTE** |
| G112-07 | Aprobación **específica del propietario** para crear esquema/tabla/rol/política **solo** en `MG WEB STUDIO AUTH QA` | **NO OTORGADA** |
| G112-08 | Plan de respaldos, corte de escritor, inspección de dependencias y rollback seguro | **DISEÑADO, SIN VALIDAR EN QA** |
| G112-09 | Prueba real contra QA, role principal autorizado y dos transacciones independientes | **NO EJECUTADA** |
| G112-10 | Sesión revocada + transacción de negocio idempotente + revisión humana independiente | **NO RESUELTA** |

**Recomendación:** `NO_GO` para DDL sobre Supabase hasta cerrar G112-04 a G112-08. El usuario puede autorizar la preparación y la eventual instalación, pero ello **no sustituye revisión técnica del DBA y verificación de Data API**. No conceder accesos internos `auth.sessions`, ni publicar producción.

## 5. Decisión siguiente

Una vez revisadas la lista de esquemas expuestos de Data API y el modelo de conexión privada, solicitar autorización específica y acotada para el **DDL V110+V111, únicamente en el proyecto Auth QA** y con rollback preparado. No ejecutar `DROP` en un entorno real salvo aprobación separada ante un incidente.

El laboratorio conserva la identidad QA V107 ya limpiada (V108). **No repetir el ensayo TOTP real por esta fase**. El [PR #7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) permanece draft, la [incidencia #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) aún requiere una revisión humana independiente, **V67 sigue 32 PENDING / 0 PASS y producción NO_GO**.
