# MG WEB STUDIO CLOUD — V91 | Auditoría integral de evidencias V67

**Fecha de auditoría:** 29 de octubre de 2026, Ecuador  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama exclusiva:** `feature/mg-digital-v5-web-services`  
**Modalidad autorizada:** revisión documental + comprobación de integridad offline. **Sin** bases de datos, red de aplicación, restore, servicios ni publicación.

## 1. Dictamen ejecutivo

> **NO_GO para producción.** Las pruebas reales V85–V90 han reducido incertidumbre y aportan evidencia útil, pero **ninguno de los 32 controles V67 tiene firma de verificación independiente**, y el fichero canónico `docs/V67-EVIDENCIAS-PENDIENTES.json` continúa con **32 `PENDING`, cero `PASS`**. Nunca se debe actualizar por inferencia de una ejecución GitHub correcta.

| Estado de evidencia técnica (NO estado formal V67) | Cantidad | Qué significa |
| --- | ---: | --- |
| **Observada en laboratorio** | **14** | Se obtuvo una observación real para el criterio principal en un entorno sintético delimitado; resta revisión independiente y, donde aplique, repetir bajo configuración final |
| **Parcial** | **14** | Existe evidencia relacionada, pero el criterio integral todavía tiene una condición sin verificar |
| **Sin ejecución exigida** | **4** | No hay ejecución de la prueba exigida, aunque pueda haber documentación o ensayos históricos cercanos |
| **Total** | **32** | Inventario completo sin duplicar subcasos HTTP ni suites unitarias |

Las clases anteriores son **una clasificación de auditoría, no una validación de cumplimiento**. No deben reportarse como “14 controles aprobados”. Tampoco se deben sumar las 21 peticiones V87, las 211 pruebas V88, ni las 22 pruebas V90 como 254 controles V67; son unidades de prueba de distinto alcance.

**Elementos de bloqueo inmediatos:** `OBS-03`, `OBS-04`, `REC-03`, `OPS-02` permanecen sin la ejecución/evidencia exigida. Los otros 14 clasificados “parcial” exigen pruebas o decisiones adicionales.

## 2. Procedencia de resultados GitHub verificados

Se contrastaron mediante consulta al estado de las ejecuciones de GitHub Actions los trabajos de V85–V90, todos en la rama de desarrollo y `completed/success`. Los informes de cada etapa documentan lo que se ejecutó y sus límites:

| Etapa | Ejecución GitHub | Documento | Estado |
| --- | --- | --- | --- |
| V85 | [Ejecución 40631071278](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40631071278) | [Informe](V85-POSTGRES17-EFIMERO-ARRANQUE-AUTORIZADO.md) | Confirmada `completed/success` en consulta de GitHub |
| V86 | [Ejecución 40631943233](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40631943233) | [Informe](V86-PRUEBAS-SQL-REALES-RLS-DOS-EMPRESAS.md) | Confirmada `completed/success` en consulta de GitHub |
| V87 | [Ejecución 40633105863](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40633105863) | [Informe](V87-EVIDENCIAS-HTTP-LOOPBACK-REALES.md) | Confirmada `completed/success` en consulta de GitHub |
| V88 | [Ejecución 40633873753](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40633873753) | [Informe](V88-EVIDENCIA-JWT-FIRMADOS-REVOCACION-MULTIEMPRESA.md) | Confirmada `completed/success` en consulta de GitHub |
| V89 | [Ejecución 40635697392](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40635697392) | [Informe](V89-EVIDENCIAS-REALES-LIMITES-CONCURRENCIA-HTTP.md) | Confirmada `completed/success` en consulta de GitHub |
| V90 | [Ejecución 40640914974](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40640914974) | [Informe](V90-EVIDENCIAS-PG17-BACKUP-RESTORE-SINTETICO.md) | Confirmada `completed/success` en consulta de GitHub |

Como antecedente separado, **V53** reportó **56/56 aserciones pgTAP en STAGING** con identidades ficticias. Esto acredita una prueba histórica sobre el esquema de entonces, **pero NO acredita `REC-03`**: la suite V53 **no se ejecutó sobre la copia restaurada de V90**. [Informe histórico V53](V53-PRUEBAS-RLS-PGTAP.md).

El catálogo `security-acceptance-v67.cjs` y el paquete `v67-operational-pack-v82.cjs` son las fuentes de IDs, tipos de evidencia, condiciones de ejecución y aprobaciones separadas. Las guías antiguas V67/V78 deben leerse históricamente: describen un momento en que aún no se había elegido GitHub Actions ni realizado V85–V90. Esta V91 actualiza **el estado documental** sin mutar sus pruebas, permisos ni el catálogo formal.

## 3. Matriz exhaustiva: los 32 controles y lo que falta

| Control | Cobertura técnica V91 | Evidencia vinculada | Acción necesaria antes de aceptación formal |
| --- | --- | --- | --- |
| `HTTP-01` | Observada en laboratorio | V87 | Revisión independiente de ejecución y respuesta |
| `HTTP-02` | Observada en laboratorio | V87 | Revisión independiente de logs V87 |
| `HTTP-03` | Observada en laboratorio | V87 | Revisión independiente de logs V87 |
| `HTTP-04` | Observada en laboratorio | V87 | Revisión independiente de logs V87 |
| `HTTP-05` | Observada en laboratorio | V87 | Revisión independiente de logs V87 |
| `HTTP-06` | Parcial | V87 | Probar en el proxy/TLS de ingreso autorizado los mismos límites |
| `HTTP-07` | Observada en laboratorio | V87 | Revisión independiente de logs y entorno V87 |
| `HTTP-08` | Observada en laboratorio | V87 | Revisión independiente de trazas sanitizadas |
| `HTTP-09` | Observada en laboratorio | V87 | Revisión independiente de logs V87 |
| `HTTP-10` | Parcial | V87 | Probar slow headers y ausencia de fugas bajo carga pequeña aprobada |
| `HTTP-11` | Observada en laboratorio | V87 | Revisión independiente de logs V87 |
| `HTTP-12` | Observada en laboratorio | V87 | Revisión independiente de logs V87 |
| `HTTP-13` | Observada en laboratorio | V87 | Revisión independiente de logs V87 |
| `HTTP-14` | Parcial | V87, V89 | Enrutamiento desde proxy/TLS real autorizado con identidad de origen verificada |
| `LOAD-01` | Observada en laboratorio | V89 | Revisión independiente; validar topes finales en ingress real |
| `LOAD-02` | Observada en laboratorio | V89 | Revisión independiente; comprobar bajo topología proxy real |
| `LOAD-03` | Parcial | V89 | Medir memoria, backlog, sockets y cancelación SQL en ensayo acotado más representativo |
| `OBS-01` | Parcial | V87, V89 | Auditar muestra real de emisión/almacenamiento sin datos sensibles |
| `OBS-02` | Parcial | V87, V89 | Correlacionar rechazos 401/403/404/429/503 entre capas sin exponer identidad |
| `OBS-03` | Sin ejecución exigida | — | Definir y aprobar responsable, política, cifrado, retención y borrado de logs |
| `OBS-04` | Sin ejecución exigida | — | Aprobar runbook de incidentes, alertas, niveles y responsable |
| `AUTH-01` | Parcial | V88 | Probar sesión/JWT de proveedor de ensayo autorizado y revocación persistida |
| `AUTH-02` | Parcial | V88, V86, V53 anterior | Prueba end-to-end con identidad de ensayo, DB de producto y scopes |
| `AUTH-03` | Parcial | V88 | Demostrar MFA servidor-verified en operaciones elevadas con identidad de prueba |
| `DATA-01` | Parcial | V86, V53 anterior | Catalogar roles reales, ACL/defaults, bypass/service_role y políticas de esquema final |
| `DATA-02` | Parcial | V86, V89 | Probar cancelación y deadline de transacción real sin escrituras persistentes |
| `REC-01` | Observada en laboratorio | V90 | Revisión independiente y repetir con esquema autorizado completo |
| `REC-02` | Parcial | V90 | Comparar tablas/esquemas completos, migraciones, extensiones no predeterminadas |
| `REC-03` | Sin ejecución exigida | V90, V53 anterior | Ejecutar pgTAP V53 contra copia restaurada con esquema MG y dependencias compatibles |
| `REC-04` | Parcial | V90 | Aprobar backup cifrado, retención, restauración completa y RPO/RTO medidos |
| `OPS-01` | Parcial | V85, V87, V89 | Aprobación separada de interfaz/puerto/TLS/firewall, duración y operador |
| `OPS-02` | Sin ejecución exigida | — | Obtener dictamen independiente y aprobación productiva separada con rollback |

### Interpretación por grupo

**HTTP — 14 controles.** El parser real Node pasó 21 solicitudes pequeñas V87: 11 controles tienen observación directa y **HTTP-06**, **HTTP-10** y **HTTP-14** siguen parciales por el proxy, límites de cabeceras incompletas y confianza en forwarding headers. No se comprobó TLS/ingress público. Reutilizar logs de V87; no repetir el mismo parser si no cambia el código.

**LOAD — 3 controles.** V89 comprobó rechazo 503, rechazo 429 y recuperación con 12 solicitudes pequeñas. **LOAD-03** continúa parcial porque el delta RSS redondeado en 1,2 segundos y la ausencia de SQL real no permiten acreditar seguridad de memoria/cola durante trabajo sostenido. No recomendar estrés externo ni pruebas invasivas.

**OBS — 4 controles.** V66/87/89 minimizan los datos emitidos pero no implementan/validan toda la cadena de registro persistente, correlación, retención, cifrado, control de acceso, eliminación, alertas ni responsables. **OBS-03 y OBS-04 sin ejecución exigida.** Estos documentos pueden prepararse sin bases o conectividad.

**AUTH — 3 controles.** V88 pasó 28/28 pruebas con firmas criptográficas ES256 verdaderas y sesiones artificiales en memoria; sus 183 regresiones también pasaron. No se comprobó firma/verificación/revocación frente al proveedor real de pruebas, ni MFA de servidor real, ni flujo autenticado conectado a DB de producto. Las tres coberturas son **parciales**, no MFA validada.

**DATA — 2 controles.** V86 probó de verdad PostgreSQL 17/RLS sobre un fixture de cuatro filas y V53 aportó RLS histórico en STAGING. Falta inventario de ACL/roles de backend definitivo (incluidos grants por defecto, servicio y funciones `SECURITY DEFINER`) y **cancelación de trabajos SQL reales** frente a timeout. Ambos parciales.

**REC — 4 controles.** V90 sí ejecutó `pg_dump`/`pg_restore` sobre dos PostgreSQL 17 independientes, comparó un esquema sintético pequeño y volvió a pasar RLS V86. **REC-01** aporta una observación real directa; **REC-02** es parcial porque no se probó esquema completo, extensiones adicionales ni todas las migraciones; **REC-03** no fue ejecutado sobre la copia restaurada (V53 es antecedente, no cumplimiento); **REC-04** es parcial porque 99/68 ms fueron tiempos de comando en un fixture mínimo, sin RPO/RTO real, cifrado/retención y responsables aprobados.

**OPS — 2 controles.** El usuario sí autorizó etapas aisladas V85–V90, cada una con su alcance: eso aporta evidencia **parcial de OPS-01**, no autorización del proxy/TLS/firewall final. **OPS-02** sigue sin ventana de cambio, aprobación independiente, plan de rollback o permiso de publicación.

## 4. Ruta crítica más corta hacia un cierre verificable

| Orden | Bloque de trabajo | Casos que desbloquea | Qué requiere |
| ---: | --- | --- | --- |
| 1 | **Política operativa, logs y revisión de evidencias existentes** | OBS-01..04 + revisión de HTTP-01..13, LOAD-01/02 y REC-01 | Trabajo documental sin sistemas; revisor/propietario asignado; verificar los logs ya existentes en vez de repetir pruebas |
| 2 | **Laboratorio recuperado con esquema MG completo y pgTAP V53** | REC-02, REC-03, DATA-01 | Aprobación nueva y alcance detallado para construir/restaurar un *nuevo destino efímero con datos ficticios*; SQL de lectura/auditoría; ninguna conexión a STAGING sin autorización específica |
| 3 | **Integración de autorización y cancelación SQL en laboratorio aislado** | AUTH-01..03, DATA-02, LOAD-03 | Identidades de ensayo, backend y sesiones reales de laboratorio, MFA válido, límites de duración, DB con permisos mínimos, y autorización diferenciada para estas acciones |
| 4 | **Ingreso de proxy/TLS, supervisión y planes de recuperación** | HTTP-06/10/14, REC-04, OPS-01 | Autorización expresa de interfaz/puerto/TLS/firewall, cifrado y retención, métricas y simulación acotada; no abrir puertos públicos por defecto |
| 5 | **Evaluación independiente y aprobación de publicación** | Todos los V67 + OPS-02 | Revisar evidencias, titular de decisiones, ventana, plan de reversión, criterios GO/NO_GO; nueva aprobación **explícita** de producción solo después de superar los pasos previos |

**La ruta puede paralelizar SOLO trabajo documental:** política OBS, matriz/firmas de evidencias y preparación de V53 en entorno local sin ejecutar SQL. Las operaciones de red, identidad y restauración requieren consentimientos separados; no se deben unificar en una autorización genérica. No hay una duración ni fecha de salida verificable todavía.

## 5. Integridad de V91 y seguridad de proyectos

Artefactos V91:
- `docs/V91-MATRIZ-COBERTURA-V67.json`: 32 entradas con clase de evidencia, fuentes y brecha explícita; **todos** con `formalStatus: PENDING`.
- `server/v91-evidence-audit.cjs`: función offline de conciliación estricta con el catálogo V67, verifica procedencia documental, clases, cantidad y negativa de GO; nunca convierte pruebas en permisos.
- `scripts/audit-v91-v67-gaps.cjs`: CLI que **lee** exclusivamente los archivos de evidencia de esta rama y emite informe JSON, sin escribir.
- `tests/v91-evidence-gap-audit.test.cjs`: regresiones anti-falsificación de estado, de clasificación y de fuentes.
- `.github/workflows/mg-web-studio-v91-evidence-gap-audit.yml`: auditoría en GitHub Actions, solo documentación y Node; no Docker, SQL, red de producto ni despliegue.

No se modifica `docs/V67-EVIDENCIAS-PENDIENTES.json`, no se altera el catálogo y no se traslada ninguna autorización de GitHub Actions a bases reales. El éxito del job V91 demuestra consistencia del inventario, **no que las 32 condiciones estén satisfechas o firmadas**.

**Dictamen final V91: `NO_GO` para publicación, con 14 observaciones de laboratorio, 14 coberturas parciales, 4 pruebas exigidas no ejecutadas y 32 controles V67 todavía `PENDING`.**
