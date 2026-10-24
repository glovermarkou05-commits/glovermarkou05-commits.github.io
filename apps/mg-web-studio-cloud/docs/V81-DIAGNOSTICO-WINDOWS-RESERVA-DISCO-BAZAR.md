# MG WEB STUDIO CLOUD — V81 | Diagnóstico Windows seguro y reservas reales de unidad

**Fecha:** 24/10/2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** desarrollo de herramientas, tests con entradas y comandos **simulados**, **520/520 PASS**. El diagnóstico V81 aún **no se ha ejecutado en la computadora del usuario**. No hay instalación, acceso a bases de datos, cambios de Docker, despliegue ni publicación. **NO GO**.

## 1. Hallazgo clave

Después de V79/V80, las observaciones aportadas por el usuario son:

- CPU disponibles: **8**; RAM total: aproximadamente **7,68 GiB**.
- RAM libre más reciente aportada: **0,78 GiB**, inferior al margen V80 de **2 GiB**.
- Espacio libre en **C:** aproximadamente **16,8 GiB**.
- Espacio libre en **E:** aproximadamente **99,78 GiB**, pero E: pertenece a un **lector de tarjeta USB/SD**, inadecuado como volumen principal de datos PostgreSQL.
- Docker contiene **`supabase_db_bazar_online_4r_local_only`**, que el usuario verificó como **Up / healthy**. No detener ni reutilizar ese contenedor.

La V80 comprobaba un mínimo de 8 GiB para Windows y 12 GiB para el destino del laboratorio de forma separada. **V81 añade la regla crítica de reservar ambos del mismo espacio libre si sistema y destino comparten exactamente el mismo volumen**. En C: se necesitarían **8 + 12 = 20 GiB** de espacio libre como mínimo de planificación; los **16,8 GiB** observados no cumplen esa reserva conjunta. Si el destino es otra unidad/partición, se evalúan por separado, además de verificar el tipo de almacenamiento.

**Esos umbrales son hipótesis conservadoras para preparar el laboratorio, no mínimos oficiales de PostgreSQL 17.** Además, el bus de C: (SATA, NVMe, etc.) aún no está confirmado por evidencia nueva. Por ello el ejemplo del usuario usa `targetBusType:'UNKNOWN'`, sin inventar un tipo de disco.

## 2. Código de V81

- `server/pg-host-feasibility-v81.cjs`: `assessPgHostFeasibilityV81(snapshot)` evalúa observaciones estrictas de Windows. Exige RAM libre 2 GiB, RAM total 6 GiB, 2 procesadores, reserva Windows de 8 GiB y espacio del laboratorio de 12 GiB. Rechaza USB, tarjetas, medios desconocidos, sistemas de archivos distintos de NTFS, resultados inconsistentes, BAZAR no confirmado como `healthy`, campos extraños y secretos. Genera únicamente **códigos fijos de incidencia**, nunca contraseñas ni rutas privadas.
- `scripts/inspect-pg-host-v81.cjs`: herramienta **para invocación local explícita**, en Windows. Llama a `powershell.exe` con `-NoProfile -NonInteractive -Command` para consultar `Get-CimInstance Win32_OperatingSystem`, `Win32_Processor`, `Get-Volume`, `Get-Partition` y `Get-Disk`. Luego utiliza únicamente `docker.exe ps --filter name=... --format '{{json .}}'` para identificar el contenedor BAZAR. **No** ejecuta `docker start/stop/rm/exec`, ni SQL, instalación, cambio de red, escritura, backup, restauración o gestión de WSL.
- `tests/pg-host-feasibility-v81.test.cjs`: **25** casos de recursos, coherencia entre volúmenes, USB/SD, BAZAR y negativa de permisos.
- `tests/inspect-pg-host-v81.test.cjs`: **13** casos con subprocesos **inyectados/mocks**. Ninguna prueba conecta realmente Docker ni solicita los recursos de la máquina de usuario.
- `.github/workflows/mg-web-studio-v81-host-preflight.yml`: ejecución V81 y V70–V80 bajo la guarda de red de Node V70.
- Este informe.

**Limitación deliberada:** un JSON puede falsificarse; la herramienta no verifica autenticidad, integridad forense de las mediciones, origen de Docker o uso del contexto remoto. Antes de operaciones reales se requiere revisar el contexto de Docker (`docker context show`), versión, destino, propiedad, unidades montadas, almacenamiento y autorización. No se confía en la salida como prueba de seguridad de producción.

## 3. Cómo ejecutar el diagnóstico V81 en Windows, sin instalar PostgreSQL

Descargar **ambos archivos** desde GitHub y mantener su estructura de carpetas:

```text
MG-Web-Studio-V81/
  server/
    pg-host-feasibility-v81.cjs
  scripts/
    inspect-pg-host-v81.cjs
```

Después, dentro de la carpeta `MG-Web-Studio-V81` en PowerShell:

```powershell
node .\scripts\inspect-pg-host-v81.cjs --target-drive=C
```

Opcionalmente, para verificar por qué la tarjeta E: no es candidata:

```powershell
node .\scripts\inspect-pg-host-v81.cjs --target-drive=E
```

No es necesario abrir sesión de administrador. Se requiere Node.js (el usuario ya ejecutó Node 24.19.0), PowerShell y una instalación Docker cuyo contexto permita consultas de lectura del contenedor existente. Si no se puede consultar Docker o los datos, devuelve error no aprobatorio. El resumen solo incluye cifras y códigos normalizados, sin usuario, rutas, etiquetas de volumen ni IDs de contenedores.

**No confundir:** evaluar un host con éxito no implica que se deba iniciar un contenedor. El resultado mantiene `decision:'NO_GO'` aunque `resourceCandidate:true`. La autorización de V78 sigue siendo independiente.

## 4. Significado de códigos relevantes

| Código | Interpretación |
| --- | --- |
| `FREE_RAM_INSUFFICIENT` | RAM libre por debajo de 2 GiB de margen preliminar |
| `TARGET_NOT_CONFIRMED_INTERNAL` | USB, tarjeta extraíble, bus desconocido o medio no aprobado |
| `SYSTEM_RESERVE_INSUFFICIENT` | No quedan 8 GiB para Windows y, si el volumen es el mismo, 12 GiB adicionales para laboratorio |
| `TARGET_SPACE_INSUFFICIENT` | El volumen elegido tiene menos de 12 GiB libres |
| `TARGET_NOT_NTFS` | El destino no cumple el sistema de archivos NTFS del diseño Windows |
| `BAZAR_HEALTH_NOT_CONFIRMED` | Docker no confirma el contenedor identificado como `running / healthy` |
| `OBSERVATION_MALFORMED` | Faltan campos, hay inconsistencia, valores inválidos o datos externos |

El algoritmo tiene una lista fija de nombres y **no reutiliza ni modifica BAZAR-ONLINE**.

## 5. Verificación GitHub Actions

**Ejecución aprobada:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40125514030  
**Job ID:** `120965971009`  
**Commit probado:** `e039ac0be742d184bb3ea64fb9d231abd4c6aaf3`  
**Node.js:** `v22.23.3`  
**Conclusión:** `completed / success`

| Suite | Correctas | Fallos |
| --- | ---: | ---: |
| **V81 — reservas y mocks de Windows/Docker** | **38** | **0** |
| V80 — laboratorio hipotético y aislamiento | 51 | 0 |
| V79 — diagnóstico de capacidad anterior | 26 | 0 |
| V78 — autorizaciones | 45 | 0 |
| V77 — inventario y seguridad multiempresa | 38 | 0 |
| V76 — privilegios y recuperación | 47 | 0 |
| V75 — lectura simulada de sesiones | 38 | 0 |
| V74 — autenticación | 39 | 0 |
| V73 — límites proveedores | 34 | 0 |
| V72 — sesiones y rotación | 28 | 0 |
| V71 — JWT | 44 | 0 |
| V70 — regresión nativa | 92 | 0 |
| **Total** | **520** | **0** |

El éxito prueba el código **con datos simulados**, no PostgreSQL real, salud actual de BAZAR ni memoria real de Windows. GitHub Actions se conecta a GitHub para checkout e instalación de Node, pero los tests no invocan los comandos Windows/Docker reales.

## 6. Qué falta para pasar a laboratorio

1. Ejecutar V81 **en Windows** y revisar el espacio de un **disco interno fijo** distinto del SD USB, o liberar espacio suficiente en C: para reservas combinadas. No inventar capacidad en otra unidad.
2. Recuperar margen de RAM sin parar el PostgreSQL protegido de BAZAR. Si no es viable, seleccionar otra computadora o un laboratorio aislado externo con aprobación específica.
3. Definir la ubicación real, controles de aislamiento, identidades, políticas de red y datos ficticios, y obtener autorizaciones independientes de V78.
4. Antes de ejecutar SQL, revisar compatibilidad del esquema PG17 y los contratos de V77. Las pruebas con dos empresas, catálogo RLS y restauración requieren evidencias reales posteriores.

**Cierre técnico:** V81 está terminada en **código y CI**. **32/32 controles operativos V67 siguen PENDING**. No se modificó Supabase, BAZAR, Lovable ni producción.

## 7. Corrección posterior del diagnóstico V81 (24/10/2026)

Un primer intento real ejecutado por el usuario desde Windows con Docker context `desktop-linux` produjo `observation:null`, `OBSERVATION_MALFORMED` y `NO_GO`. Este resultado **no es evidencia de que BAZAR-ONLINE esté detenido**, solo que una operación interna del recolector falló o produjo datos ininterpretables. La versión inicial suprimía completamente el motivo.

Se implementó una mejora de seguridad y diagnóstico:

- `diagnosticStage` en la salida; `null` si la colección termina sin lanzar una excepción; en caso de error, uno de `WINDOWS_QUERY`, `WINDOWS_JSON`, `DOCKER_QUERY` o `DOCKER_JSON`, además de `INVALID_ARGUMENTS` en llamadas incorrectas de la librería.
- Las excepciones de PowerShell/Docker, rutas, contraseñas, stderr y salidas completas **no se imprimen**; únicamente el nombre fijo de la etapa.
- Se admite una marca BOM UTF-8 al principio del resultado PowerShell para evitar un error de análisis espurio.
- Se añadieron seis pruebas para cuatro fases de error, BOM y rechazo de argumentos que pudieran alterar el propósito del diagnóstico.

**Última ejecución de CI aprobada:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40134998537, `44/44` V81 y **526/526** con todas las regresiones, 0 fallos. Este CI solo utiliza procesos simulados y no reprodujo el error en Windows real.

Para repetir la medición, basta **descargar de nuevo solo** `scripts/inspect-pg-host-v81.cjs` al directorio anterior y ejecutar el mismo comando con `--target-drive=C`. La dependencia `server/pg-host-feasibility-v81.cjs` no cambió. Compartir la salida `diagnosticStage` permite reparar la consulta concreta sin arriesgar BAZAR-ONLINE.

**El dictamen operativo no cambia:** laboratorio PG17 sin aprovisionar, `NO_GO`, 32 verificaciones V67 pendientes, seis permisos V78 PENDING. Sin instalación ni cambios Docker/Supabase.
