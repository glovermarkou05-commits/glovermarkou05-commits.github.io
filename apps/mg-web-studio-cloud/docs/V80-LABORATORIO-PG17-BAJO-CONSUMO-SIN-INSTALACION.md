# MG WEB STUDIO CLOUD — V80 | Laboratorio PostgreSQL 17 de bajo consumo (sin instalación)

**Fecha local de trabajo:** 23/10/2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Resultado:** diseño de seguridad y capacidad sintética probado: **482/482 pruebas nativas PASS**, 0 fallos. **NO GO** para instalación, ejecución de contenedores, base de datos real, conexiones y producción.

## 1. Motivo de la etapa

La medición proporcionada por el usuario en Windows identificó aproximadamente **7,68 GiB de RAM total, 8 procesadores lógicos y 0,78 GiB de RAM libre** en la última comprobación. También indicó ~16,8 GB libres en C:, mientras E: (~99,78 GB libres) es una **tarjeta SD por USB**, no almacenamiento interno para el servidor.

Docker Desktop/WSL 2 mantiene en ejecución el contenedor de BAZAR-ONLINE `supabase_db_bazar_online_4r_local_only`, con PostgreSQL 17 y estado `healthy` en la última revisión del usuario. **No se intervino este contenedor ni se accedió a su información.** Estas cifras son evidencia **aportada por el usuario**, no mediciones realizadas por GitHub ni garantías de que continúen iguales.

V80 permite preparar hipótesis de bajo consumo, sin intentar usar esos recursos. Una reserva de contenedor no equivale a memoria disponible en Windows: WSL, Docker Desktop, el sistema operativo y otros programas consumen memoria fuera de la instancia prevista.

## 2. Archivos implementados

- `server/pg-lab-safety-gate-v80.cjs`: `reviewLowFootprintCandidateV80(input)` valida una **fotografía sintética**, se apoya en la validación de medidas V79 y genera códigos de advertencia. La función **nunca emite aprobación real**, no llama a Docker, no abre puertos y no verifica físicamente el host. `createSyntheticLowFootprintInputV80()` proporciona una muestra exclusivamente para pruebas.
- `server/pg-lab-isolation-v80.cjs`: `createIsolatedLabBlueprintV80()` prepara un plano **descriptivo e inerte**. `reviewIsolatedLabBlueprintV80(input)` rechaza desviaciones del plano y manifiestos de autorización V78 alterados. No existe `docker-compose.yml`, `docker run`, creador de volúmenes, gestor de secretos ni script ejecutable de arranque.
- `tests/pg-lab-safety-gate-v80.test.cjs`: **26 pruebas** de recursos, inconsistencia de mediciones, tarjeta SD, origen sintético, protección de BAZAR y estado `NO_GO`.
- `tests/pg-lab-isolation-v80.test.cjs`: **25 pruebas** de aislamiento, límites propuestos, puertos, prohibición de montajes, credenciales, operaciones Docker y autorizaciones.
- `.github/workflows/mg-web-studio-v80-low-footprint.yml`: CI sin conexiones PG, ejecuta V80 + todas las regresiones V70–V79.
- Este informe técnico.

## 3. Filtro de recursos para laboratorio hipotético

Se diseñó un perfil exploratorio más ligero que el de V79:

| Recurso | Umbral de candidato V80 | Observación |
| --- | ---: | --- |
| RAM total | ≥6 GiB | Medida del host, no memoria garantizada |
| RAM libre | ≥2 GiB | Es **margen preliminar**, no garantía de rendimiento |
| CPU disponibles | ≥2 | Todavía no se ejecuta carga |
| Espacio libre sistema | ≥8 GiB | Considera tareas del sistema |
| Espacio libre de destino | ≥12 GiB | Debe comprobarse en el **volumen real** del laboratorio |
| Medio para datos | Disco fijo interno NTFS | **Tarjetas SD, USB extraíbles y medios no identificados: rechazados** |

Los umbrales V79 (4 GiB de RAM libre) siguen documentados y son más conservadores. El umbral V80 de 2 GiB es una **hipótesis de laboratorio pequeño**, no una revisión automática del requisito operativo V79. Ningún resultado sintético acredita recursos reales. La fotografía del usuario con **0,78 GiB libres queda por debajo incluso de V80** y desaconseja iniciar una instancia adicional.

El evaluador V80 conserva una regla de coherencia de V79: dos mediciones de espacio diferente **no pueden declararse provenientes de la misma unidad**. El primer intento de CI detectó dos pruebas con esa contradicción; se corrigieron los datos ficticios de los tests, **no** la regla. La repetición integral aprobó todos los casos.

## 4. Plano de aislamiento **sin efectos**

| Elemento propuesto | Valor V80 | Situación real |
| --- | --- | --- |
| Base | PostgreSQL 17 | **No provisionada** |
| Proyecto aislado | `mg_web_studio_cloud_lab_v80` | Nombre hipotético |
| Contenedor de laboratorio | `mg_web_studio_pg17_lab_v80` | **No creado** |
| Contenedor protegido | `supabase_db_bazar_online_4r_local_only` | No tocar |
| Memoria máxima tentativa | **512 MiB** | Límite **no aplicado ni ensayado** |
| CPU tentativa | **1 CPU** | Límite **no aplicado** |
| Buffers compartidos | 64 MiB | Ajuste de PostgreSQL **no probado** |
| Memoria por operación | 2 MiB | Ajuste **no probado**; pueden existir varias operaciones por consulta |
| Conexiones máximas | 12 | Ajuste **no probado** |
| Bind futuro | `127.0.0.1` | **No se abrió ninguna interfaz** |
| Puerto sugerido | `25480` | **No se comprobó que esté libre** |
| Volumen de datos | `mg_web_studio_lab_pgdata_v80_UNCREATED` | **No existe; ubicación aún no elegida** |
| Imagen PostgreSQL | `NOT_SELECTED_OR_PULLED` | Ninguna imagen descargada |
| Credenciales | `NOT_ISSUED` | Ninguna generada |
| Red | `NOT_CONFIGURED` | No creada |

**Advertencia:** el techo de 512 MiB y ajustes SQL son ideas para un ensayo con **datos completamente ficticios**, no recomendaciones validadas para producción. La instancia podría requerir más memoria o sufrir OOM. Docker Desktop con WSL 2 consume recursos adicionales, y ni la VM ni el arranque, cachés, imágenes, WAL, restauración o requisitos futuros están dimensionados aquí. Antes de su uso real, un operador deberá validar la documentación de PostgreSQL 17 y límites de memoria Docker, calcular presupuestos completos y ensayar el rendimiento.

Referencias técnicas: [PostgreSQL 17 — Resource Consumption](https://www.postgresql.org/docs/17/runtime-config-resource.html), [Docker — Resource Constraints](https://docs.docker.com/engine/containers/resource_constraints) y [Docker Desktop en WSL2](https://docs.docker.com/desktop/features/wsl/best-practices/).

## 5. Seguridad y autorizaciones

La plantilla V80 exige que los seis permisos V78 (`database`, `network`, `sqlRead`, `tenantFixtures`, `restore`, `production`) sigan **PENDING**. Está prohibido:

1. Detener, reiniciar, borrar, modificar o montar volúmenes del contenedor BAZAR-ONLINE.
2. Reutilizar credenciales, rutas, archivos o datos de BAZAR-ONLINE u otros proyectos.
3. Seleccionar una unidad USB/SD como destino principal del laboratorio y su volumen de datos.
4. Instalar PostgreSQL, descargar imágenes, crear volúmenes, abrir puertos, ejecutar SQL o restauraciones desde este plano.
5. Marcar un resultado de pruebas nativas como `GO`, otorgar permisos o descontar controles V67.

Los módulos no contienen herramientas para efectuar estas acciones. Las salidas tienen `decision:'NO_GO'`, `operationalV67Passed:0`, `operationalV67Pending:32`.

## 6. Verificación técnica en GitHub Actions

**Ejecución final correcta:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40055213561  
**Run ID:** `40055213561`  
**Job ID:** `120756596648`  
**Commit verificado:** `5fe65817a1f6c3aa58d7167dc16293f68a50788b`  
**Node.js:** `v22.23.3`  
**Estado:** `completed / success`

| Suite | Aprobadas | Fallos |
| --- | ---: | ---: |
| **V80 — recursos y aislamiento hipotéticos** | **51** | **0** |
| V79 — capacidad local, simulaciones | 26 | 0 |
| V78 — autorizaciones y runbook | 45 | 0 |
| V77 — evidencia de catálogo y casos multiempresa | 38 | 0 |
| V76 — privilegios/recuperación sintéticos | 47 | 0 |
| V75 — sesión `auth.sessions` | 38 | 0 |
| V74 — verificación de autenticación | 39 | 0 |
| V73 — restricciones del proveedor | 34 | 0 |
| V72 — rotación y revocación de sesiones | 28 | 0 |
| V71 — JWT criptográfico | 44 | 0 |
| V70 — siete suites nativas | 92 | 0 |
| **Total** | **482** | **0** |

El primer CI V80 (`40055177388`) registró **49/51** porque dos fixtures de pruebas afirmaban que el sistema y workspace compartían disco pero devolvían diferentes valores de espacio. Se corrigieron los fixtures para indicar unidades diferentes cuando corresponda y se obtuvo **482/482 PASS** en la segunda ejecución completa. No hay defectos abiertos conocidos derivados de esas dos pruebas.

GitHub Actions no realizó ninguna prueba contra PostgreSQL real, ni usó los recursos Windows del usuario. La precarga V70 reduce el uso de APIs de red de Node.js en las pruebas, pero no es un aislamiento del sistema operativo; checkout y aprovisionamiento de Node usan red.

## 7. Próximo hito y estado operacional

La necesidad inmediata no es otra batería sintética sino **evidencia de capacidad real y un destino aislado aprobado**. Las alternativas a revisar después son liberar RAM sin afectar Docker BAZAR, elegir un equipo diferente con más RAM o considerar un laboratorio aislado externo con autorización independiente. No usar E: (tarjeta SD) como base principal.

**V67: 32/32 verificaciones operativas siguen PENDING.** V80 no ejecuta pruebas reales y no aprueba ningún control operacional.

**Dictamen:** V80 **terminada en diseño, código y CI**; instalación PG17, pruebas reales de aislamiento/RLS, recuperación, Supabase/STAGING y publicación permanecen **NO GO**. Sin Lovable, sin credenciales ni conexiones reales, sin alteración de BAZAR-ONLINE.
