# MG WEB STUDIO CLOUD — V70 | Ejecutor nativo Node.js con bloqueo de red

**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** herramientas creadas y verificadas en Node.js 22.16.0. **Ejecutor preparado**, pero la batería nativa integral V60–V69 permanece **PENDIENTE DE EJECUCIÓN** con la copia completa del repositorio. **NO GO** para publicar, conectar PostgreSQL, consultar Supabase y abrir puertos.

## Entrega

- `server/native-network-guard-v70.cjs`: precarga (`--require`) de prueba que interrumpe intentos de `net.Server.listen`, `net.Socket.connect`, clientes `http`/`https`, `tls.connect`, `http2.connect`, `dgram.createSocket` y operaciones de `dgram.Socket`. Permite construir un servidor **sin escucharlo**. No crea ningún listener, no llama a bases de datos y no lee credenciales.
- `scripts/run-v70-native-regressions.cjs`: ejecutor de siete suites existentes (V63, V65, V66 y V69) mediante **Node real**, con la guarda anterior precargada, sin ejecución implícita. El único modo de ejecución es `--run-local-tests`; `--check` solo verifica presencia de archivos. Si falta uno, retorna código 2 e indica **V70_BLOCKED**.
- `tests/native-network-guard-v70.test.cjs`: 14 pruebas de la precarga, control de red y modo de ejecución, incluidas invocaciones de `node` mediante `spawnSync` en procesos separados.
- `docs/V70-NATIVE-NODE-SIN-RED.md`: este informe.

## QA comprobado en esta etapa

Ejecución **real de Node.js 22.16.0** en el entorno aislado del agente:

```sh
node --test tests/native-network-guard-v70.test.cjs
```

**14/14 pruebas correctas, 0 fallos.** Se comprobó que intentos de apertura TCP, conexiones salientes TCP/TLS/HTTP/2 y UDP se bloquean; un `http.Server` no enlazado se puede construir; la guarda funciona con precarga nativa, rechaza ejecuciones accidentales y no otorga permiso de despliegue.

`node scripts/run-v70-native-regressions.cjs --check` se ejecutó también en el entorno del agente, donde no están materializadas las siete suites existentes: devolvió `missingSuites: 7`, estado `NO_GO` y código de salida **2** por diseño. **Este resultado NO es un fallo de las suites del producto ni equivale a una ejecución nativa de V60–V69.** Los archivos correspondientes sí se verificaron presentes en la rama remota de GitHub. Para completar V70 hay que ejecutar el comando siguiente dentro de un checkout real con todos los archivos.

## Comandos para checkout local completo (no ejecutados por este agente)

En la computadora Windows con acceso al repositorio:

```powershell
cd "D:\Proyecto\glovermarkou05-commits.github.io\apps\mg-web-studio-cloud"
node --version
node scripts/run-v70-native-regressions.cjs --check
if ($LASTEXITCODE -ne 0) { throw "Faltan archivos para la V70; no ejecutar" }
node --test tests/native-network-guard-v70.test.cjs
if ($LASTEXITCODE -ne 0) { throw "Fallo proteccion V70" }
node scripts/run-v70-native-regressions.cjs --run-local-tests
if ($LASTEXITCODE -ne 0) { throw "Fallo integracion nativa V60-V69" }
```

**Nota:** la ruta Windows anterior es solo un ejemplo de una copia local del repositorio; comprobar la carpeta real antes de ejecutarla. No instalar paquetes ni depender de servicios externos. En ningún momento se necesita configurar un puerto, JWT real, un usuario Supabase o una conexión PostgreSQL.

## Cobertura y límites de la protección

La precarga es **defensa en profundidad dentro del proceso Node**, no un aislamiento de sistema operativo, firewall ni contenedor de seguridad. No intercepta todas las vías posibles hacia la red (por ejemplo, un subproceso lanzado deliberadamente con otros argumentos, enlaces nativos o API no enumeradas); ejecutar únicamente suites revisadas, con datos sintéticos, dentro de un entorno aislado. La guarda sustituye temporalmente funciones de módulos Node **solo dentro del proceso de pruebas**, nunca en un backend de producción.

Las suites seleccionadas incluyen:

1. `unbound-tenant-stack-v69-real.test.cjs`: ensamblaje de V60–V66 sin servicios reales.
2. `unbound-tenant-stack-v69.test.cjs` y `lab-proposal-v69.test.cjs`: contratos y autorización separada.
3. `request-budget-v66.test.cjs` y `request-budget-v66-integration.test.cjs`: límites de origen, concurrencia y telemetría.
4. `http-server-v65-integration.test.cjs`: frontera de servidor no enlazado.
5. `http-site-gate-v63-integration.test.cjs`: puerta HTTP en sobre sintético.

La V70 no configura verificación JWT criptográfica ni driver PostgreSQL y tampoco implementa `listen()`. Los controles operativos V67 continúan **32/32 PENDING**, sin evidencia de parser de red, Auth real o restauración. El ejercicio PostgreSQL 17 sigue pausado; ninguna validación de V70 elimina esa condición para publicar.

## Próximo hito antes de cerrar V70

Consolidar el repositorio en la máquina que ejecute los tests, obtener salida TAP íntegra de las siete suites, revisar cualquier fallo, registrar versión Node y confirmación de **cero puertos abiertos**. Solo entonces declarar “V70 integración nativa completa”. Un futuro ensayo del parser HTTP por loopback exige otra autorización expresa y una política de red específica; las pruebas actuales no la otorgan.

**Dictamen al 23/10/2026:** infraestructura de pruebas nativas V70 implementada y 14 controles locales validados. Ejecución nativa integral pendiente por ausencia de checkout completo. **NO GO** para red, STAGING y producción.
