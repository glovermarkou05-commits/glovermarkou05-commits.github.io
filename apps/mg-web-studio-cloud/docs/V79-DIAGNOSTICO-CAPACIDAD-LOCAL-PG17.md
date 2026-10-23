# MG WEB STUDIO CLOUD — V79 | Diagnóstico local de capacidad para laboratorio PostgreSQL 17

**Fecha:** 23/10/2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Resultado:** herramientas de diagnóstico de solo lectura desarrolladas y verificadas nativamente con sensores simulados. **No se midió el equipo Windows del usuario** y no se creó ningún laboratorio PostgreSQL. Todas las autorizaciones de V78 continúan pendientes.

## 1. Objetivo y entregables

Después de completar V78 se necesita verificar los recursos de la computadora antes de aprobar la creación de un laboratorio PostgreSQL 17. V79 aporta una medición local y aislada, **sin instalación, sin consultas SQL, sin Supabase, sin escritura a disco ni conexiones de red**.

Se incorporaron:

- `server/lab-capacity-v79.cjs`: `collectLocalCapacityV79()` mide **solo** CPU, RAM total y libre, espacio libre de la unidad del sistema y espacio libre de la unidad del directorio desde el que se ejecuta. `assessLocalCapacityV79(snapshot)` evalúa estrictamente un conjunto de valores, sin privilegios ni aprobaciones. Las operaciones se limitan a estadísticas del sistema operativo.
- `scripts/measure-pg-lab-capacity-v79.cjs`: CLI local `node scripts/measure-pg-lab-capacity-v79.cjs`, opción `--json` y `--help`.
- `tests/lab-capacity-v79.test.cjs`: 23 casos simulados de Windows, Linux, disponibilidad de RAM/disco, incoherencias, datos privados y denegación segura.
- `tests/measure-pg-lab-capacity-v79.test.cjs`: 3 casos de CLI.
- `.github/workflows/mg-web-studio-v79-local-capacity.yml`: prueba nativamente V79 y repite V70–V78.
- `docs/V79-DIAGNOSTICO-CAPACIDAD-LOCAL-PG17.md`: informe y pasos de uso.

## 2. Umbrales de planificación

| Recurso | Umbral orientativo | Restricción |
| --- | ---: | --- |
| Espacio libre en la unidad del proyecto | **10 GiB** | Se mide donde se ejecuta el comando; puede no ser el destino final del laboratorio |
| Espacio libre en la unidad del sistema | **4 GiB** | Margen de planificación para dependencias y funcionamiento del sistema |
| RAM total | **4 GiB** | No garantiza RAM libre suficiente |
| RAM disponible en el momento | **4 GiB** | Puede variar minuto a minuto y no está reservada |
| CPU disponibles | **2** | Recuento expuesto por Node.js, no benchmark de rendimiento |

Estos son **mínimos iniciales de planificación**, no las especificaciones definitivas de PostgreSQL ni garantía de desempeño. La futura ubicación de datos, el tipo de almacenamiento, WSL/virtualización, Docker/Podman, carga del equipo, autenticación, sistema operativo y pruebas de recuperación pueden exigir recursos adicionales. Un resultado positivo **no instala ni autoriza el laboratorio**.

La comprobación utiliza `node:os` y `node:fs.statfsSync` para leer estadísticas, no analiza archivos ni incluye hostname, identificadores de usuario, rutas privadas, tokens o credenciales en el resultado. En Windows consulta la unidad indicada por `SystemDrive` y la unidad **local** del directorio actual; rechaza rutas de red UNC. En otros sistemas utiliza la raíz. Si el sistema operativo no permite consultar esos datos, devuelve error controlado sin revelar rutas.

## 3. Ejecución en Windows

### Opción A — dentro del repositorio

Abrir PowerShell en la raíz local del repositorio `glovermarkou05-commits.github.io` **con la rama V79 sincronizada**, sin hacer cambios en otros proyectos:

```powershell
node .\apps\mg-web-studio-cloud\scripts\measure-pg-lab-capacity-v79.cjs
```

Si se desea copiar fácilmente el reporte:

```powershell
node .\apps\mg-web-studio-cloud\scripts\measure-pg-lab-capacity-v79.cjs --json
```

**Atención:** el programa mide la unidad del directorio actual. Si el laboratorio futuro se ubicará en otra unidad, hay que volver a ejecutar el programa desde dicha unidad o revisar ese espacio por separado. No confundir el resultado de la unidad del repositorio con la del laboratorio planeado.

### Opción B — ZIP independiente

Se preparó un paquete descargable `MG-Web-Studio-V79-Diagnostico.zip` con `server/`, `scripts/` y `LEEME.txt`. Extraerlo en Windows, abrir PowerShell en su carpeta principal y ejecutar:

```powershell
node .\scripts\measure-pg-lab-capacity-v79.cjs
```

Este comando requiere Node.js 22 o superior. No requiere conexión con GitHub para ejecutarse una vez descargado.

### Alcance de esta comprobación

El usuario debe ejecutar el comando **en su propia máquina** y compartir el resultado si quiere que se evalúe su capacidad. **Ni la ejecución de GitHub Actions ni el entorno de ChatGPT permiten concluir el espacio libre actual de su PC.** No se han comprobado en vivo la capacidad de la SD, las unidades Windows ni el almacenamiento usado por otros proyectos.

## 4. Pruebas nativas verificadas

GitHub Actions: https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39988967261

- **Run ID:** `39988967261`
- **Job ID:** `120535459202`
- **Commit probado:** `53f3bb26e98dac7190dce1e60b0bfe0447cd60e0`
- **Node.js:** `v22.23.3`
- **Resultado:** `completed / success`.

| Pruebas ejecutadas | Correctas | Fallos |
| --- | ---: | ---: |
| **V79**: 23 pruebas del evaluador + 3 del CLI | **26** | **0** |
| V78: planificación del laboratorio | 45 | 0 |
| V77: consultas y escenarios de evidencia | 38 | 0 |
| V76: privilegios y recuperación sintética | 47 | 0 |
| V75: lectura simulada de sesiones | 38 | 0 |
| V74: contratos de autenticación | 39 | 0 |
| V73: límites de proveedores | 34 | 0 |
| V72: rotación y revocación simuladas | 28 | 0 |
| V71: JWT criptográfico | 44 | 0 |
| V70: regresión de siete suites | 92 | 0 |
| **Total de pruebas ejecutadas** | **431** | **0** |

Las pruebas de V79 se ejecutaron con **sensores simulados**; el runner Linux no hizo un diagnóstico del equipo Windows de la persona usuaria. GitHub Actions utilizó red para checkout y configuración de Node, pero las suites nativas se ejecutaron bajo la precarga V70 que bloquea varias APIs de red de Node, sin ser un sandbox de sistema operativo.

## 5. Riesgos pendientes

1. La lectura de espacio y memoria es una **fotografía momentánea**; el rendimiento, la salud de las unidades, la seguridad de una SD y el tamaño de las bases futuras aún no se han comprobado.
2. La herramienta no comprueba espacio dentro de WSL, contenedores, VMs, discos virtuales ni cuotas del sistema. Tampoco comprueba PostgreSQL instalado.
3. La herramienta no puede declarar `GO` aun con recursos suficientes. Requiere **autorizaciones separadas** de base de datos, red, SQL, fixtures, restauración y producción.
4. No hay pruebas reales de restauración, RLS, privilegios efectivos, servidor HTTP real, PostgreSQL 17 ni recuperación; **32/32 controles operativos V67 siguen PENDING**.
5. El resultado local no contiene rutas ni secretos, pero conviene revisar cualquier salida antes de compartirla públicamente.

**Conclusión:** V79 finalizada en código y QA sintética, **431/431 PASS**. La **medición de la computadora del usuario sigue pendiente**; laboratorio PG17, Supabase/STAGING y publicación: **NO GO**.
