# MG WEB STUDIO CLOUD — V90 | Respaldo y recuperación reales en PostgreSQL 17, datos ficticios

**Fecha Ecuador:** 28 de octubre de 2026  
**Rama de desarrollo:** `feature/mg-digital-v5-web-services`  
**Autorización explícita del usuario:** respaldo y restauración **exclusivamente entre dos bases PostgreSQL 17 efímeras** con datos totalmente ficticios en GitHub Actions. No autorizó acceder a copias reales, servicios Supabase, BAZAR-ONLINE, red externa ni producción.

## 1. Ejecución y resultado confirmado

**GitHub Actions — resultado `completed / success`:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40640914974  
**Job:** `122658586840`  
**Commit probado:** `aabb446aeaec44beb235bcd9af34a93419a4ebc6`  
**Motor real:** `postgres (PostgreSQL) 17.11 (Debian 17.11-1.pgdg12+2)` en dos contenedores independientes del runner Ubuntu 24.04.

| Prueba o dato observado | Resultado |
| --- | --- |
| Contratos V90 de seguridad, alcance y limpieza | **22/22 PASS, cero fallos** |
| Contenedores PostgreSQL reales | **2**, origen y destino |
| Aislamiento de ambos | **`--network none`**, sin puertos publicados, `listen_addresses=` vacío y SQL solo por socket Unix |
| Recursos por contenedor | 1 vCPU, 1 GiB RAM, 640 MiB PGDATA en tmpfs, raíz de solo lectura |
| Datos ficticios | **2 empresas, 4 sucursales, 4 filas** |
| Roles de ensayo | **3**, `NOLOGIN`, sin `BYPASSRLS` |
| Políticas RLS | **2**; `ENABLE` + `FORCE` |
| Archivo `pg_dump -Fc` | **4.101 bytes**, cabecera `PGDMP` comprobada |
| SHA-256 del respaldo transitorio | `2da32a610588fd7cbff2182651fecd2228ba5351e4853fe51e0091e53c7c6c7e` |
| Restauración | **`pg_restore -Fc --single-transaction --exit-on-error --no-owner`**, completada |
| V86 SQL repetido en la base restaurada | **PASS**, incluyendo permisos y operaciones RLS permitidas/denegadas |
| Comparación canonizada de origen y destino | **Igualdad exacta mediante `cmp -s`** |
| SHA-256 de la instantánea canonizada | `465ad76cdf7cbc868a0b65c6acb272a813e2c0d05a62d4bdabf61790e139b971` |
| Muestra de duración de `pg_dump` | **99 ms** |
| Muestra de duración de `pg_restore` | **68 ms** |
| Eliminación del respaldo y contenedores | **Verificada**, ambos ausentes al terminar |

Las duraciones anteriores miden únicamente los comandos de volcado y restauración de **cuatro filas ficticias**, no incluyen planificación, aprovisionamiento, comprobaciones ni conmutación operativa. **No representan RPO/RTO empresariales**.

## 2. Qué se recuperó y verificó de verdad

La base de origen se inicializó con el SQL V86, que define dos empresas inventadas (`DEMO-A`, `DEMO-B`), cuatro sucursales ficticias, una tabla `mg_v86.records`, índice de clave primaria, roles y políticas RLS por empresa/sucursal. Se ejecutaron las comprobaciones SQL V86 **antes del respaldo**.

Luego se generó un archivo **custom-format** de PostgreSQL con `pg_dump -Fc` desde el contenedor de origen, dentro del runner GitHub. En un **segundo clúster aislado**, se crearon explícitamente tres roles ficticios de prerrequisito, porque `pg_dump` de una base **no incluye roles globales**. Se restauró el respaldo sobre la base vacía con `pg_restore` en una sola transacción, interrumpiendo por cualquier error.

Después se ejecutaron las pruebas SQL V86 **en la base restaurada**, que comprobaron aislamiento, prohibición de escritura interempresa, permisos del rol invitado y reversión de cambios de prueba.

Además, una consulta SQL canónica de **solo lectura** generó una instantánea por clúster; la comparación cubrió:
- Las cuatro filas ficticias y sus valores.
- Indicadores RLS y FORCE RLS de la tabla.
- Columnas, tipos, nulabilidad y restricciones.
- Definiciones de índices, políticas RLS, expresiones `USING` y `WITH CHECK`.
- Atributos de roles y privilegios efectivos de esquema/tabla.
- Extensiones **presentes** de la base, incluyendo extensiones predeterminadas. **No** se creó ni se probó la restauración de una extensión no estándar.

La igualdad de ambas instantáneas confirma fidelidad de estos elementos **para este fixture reducido**, no una certificación general para un esquema comercial más complejo.

## 3. Limpieza, confidencialidad y límites de seguridad

Los dos contenedores utilizaron `--network none`, sin TCP ni puertos publicados. Los datos de base se mantuvieron en sistemas `tmpfs` efímeros y las contraseñas aleatorias fueron exclusivamente de laboratorio, sin publicarse.

El archivo de respaldo transitorio existió **solo** en una carpeta de `RUNNER_TEMP` durante el job, con `umask 077`; no se subió como artefacto ni se añadió al repositorio. La limpieza explícita borró el archivo y eliminó ambos contenedores, y se verificó la ausencia de estos al finalizar. Esto **no** equivale a demostrar borrado criptográfico o cifrado del backup; los datos eran enteramente ficticios y el runner se descarta.

**No se ejecutó nada en la laptop**, Docker/WSL local, BAZAR-ONLINE, Supabase, FINZY, Lovable, `main` ni infraestructura productiva.

## 4. Archivos creados para V90

- `sql/v90-target-roles-only.sql`: los tres roles ficticios, separados del respaldo de base.
- `sql/v90-canonical-snapshot.sql`: lectura canonizada de filas, restricciones, índices, RLS, roles, permisos y extensiones.
- `scripts/run-v90-pg17-synthetic-restore.sh`: validación de autorización/rama, aislamiento Docker, carga V86, `pg_dump`, `pg_restore`, comparación y limpieza en `EXIT`.
- `tests/v90-pg17-restore-contract.test.cjs`: 22 contratos que prohíben ejecución fuera de ámbito, servicios ajenos y montajes persistentes.
- `.github/workflows/mg-web-studio-v90-synthetic-pg17-restore.yml`: ejecutor temporal de GitHub Actions, permisos mínimos, condiciones de rama y verificación final de contenedores ausentes.
- `docs/V90-EVIDENCIAS-PG17-BACKUP-RESTORE-SINTETICO.md`: este informe.

Se reutilizaron sin modificarlos los archivos V86 `v86-setup-synthetic-tenants.sql` y `v86-verify-rls.sql`.

## 5. Qué significa para los controles operativos V67

| Control | Evidencia de V90 | Pendiente antes de cierre formal |
| --- | --- | --- |
| `REC-01` | Volcado y restauración PostgreSQL 17 **reales** en destino aislado, solo datos ficticios | Revisor independiente, alcance del sistema final |
| `REC-02` | Coincidencia de datos, esquema, índices, roles/permisos y RLS en el fixture reducido | Verificar dependencias y extensiones no predeterminadas si las usa el sistema definitivo |
| `REC-03` | Repetición satisfactoria de controles SQL V86 en destino | **No se ejecutó la suite V53** sobre el destino restaurado |
| `REC-04` | Muestras de 99/68 ms para comandos mínimos | Sin RPO/RTO reales, cifrado de backups, retención aprobada ni revisión de recuperación operativa |

**Estado formal canónico: 32 controles V67 `PENDING` / 0 aprobaciones independientes.** El código original de evidencias V67 no fue alterado para colocar `PASS` sin revisor.

La autorización V90 termina en estas dos bases desechables. No concede permiso para restaurar datos reales, conectar otra base, abrir puertos públicos, establecer ventanas productivas o desplegar.

**Recomendación para avanzar:** auditar la matriz V67 contra las evidencias reales V85–V90, identificar cuáles están completos/solo parcialmente cubiertos/faltantes y ejecutar únicamente las pruebas que verdaderamente desbloquean la salida a producción, manteniendo aprobación independiente para operaciones sensibles.
