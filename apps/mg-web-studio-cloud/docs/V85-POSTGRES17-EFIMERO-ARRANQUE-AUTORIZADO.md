# MG WEB STUDIO CLOUD — V85 | Arranque PostgreSQL 17 aislado, efímero y verificado

**Fecha:** 27 de octubre de 2026, Ecuador (job registrado en UTC el 28/10/2026)  
**Rama:** `feature/mg-digital-v5-web-services`  
**Autorización explícita del usuario:** creación y arranque de **un PostgreSQL 17 temporal dentro de GitHub Actions**, sin credenciales reales, puertos públicos, SQL de validación, pruebas HTTP, restauraciones ni publicación.

## Resultado operativo REAL

**GitHub Actions éxito:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40631071278  
**Job:** `122627316987`  
**Commit ensayado:** `0c539272697ce14c5ecd6214353960b6b1f849ff`  
**Runner:** GitHub-hosted Ubuntu 24.04, rama exclusiva, sin cambios en main.

Hechos observados en las líneas del job:

- Imagen oficial PostgreSQL 17 bookworm, identificador de imagen Docker: `sha256:99445113a4a19e82dd3713c65bd9f6fb5bf972065ab043df8d1e1c93e957da9a`.
- `docker run` creó y arrancó `mg-webstudio-v85-pg17-bootonly` en un runner temporal, distinto de cualquier ordenador del usuario.
- `docker inspect` verificó **`NetworkMode=none`, sin puertos publicados y comando de PostgreSQL `listen_addresses=` (ninguna escucha TCP)**.
- Límite configurado: 1 vCPU, **1.024 MiB RAM** (sin swap adicional) y **640 MiB tmpfs** para datos; `--read-only` para la capa raíz, `--pids-limit 128` y `no-new-privileges`.
- Contraseña generada aleatoriamente, empleada solo en el job aislado y **no mostrada ni registrada** en la salida.
- El servidor respondió a `pg_isready` por **socket Unix interno**, sin ejecutar consultas SQL personalizadas. `postgres --version` confirmó **PostgreSQL 17.11** (Debian 17.11-1.pgdg12+2). El archivo `PG_VERSION` informó major 17.
- El contenedor fue detenido y eliminado dentro del mismo trabajo; posteriormente se verificó: **`V85 FINAL: no temporary PostgreSQL container remains`**. El sistema de archivos de datos era `tmpfs`, sin volúmenes persistentes ni montajes del host.
- **No hubo consulta SQL de validación, creación de tablas de prueba, tenants, endpoints de red, restore ni publicación.** La inicialización normal de la imagen oficial crea un clúster vacío y su base de arranque; no equivale a autorización para realizar SQL de aplicación.

**Resultado automatizado:** 14 contratos V85 + 25 contratos V84 = **39/39 correctos**, sin fallos en la ejecución de éxito.

### Intento previo, corregido sin crear contenedor

Una primera ejecución de V85 `40631030879` se detuvo en una prueba estática porque trataba por error `docker rm -v` (eliminación de volumen temporal) como si fuese un montaje de volumen prohibido. Se corrigió **solo el test**, no se relajó ningún bloqueo de arranque, y la ejecución posterior finalizó correctamente.

## Garantías y límites de la evidencia

1. El contenedor **no era público** ni conectó a otras bases de datos. Se utilizó `--network none`, sin `-p`; PostgreSQL se configuró para no escuchar TCP. El readiness por Unix socket local está autorizado únicamente como comprobación de arranque.
2. Los datos PGDATA y socket se montaron en tmpfs, con limpieza explícita en trap `EXIT`; la eliminación se comprobó por Docker. Docker advierte que las páginas tmpfs pueden en ciertos entornos alcanzar swap; por eso **jamás deben introducirse secretos reales o datos de clientes** en este laboratorio.
3. La imagen `postgres:17-bookworm` es una etiqueta que podría avanzar a otro minor en futuras ejecuciones. El identificador SHA256 citado corresponde a **esta ejecución**, pero no constituye un digest de manifest multi-arquitectura fijado en la definición del workflow.
4. La máquina GitHub-hosted es temporal y el repositorio es público: resultados del job son accesibles públicamente. No se publicaron valores de credenciales ni datos de usuarios.
5. En una futura fase, un laboratorio con SQL multiempresa puede necesitar más de 640 MiB de tmpfs para datos; esa modificación requerirá planificación de límites y autorización de la nueva etapa.

## Archivos implantados

- `scripts/start-pg17-ephemeral-v85.sh`: solo acepta repo/rama GitHub-hosted y `MG_V85_SCOPE`; genera contraseña aleatoria; descarga imagen oficial; arranca PostgreSQL 17 con aislamiento sin TCP y recursos limitados; valida su existencia y version por socket/lectura; lo destruye al salir.
- `tests/start-pg17-ephemeral-v85.test.cjs`: 14 comprobaciones estáticas y de invocación segura, sin contenedores.
- `.github/workflows/mg-web-studio-v85-postgres17-boot-only.yml`: job `ubuntu-24.04`, únicamente para la rama de desarrollo, con permisos `contents:read` y `persist-credentials:false`; comprueba contratos offline, preflight V84, arranca PG17 y valida que fue eliminado.

## Qué falta y qué se puede autorizar después

**V67:** `32/32` operativos **PENDING**; **cero** aprobados.  
**V78:** quedan `database`, `network`, `sqlRead`, `tenantFixtures`, `restore`, `production` **pendientes** para las operaciones de ensayo correspondientes. La autorización V85 es específica del arranque y no convierte automáticamente esas seis aprobaciones de operación en `APPROVED`.

Para acelerar sin confundir aprobaciones, la siguiente solicitud podrá incluir dos decisiones **explícitas y distintas**:

- **Datos de ensayo**: autorizar generar únicamente datos ficticios de dos empresas/roles dentro de un nuevo PostgreSQL 17 igualmente efímero (permisos de `tenantFixtures` y operaciones de base de datos limitadas a ese contenedor).
- **SQL de verificación**: autorizar **separadamente** ejecutar SQL de comprobación de roles, RLS y transacciones, sin acceder a producción o BAZAR-ONLINE (permisos `sqlRead` y operaciones de prueba limitadas).

**Hasta esas autorizaciones, no crear tablas ni ejecutar consultas SQL personalizadas.** Los tests HTTP/red, el restore y cualquier despliegue quedan igualmente prohibidos hasta recibir sus permisos específicos.

**Decisión actual:** `V85_STARTUP_VERIFIED` para el arranque real; `NO_GO` para validación operativa V67 y publicación.
