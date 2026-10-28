# MG WEB STUDIO CLOUD — V84 | Primera medición real en GitHub Actions

**Fecha:** 27 de octubre de 2026, hora de Ecuador (ejecución registrada en UTC en GitHub)  
**Rama exclusiva:** `feature/mg-digital-v5-web-services`  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`, público  
**Elección de entorno:** **GitHub Actions temporal autorizado por el usuario**.  
**Alcance de aprobación vigente:** solo selección de plataforma y diagnóstico de recursos en runner aislado; no incluye PostgreSQL, peticiones HTTP ni credenciales.

## 1. Evidencia técnica REAL del runner de GitHub

**Ejecución completada con éxito:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40630510664  
**Job:** `122625526473`  
**Commit comprobado:** `7ca79a32ac4ea4dcfdde6f7b75e0da2ec102e63f`  
**Runner:** `ubuntu-24.04`, `linux`, `x64`, contexto de GitHub-hosted y repositorio/rama confirmados mediante variables locales del proceso.

Salida real sanitizada (capturada en logs del job):

| Indicador | Resultado registrado |
| --- | ---: |
| CPU disponibles | **4** |
| RAM total | **15.989 MiB** |
| RAM libre | **14.950 MiB** |
| Espacio disponible del sistema de archivos de trabajo | **87.773 MiB** |
| Contexto de rama y repositorio | **Coincide** |
| Resultado de umbrales preliminares V84 | **`resourceCandidate:true`**, `issueCodes:[]` |
| Fallos en pruebas automatizadas | **0** |

**Advertencia de capacidad de almacenamiento:** el valor `workspaceFreeMiB` fue calculado con `statfsSync` en el sistema de archivos que contiene el directorio de trabajo de ese **job temporal**. No demuestra 85,7 GiB garantizados para futuros jobs, ni espacio reservado en un volumen Docker/PG17 futuro, ni viabilidad de backups voluminosos. La documentación pública de GitHub describe 14 GB SSD para el tipo de runner; los valores observados y publicados pueden diferir. Volver a medir antes de toda instalación, sin trasladar directamente el umbral de 20 GiB de Windows V81 a Linux.

**El runner no es un sandbox sin Internet ni una red completamente aislada por sí mismo**. El preloader `native-network-guard-v70.cjs` bloquea algunas APIs de red nativas de Node dentro del proceso de ensayo, pero no reemplaza el firewall de un futuro contenedor ni restringe todo el tráfico de un workflow. `actions/checkout` y `actions/setup-node` utilizaron el flujo normal gestionado por GitHub, sin conectarse a bases ni servidores del usuario.

## 2. Resultado automatizado y límites de las pruebas

Se ejecutaron:

- **25 pruebas nuevas V84**: evaluación pura de recursos (18) y CLI sanitizada (7).
- **56 pruebas V82 y contratos originales V67**.
- **528 pruebas de regresión V70–V81**.
- **Total: 609/609 PASS.**

**Estas 609 pruebas son unitarias, sintéticas o de contrato.** La medición del runner sí fue una observación real de recursos; no se ejecutaron las pruebas operativas reales V67. Aceptar un runner con suficiente capacidad **no** es aprobar seguridad, disponibilidad, restauración ni publicación.

## 3. Archivos implementados

- `server/github-runner-preflight-v84.cjs`: mide CPU, memoria y `statfsSync`; valida repo/rama y contexto GitHub-hosted; devuelve `NO_GO` para operaciones incluso si hay recursos.
- `scripts/inspect-gh-runner-v84.cjs`: informe JSON sanitizado con métricas y límites; no lee ni imprime tokens, identidades, nombres de host, rutas ni variables de entorno.
- `tests/github-runner-preflight-v84.test.cjs` y `tests/inspect-gh-runner-v84.test.cjs`: controlan contexto, recursos insuficientes, datos inválidos y prohibición de operaciones.
- `.github/workflows/mg-web-studio-v84-github-runner-preflight.yml`: job `ubuntu-24.04`, permisos `contents:read`, `persist-credentials:false`, sin `services:`, sin `docker run`, sin SQL ni listeners; se dispara solo por cambios V84 en la rama de desarrollo.

Las pruebas fueron ejecutadas y sus resultados son verificables desde la ejecución anterior. Esta documentación se añadió después del job y no implica repetirlo.

## 4. Decisión de recursos y restricciones

**SELECCIÓN DEL ENTORNO: CONFIRMADA PARA TRABAJO PREPARATORIO**.  
**CAPACIDAD TÉCNICA DEL RUNNER: CANDIDATO FAVORABLE**.  
**HABILITACIÓN DE BASE DE DATOS, PUERTOS Y PRUEBAS OPERATIVAS: `NO_GO`**.

No se instalaron paquetes ni ejecutaron procesos de PostgreSQL, no se creó ningún contenedor del laboratorio, no se abrieron puertos de prueba, no se realizó restore, no se tocó Docker de la laptop, no se modificó BAZAR-ONLINE ni se hizo ningún despliegue.

**Estado V67: 32 PENDING / 0 PASS.**  
**Estado V78: seis permisos PENDING** (`database`, `network`, `sqlRead`, `tenantFixtures`, `restore`, `production`).  
**Los logs de GitHub Actions en repositorio público son visibles públicamente.** Solo deben usarse empresas, usuarios y operaciones completamente ficticios en fases posteriores, nunca datos reales de clientes, tokens de servicios activos o volcados de producción.

## 5. Camino crítico para terminar

Se debe obtener, como decisiones **distintas y auditables**, antes de cada grupo de acciones:

1. **PG17 desechable en GitHub Actions** — autorización de crear/iniciar un contenedor nuevo durante el job, sin acceso a otros proyectos ni red externa de prueba; definir límites CPU/RAM/disco, persistencia nula y destrucción al final del job.
2. **Datos ficticios multiempresa** — aprobación separada de `tenantFixtures`; prohibido cargar datos reales.
3. **Consultas de validación** — aprobación separada de `sqlRead` sobre la base sintética aislada, y autorización de otras operaciones de base de datos solo cuando proceda.
4. **HTTP local de laboratorio** — aprobación separada de `network` con dirección `127.0.0.1` y puerto concreto; después ejecutar pruebas del parser sin apuntar a endpoints externos.
5. **Restauración** — aprobación separada de `restore` para backup generado exclusivamente del laboratorio ficticio y destino igualmente desechable.
6. **Producción** — autorización **independiente, posterior y explícita**, únicamente tras auditar las 32 evidencias reales, políticas operativas y reversión.

La próxima autorización solicitada será **solo la n.º 1: crear y arrancar un PostgreSQL 17 efímero en GitHub Actions con límites y sin credenciales ni datos reales**. No autoriza por sí misma ejecutar scripts SQL, abrir listeners o realizar restores.

**Conclusión V84:** infraestructura temporal seleccionada, recursos reales medidos satisfactoriamente y software de diagnóstico aprobado; base de datos y controles operativos bloqueados hasta nuevas autorizaciones. La laptop Windows no necesita más limpieza para esta línea de trabajo.
