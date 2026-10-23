# MG WEB STUDIO CLOUD — V70 | Integración nativa de Node.js verificada

**Rama:** `feature/mg-digital-v5-web-services`  
**Estado de V70:** **COMPLETADA en el alcance de pruebas nativas con datos sintéticos, sin abrir listeners de aplicación.**  
**Entorno:** GitHub Actions, Node.js **v22.23.3**, Linux GitHub-hosted runner, 23/10/2026.  
**Autenticación JWT real, parser HTTP por red, driver PostgreSQL real, restore, STAGING y producción: NO GO.**

## Evidencia primaria y trazabilidad

- **GitHub Actions:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39964844162
- **Run ID:** `39964844162` · **Job ID:** `120451900205`
- **Commit de ejecución:** `8c193a0553ccbf1df29fdcf7feca9eb0f8ff6069`
- **Conclusión GitHub:** `completed / success`, todas las etapas de pruebas concluyeron con éxito.
- **Check de checkout:** `plannedSuites: 7`, `missingSuites: 0`, `networkAuthorized: false`, `databaseAuthorized: false`, `deploymentAuthorized: false`, `readiness: NO_GO`.

### Resultado TAP verificado en los logs de GitHub

| Ejecución | Pruebas | Correctas | Fallos |
| --- | ---: | ---: | ---: |
| `node --test tests/native-network-guard-v70.test.cjs` | 14 | 14 | 0 |
| `node scripts/run-v70-native-regressions.cjs --run-local-tests` (**siete archivos de suites**) | 92 | 92 | 0 |
| `node --require ./server/native-network-guard-v70.cjs --test tests/unbound-tenant-stack-v70-native.test.cjs` | 25 | 25 | 0 |
| **TOTAL de ejecuciones** | **131** | **131** | **0** |

Los 25 tests de la tercera línea amplían y en parte repiten los escenarios de integración del ejecutor de siete suites. **131** es el recuento de tests ejecutados, no de controles de seguridad independientes ni de validaciones HTTP reales. El primer ensayo CI V70, hecho antes de completar el ejecutor, ya había pasado **32/32** en dos corridas distintas: https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/39962698573 . La ejecución ampliada anterior es la evidencia para cerrar esta etapa.

**Resultado del laboratorio local limitado:** Node.js v22.16.0 ejecutó **14/14** verificaciones de la guarda y el modo `--check` reportó correctamente que faltaban siete suites en el contenedor; el código de salida 2 fue deliberado. Posteriormente GitHub Actions comprobó y ejecutó las siete suites desde el checkout completo, con código de salida cero.

## Qué quedó implementado

- `server/native-network-guard-v70.cjs`: precarga Node `--require` para rechazar APIs directas de apertura de listeners TCP, conexiones TCP/TLS y clientes HTTP/HTTPS/HTTP2 y UDP. Construir un `http.Server` sin `listen()` sigue permitido.
- `scripts/run-v70-native-regressions.cjs`: declara exactamente siete suites, verifica todos los archivos antes de correrlos y ejecuta en Node real con la precarga y un timeout del proceso hijo.
- `tests/native-network-guard-v70.test.cjs`: comprueba en procesos aislados el bloqueo de distintas APIs; su `--check` funciona tanto en checkout parcial como completo, sin confundir presencia de archivos con autorización de publicación.
- `tests/unbound-tenant-stack-v70-native.test.cjs`: 25 verificaciones nativas adicionales que recorren **V60–V69** mediante componentes originales, JWT y consultas simulados (no criptografía ni base de datos real).
- `.github/workflows/mg-web-studio-v70-native.yml`: trabajo con `permissions: contents: read`, `persist-credentials: false`, Node 22, sin secretos ni pasos de despliegue. Solo se dispara por cambios de **este archivo de workflow** o por una ejecución manual posterior. Al cargar la rama, GitHub puede usar la red **para checkout y configuración de Node**, pero la precarga bloquea APIs de red enumeradas **dentro del proceso de pruebas**.

## Comandos reproducibles en checkout completo

Desde `apps/mg-web-studio-cloud`:

```sh
node scripts/run-v70-native-regressions.cjs --check
node --test tests/native-network-guard-v70.test.cjs
node scripts/run-v70-native-regressions.cjs --run-local-tests
node --require ./server/native-network-guard-v70.cjs --test tests/unbound-tenant-stack-v70-native.test.cjs
```

No requieren `listen()`, ni claves reales de Supabase, ni configuración PostgreSQL, ni paquetes externos añadidos al proyecto. El ejecutor bloquea checkout incompleto.

## Restricciones explícitas

1. **No se probó el parser HTTP sobre TCP.** `EventEmitter` sintético y `http.Server` construido sin listener no prueban protección real frente a framing malicioso, request smuggling, proxies, TLS o HTTP/2.
2. **No se probó autenticación JWT criptográfica.** El `verifyAccessToken` se inyectó con casos simulados; emisor, audiencia, expiración, sesiones revocadas y MFA real siguen por integrar y validar.
3. **No se conectó PostgreSQL.** Las consultas V62 se comprobaron parametrizadas y de lectura, pero `query` devolvió filas sintéticas. Siguen pendientes GRANT, RLS, roles de mínimo privilegio, TLS, timeouts reales y aislamiento multiempresa contra una base real.
4. **La guarda V70 no equivale a un sandbox de sistema operativo.** Las APIs de red interceptadas no incluyen todos los mecanismos posibles (por ejemplo, un módulo nativo, un subproceso que no herede la guarda o futuros módulos). Los procesos de GitHub Actions emplean red para el checkout inicial; la afirmación de aislamiento se refiere a la ejecución del código bajo precarga.
5. **Las 32 verificaciones operativas V67 siguen PENDING.** No se realizó restauración PostgreSQL 17, comprobación de RPO/RTO, pruebas reales del parser ni despliegue. La evidencia V70 no sustituye las autorizaciones específicas.
6. **El flujo CI no publica ni modifica la web**. No se ejecutó SQL, migraciones, llamadas a servicios Lovable ni conexión a STAGING. Los controles de seguridad siguen bloqueando la preparación para producción.

## Continuidad — V71 recomendada

Preparar un **verificador criptográfico real de JWT solo con claves y tokens de prueba generados localmente**, evaluando `iss`, `aud`, `exp`, `nbf`, rotación y rechazo de algoritmos inseguros, antes de conectarlo a un emisor Auth real. Mantener el laboratorio y el backend sin puertos, Supabase, publicaciones o credenciales productivas.

**Dictamen:** **V70 cerrada a nivel de pruebas nativas y regresión sintética: 131/131 PASS, 0 FAIL.** Red real, Auth real, PostgreSQL, recuperación y producción: **NO GO**.
