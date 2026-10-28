# MG WEB STUDIO CLOUD — V86 | Pruebas REALES SQL de aislamiento multiempresa y multisucursal

**Fecha Ecuador:** 27/10/2026 (ejecución GitHub Actions registrada 28/10/2026 UTC)  
**Rama:** `feature/mg-digital-v5-web-services`  
**Autorización:** el usuario autorizó expresamente ambas operaciones: **(1)** datos de prueba enteramente ficticios de dos empresas y roles en PostgreSQL 17 temporal; **(2)** consultas SQL para validar RLS, aislamiento entre empresas y permisos. Las autorizaciones no alcanzan conexiones de red HTTP, Supabase, BAZAR-ONLINE, restore, MFA real ni producción.

## 1. Evidencia real verificada

- **GitHub Actions:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40631943233
- **Job:** `122630105344`
- **Commit ejecutado:** `433ce68858b276f3b9bb5cb6f71a1aeac0f15065`
- **Resultado GitHub:** `completed / success`; todas las tareas del job exitosas.
- **Motor real iniciado:** `postgres (PostgreSQL) 17.11 (Debian 17.11-1.pgdg12+2)`.
- **Imagen Docker observada:** `sha256:99445113a4a19e82dd3713c65bd9f6fb5bf972065ab043df8d1e1c93e957da9a`. Ese ID es la imagen local observada en la ejecución, no un digest de manifiesto fijado permanentemente.
- **Aislamiento observado:** `network=none`, TCP desactivado (`listen_addresses=`), cero puertos publicados; SQL mediante `docker exec -i ... psql` usando el socket Unix local del contenedor.
- **Recursos:** 1 vCPU, 1.024 MiB RAM y 640 MiB almacenamiento tmpfs para PGDATA; raíz de contenedor solo lectura. Contenedor y almacenamiento volátil eliminados tras las pruebas.
- **Pruebas de contrato automáticas V86:** **21/21 PASS** y **0 FAIL**.

## 2. Fixtures enteramente ficticios

En `mg_v86.records` se crearon cuatro filas inventadas:

| ID | Empresa | Sucursal | Marcador |
| --- | --- | --- | --- |
| 1 | `DEMO-A` | `A-01` | `synthetic-a-first` |
| 2 | `DEMO-A` | `A-02` | `synthetic-a-second` |
| 3 | `DEMO-B` | `B-01` | `synthetic-b-first` |
| 4 | `DEMO-B` | `B-02` | `synthetic-b-second` |

Roles de prueba sin LOGIN, sin BYPASSRLS, sin permisos de administración: `mg_v86_tenant_a`, `mg_v86_tenant_b`, `mg_v86_guest`. El test utiliza `SET LOCAL ROLE` desde la sesión de bootstrap **solamente para comprobar cómo PostgreSQL aplica los roles, permisos y políticas**; **no prueba autenticación real ni MFA**.

## 3. Comprobaciones SQL reales registradas en el job

| Comprobación | Resultado del job |
| --- | --- |
| Tres roles sin privilegios de superusuario ni BYPASSRLS | PASS |
| RLS `ENABLE` y `FORCE` en la tabla de ensayo | PASS |
| Dos políticas de empresa y sucursal con `USING` y `WITH CHECK` | PASS |
| Rol A ve únicamente `DEMO-A/A-01` | PASS |
| Rol A puede modificar su fila y no puede leer, actualizar ni borrar filas de otra empresa/sucursal | PASS |
| Rol A no puede insertar una fila de empresa ajena o de sucursal no permitida | PASS |
| Rol A no puede cambiar su propia fila a otra empresa | PASS |
| Rol B ve únicamente `DEMO-B/B-01` | PASS |
| Rol B no puede leer/actualizar otra empresa ni insertar datos de otra empresa/sucursal | PASS |
| Rol invitado, con SELECT concedido pero sin política RLS, ve cero filas | PASS |
| Los cambios temporales del ensayo se revierten con `ROLLBACK` | PASS |
| Las cuatro filas originales siguen intactas | PASS |
| El contenedor efímero de PostgreSQL es eliminado al final del job | PASS |

Extractos de evidencia sanitizada del log:

```text
V86 AUDIT: roles=3 least_privilege=true; rls=enabled_forced; policies=2; synthetic_rows=4
V86 ROLE A: own_read_write=allowed; cross_tenant_read_write=denied; cross_site=denied
V86 ROLE B: own_read_write=allowed; cross_tenant_read_write=denied; cross_site=denied
V86 GUEST: default_denied=true
V86 COMPLETE: real SQL RLS isolation assertions passed; 4 fixtures unchanged
V86 CLEANUP VERIFIED: no container remains; tmpfs discarded
V86 FINAL CLEANUP: container absent
```

**Interpretación importante:** se verificó RLS real bajo identidades de rol de PostgreSQL, pero no un proveedor de autenticación con sesiones reales, ni peticiones HTTP, ni el conjunto de políticas de una instalación definitiva. Estas pruebas demuestran el modelo SQL de laboratorio, **no toda la superficie de autorización de MG WEB STUDIO CLOUD**.

## 4. Archivos del cambio

- `sql/v86-setup-synthetic-tenants.sql`: roles, tabla `mg_v86.records`, cuatro filas inventadas y políticas RLS.
- `sql/v86-verify-rls.sql`: comprobaciones SQL reales con `ON_ERROR_STOP`, resultados fail-closed, roles A/B/invitado, operaciones permitidas y prohibidas, tres `ROLLBACK` y comprobación de integridad.
- `scripts/run-v86-synthetic-rls.sh`: arranque PostgreSQL 17 sin TCP/red, ejecución exclusiva de los dos archivos SQL incluidos, límites de recursos, limpieza al salir.
- `tests/v86-synthetic-rls-contract.test.cjs`: 21 pruebas sintéticas/de contrato para seguridad de script y SQL.
- `.github/workflows/mg-web-studio-v86-pg17-synthetic-rls.yml`: ejecución en Ubuntu 24.04 alojado por GitHub, rama de desarrollo, permisos mínimos, sin publicación.

## 5. Proyectos y autorizaciones protegidas

**BAZAR-ONLINE:** no accedido, no modificado. Se utilizó solo un runner de GitHub desechable.  
**Supabase del usuario:** no conectado.  
**Laptop Windows:** ningún contenedor creado, ningún cambio de disco o WSL.  
**Lovable:** sin consumo de créditos.  
**Producción y rama main:** sin publicar ni desplegar desde este flujo V86.  
**MFA, autenticación de proveedor, HTTP, recuperación y restauración:** no ejecutados.

**Estado V67:** 32 controles operativos formalmente `PENDING`, **0 aprobaciones independientes**. La experiencia V86 puede contribuir a una futura revisión de `DATA-01` y `AUTH-02`, pero no completa por sí sola sus criterios, que exigen roles efectivos del sistema definitivo y flujo de identidad real.  
**Estado V78:** los permisos de operar en entornos reales siguen pendientes. Las autorizaciones del usuario para V85/V86 quedan limitadas a servicios y SQL sintéticos en runner temporal, sin abrir permisos genéricos de producción.  
**Decisión:** `V86_SYNTHETIC_SQL_RLS_EXECUTED`; `NO_GO` para validación integral V67 y publicación.

## 6. Camino crítico para continuar rápido

El siguiente bloque útil es obtener autorización independiente para **pruebas HTTP de parser en `127.0.0.1` dentro de un runner efímero**, mediante un listener exclusivamente local y limitación de carga; inicialmente validar `HTTP-01..14` sin interacción con la base de datos ni credenciales reales. Es un permiso **network** distinto de la autorización de SQL sintético de V86. Después quedan autenticación real de prueba (MFA/JWT), recuperación con backup ficticio aislado, políticas operativas y revisión independiente. Ninguna fase autoriza publicar el producto.
