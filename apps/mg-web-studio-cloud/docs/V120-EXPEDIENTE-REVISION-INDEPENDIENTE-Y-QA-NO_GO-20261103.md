# MG WEB STUDIO CLOUD — V120: expediente único de revisión independiente y decisión Supabase QA

**Fecha de consolidación:** 2026-11-03 (Ecuador). **Tipo:** documento de entrega; no es auditoría humana ni autorización.
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`, [PR #7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7), rama `docs/mg-web-studio-v94-preflight-20261101`.
**Estado:** `REVIEW_PACKAGE_READY / HUMAN_REVIEW_PENDING / QA_DDL_NOT_AUTHORIZED / PRODUCTION_NO_GO`.
**Problema de cierre:** el alcance de laboratorio está documentado, pero todavía no existe **revisor independiente designado ni dictamen humano**; aprobar CI no equivale a aprobar los 32 casos V67.

## 1. Fuentes originales verificadas por Git blob SHA

Los cinco archivos se leyeron del mismo PR y sus SHA coinciden con las referencias documentadas; los cuatro primeros mantienen su estado formal sin modificar.

| Fuente en `apps/mg-web-studio-cloud/docs/` | Blob SHA |
|---|---|
| `V67-EVIDENCIAS-PENDIENTES.json` | `4e16db6b1d09940133a49f287d328cc0f5c41435` |
| `V91-MATRIZ-COBERTURA-V67.json` | `1527e381425a17add4134c542b6302c215c67099` |
| `V93-PAQUETE-REVISION-INDEPENDIENTE.json` | `0630b45637aa257bd7705f943f0957af36315d47` |
| `V94-MANIFIESTO-DEPENDENCIAS-SIN-EJECUCION.json` | `b09cccb99ffe1c0d285375b761f7a743f2b14890` |
| `V95-TRAZABILIDAD-32-CONTROLES-V94B.json` | `2e2b05bd9afa26e13083dcf50b86b0ad2ca195c3` |

**Integridad cruzada:** V67 tiene 32 casos `PENDING` y `decision: NO_GO`; V93 tiene `reviewerAssigned: false`; V95 mantiene 32 casos con `formalStatus=PENDING` y `independentDecision=NOT_REVIEWED`. Esta lectura automatizada **no equivale a una firma independiente**.

## 2. Evidencias nuevas reutilizables, sin repetir pruebas aprobadas

| Fase | Evidencia verificable | Lo que NO demuestra |
|---|---|---|
| V107/V108 | Auth/TOTP real QA, limpieza confirmada | Revocación instantánea ni autorización de negocio |
| V109 | 21/21 pruebas de contrato offline | Sesiones de origen primario real |
| V110 | 13/13 PG17 ledger privado | DDL permitido/aplicado en Supabase QA |
| V111 | 12/12 PG17 rol escritor | Principal backend real aprobado |
| V112 | 11/11 PG17 rollback protegido | Reversión bajo carga/con datos productivos |
| V114 | 23/23 revisión de propuestas SHA | Aprobación humana de SQL |
| V115 | 22/22 adaptador con conexión simulada | Conexión PostgreSQL real |
| V116 | [11/11 PG17](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41584359140), concurrencia y fallo de commit | Sesión/Auth Supabase real ni negocio real |
| V117 | [13/13 CI](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41584359086), `npm ci` y lockfile de integridad | Cadena de suministro/productivo completa |
| V118 | [15/15 PG17](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41759192024), cuenta no administradora y descarte físico de sesión | TLS real, pooler Supabase, secreto/cuenta productiva |
| V119 | [18/18 PG17](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41760179573), rollback conjunto de ledger y operación ficticia | Revocación `auth.sessions` real; atomicidad entre servicios externos |

Las evidencias posteriores a V95 **no alteran automáticamente sus etiquetas técnicas ni el estado formal V67**. Los casos de prueba V119 usan un proveedor de sesión **simulado** y una tabla empresarial **ficticia** en un único PostgreSQL; una revocación después del último chequeo puede correr contra el `COMMIT`.

## 3. Revisión de Supabase QA realizada sin cambios

En el proyecto **MG WEB STUDIO AUTH QA**, referencia `tbfhiqkivsoeuudlpkgi`, una consulta de solo lectura devolvió:
- Estado `ACTIVE_HEALTHY`, PostgreSQL `17.11` (proyecto reporta `17.11.0.011`).
- `auth.users = 0`, `auth.sessions = 0`, `auth.mfa_factors = 0`.
- 0 tablas listadas en los esquemas `public` y `mg_auth_ledger`.
- Esquema `mg_auth_ledger`, rol `mg_auth_ledger_writer` y tabla `mfa_redemptions`: **ausentes**.
- Asesor de seguridad sin avisos en la consulta realizada; **eso no certifica seguridad**.
- La configuración Data API persistida (esquemas expuestos e interruptor de exposición automática) **no fue observada directamente por este inventario**. Verificación visual nuevamente obligatoria antes de DDL.

**No se ejecutó DDL, DML, migración, cambio de Auth, ACL, Data API ni producción** en esta revisión.

## 4. Matriz V67 para dictamen independiente (32/32 pendientes)

**Leyenda:** `LAB_OBSERVED` = observado en laboratorio, `PARTIAL` = parcial, `NOT_EXERCISED` = sin ensayo. Las clases reflejan **V95**, no un dictamen nuevo.

| Control | Cobertura V95 | Verificación/requisito pendiente documentado | Estado formal |
|---|---|---|---|
| HTTP-01 | LAB_OBSERVED | Revisión independiente de ejecución y respuesta | PENDIENTE |
| HTTP-02 | LAB_OBSERVED | Revisión independiente de logs V87 | PENDIENTE |
| HTTP-03 | LAB_OBSERVED | Revisión independiente de logs V87 | PENDIENTE |
| HTTP-04 | LAB_OBSERVED | Revisión independiente de logs V87 | PENDIENTE |
| HTTP-05 | LAB_OBSERVED | Revisión independiente de logs V87 | PENDIENTE |
| HTTP-06 | PARTIAL | Probar en el proxy/TLS de ingreso autorizado los mismos límites | PENDIENTE |
| HTTP-07 | LAB_OBSERVED | Revisión independiente de logs y entorno V87 | PENDIENTE |
| HTTP-08 | LAB_OBSERVED | Revisión independiente de trazas sanitizadas | PENDIENTE |
| HTTP-09 | LAB_OBSERVED | Revisión independiente de logs V87 | PENDIENTE |
| HTTP-10 | PARTIAL | Probar slow headers y ausencia de fugas bajo carga pequeña aprobada | PENDIENTE |
| HTTP-11 | LAB_OBSERVED | Revisión independiente de logs V87 | PENDIENTE |
| HTTP-12 | LAB_OBSERVED | Revisión independiente de logs V87 | PENDIENTE |
| HTTP-13 | LAB_OBSERVED | Revisión independiente de logs V87 | PENDIENTE |
| HTTP-14 | PARTIAL | Enrutamiento desde proxy/TLS real autorizado con identidad de origen verificada | PENDIENTE |
| LOAD-01 | LAB_OBSERVED | Revisión independiente; validar topes finales en ingress real | PENDIENTE |
| LOAD-02 | LAB_OBSERVED | Revisión independiente; comprobar bajo topología proxy real | PENDIENTE |
| LOAD-03 | PARTIAL | Medir memoria, backlog, sockets y cancelación SQL en ensayo acotado más representativo | PENDIENTE |
| OBS-01 | PARTIAL | Auditar muestra real de emisión/almacenamiento sin datos sensibles | PENDIENTE |
| OBS-02 | PARTIAL | Correlacionar rechazos 401/403/404/429/503 entre capas sin exponer identidad | PENDIENTE |
| OBS-03 | NOT_EXERCISED | Definir y aprobar responsable, política, cifrado, retención y borrado de logs | PENDIENTE |
| OBS-04 | NOT_EXERCISED | Aprobar runbook de incidentes, alertas, niveles y responsable | PENDIENTE |
| AUTH-01 | PARTIAL | Probar sesión/JWT de proveedor de ensayo autorizado y revocación persistida | PENDIENTE |
| AUTH-02 | PARTIAL | Prueba end-to-end con identidad de ensayo, DB de producto y scopes | PENDIENTE |
| AUTH-03 | PARTIAL | Demostrar MFA servidor-verified en operaciones elevadas con identidad de prueba | PENDIENTE |
| DATA-01 | PARTIAL | Catalogar roles reales, ACL/defaults, bypass/service_role y políticas de esquema final | PENDIENTE |
| DATA-02 | PARTIAL | Probar cancelación y deadline de transacción real sin escrituras persistentes | PENDIENTE |
| REC-01 | LAB_OBSERVED | Revisión independiente y repetir con esquema autorizado completo | PENDIENTE |
| REC-02 | PARTIAL | V94B restaura V45/16 tablas, pero no acredita historia completa de migraciones, Auth real ni integración Supabase; revisión independiente pendiente | PENDIENTE |
| REC-03 | LAB_OBSERVED | V94B ejecutó 56/56 pgTAP V53 sobre un PG17 restaurado con Auth ficticio; requiere dictamen independiente y no valida Auth real | PENDIENTE |
| REC-04 | PARTIAL | Aprobar backup cifrado, retención, restauración completa y RPO/RTO medidos | PENDIENTE |
| OPS-01 | PARTIAL | Aprobación separada de interfaz/puerto/TLS/firewall, duración y operador | PENDIENTE |
| OPS-02 | NOT_EXERCISED | Obtener dictamen independiente y aprobación productiva separada con rollback | PENDIENTE |

**Totales V95:** 15 observados, 14 parciales y 3 no ensayados. **32 PENDING / 0 PASS.**

## 5. Decisiones humanas necesarias antes de una instalación controlada en QA

| Puerta | Quién debe decidir | Evidencia/criterio mínimo | Estado |
|---|---|---|---|
| A. Revisión DBA/Seguridad | Persona distinta del ejecutor | Dictamen del DDL V110/V111/V112, RLS, ownership, `WITH CHECK(true)`, aislamiento Data API, privilegios `public` y política de limpieza | **SIN REVISOR** |
| B. Backend y secretos | DBA + responsable del backend | Principal privado y rol `NOLOGIN`, TLS validado, modo de pool compatible con cambios de rol, custodia/rotación de secretos, límites de conexiones | **PENDIENTE** |
| C. Sesión autoritativa | Responsable Auth + Seguridad | Diseño soportado para verificar sesión actual/revocación sin otorgar SELECT directo de `auth.sessions` a clientes ni crear `SECURITY DEFINER` inseguro | **PENDIENTE** |
| D. Negocio transaccional | Responsable de producto/arquitectura | Idempotencia y recuperación de acción real, incluyendo fallo y pérdida de confirmación; control entre servicios si interviene otra base/API | **PENDIENTE** |
| E. Data API y ACL | DBA + propietario | Confirmación en Dashboard de esquemas expuestos y autoexposición, catálogo de grants, `service_role` y roles públicos, sin cambios globales injustificados | **PENDIENTE** |
| F. Recuperación/rollback | DBA + operaciones | Copias, retención, permisos, control de conexiones activas; rollback V112 ensayado con alcance real y criterios de aborto | **PENDIENTE** |
| G. Permiso para SQL solo QA | Propietario | Autorización **expresa y delimitada** para aplicar exactamente los archivos revisados V110/V111 en `MG WEB STUDIO AUTH QA` | **NO CONCEDIDA** |
| H. Firma V67 y despliegue | Revisor independiente y propietario | Acta de 32 controles, trazabilidad de evidencias y aceptación de riesgos; decisión de despliegue **separada** | **NO_GO** |

### Plantilla para la persona revisora (NO completada)

- Revisor/a y afiliación: **POR DESIGNAR**
- Canal de entrega del dictamen: **PDF o documento firmado, revisado fuera de GitHub; la persona revisora no necesita cuenta GitHub**. El propietario puede adjuntarlo o enlazarlo desde el Issue #8, sin incluir datos ni secretos sensibles.
- Relación con autor/ejecutor: **POR VALIDAR**
- Fecha, SHA del PR y alcance inspeccionado: **POR COMPLETAR**
- Dictamen sobre DDL, privacidad, RLS, Auth, red y retención: **SIN DICTAMEN**
- Decisión por cada caso V67: **NO REVIEWED**
- Evidencia adjunta y observaciones firmadas: **NINGUNA**
- Decisión sobre **aplicación QA**: **NO AUTORIZADA**
- Decisión sobre **producción**: **NO_GO**

## 6. Procedimiento concreto para avanzar

1. Identificar una **persona real y diferente del desarrollador/ejecutor** con experiencia en PostgreSQL/Supabase y seguridad. **No hace falta otra cuenta GitHub**: podrá leer el expediente exportado y entregar un dictamen fechado y firmado fuera de GitHub. El propietario podrá registrar su referencia o adjuntarlo en [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8), ocultando datos personales innecesarios. Si todavía no existe esta persona, la revisión sigue **PENDIENTE**; no inventar revisor, firma ni aprobación.
2. Compartir el PR #7 en borrador (solo lectura), este expediente y la matriz V95 mediante enlaces o copia del material necesario. El revisor externo puede trabajar sin acceso de escritura ni credenciales Supabase. Debe evaluar especialmente la confianza de `readPrimarySession`, la carrera entre revocación y `COMMIT`, la exposición Data API y el modelo `NOLOGIN`/pool.
3. Pedir dictamen escrito `APPROVE`, `REQUEST_CHANGES` o `NEEDS_EVIDENCE` **para el alcance de QA**, con requisitos y SHA revisados. No convertir ese dictamen en `PASS` V67 automáticamente.
4. Solo cuando A–F estén satisfechos y el propietario autorice por separado G, preparar una ejecución controlada **solo en QA**. Nunca ejecutar SQL de laboratorio como migración productiva.
5. Mantener el PR #7 en `draft` y producción `NO_GO` hasta una evaluación independiente y autorización operacional posteriores.

**Alternativa mientras no haya revisor:** continuar únicamente auditoría estática, ensayos sintéticos y preparación de documentación. Un autochequeo del propietario o una revisión con IA puede ayudar a identificar problemas, pero **no sustituye el dictamen humano independiente** exigido para levantar el bloqueo actual de V67/producción. Crear una segunda cuenta propia de GitHub tampoco constituye independencia.

**Resultado de este paquete:** documentación suficiente para solicitar revisión, **no autorización para SQL ni despliegue**.
