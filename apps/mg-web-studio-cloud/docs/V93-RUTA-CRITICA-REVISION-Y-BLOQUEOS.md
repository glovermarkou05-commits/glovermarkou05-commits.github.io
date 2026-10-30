# MG WEB STUDIO CLOUD — V93 | Paquete de revisión independiente y ruta crítica

**Fecha:** 29/10/2026, Ecuador  
**Rama:** `feature/mg-digital-v5-web-services`  
**Clasificación:** **PREPARADO / SIN REVISIÓN INDEPENDIENTE / NO_GO**.  
**Autorización recibida:** organizar revisión de V91/V92 y preparar la ruta de cierre para REC-03, AUTH/MFA y DATA-02; **solo documentos y verificaciones offline**. No SQL, RESTORE, IAM, conexiones externas, cargas, operaciones sobre terceros, ni publicación.

## 1. Dictamen operativo: reutilizar evidencia, no repetir sin necesidad

| Categoría V91 | Controles | ¿Están formalmente aprobados? |
| --- | ---: | --- |
| Evidencia observada en laboratorio aislado | **14** | **No; faltan revisión independiente y criterios completos** |
| Evidencia parcial | **14** | **No; hay condiciones técnicas sin ejecutar o demostrar** |
| Prueba exigida sin ejecutar | **4** | **No** |
| Total | **32** | **32 PENDING, 0 PASS** |

Se recuperan los enlaces documentados V85–V90 desde `docs/V91-MATRIZ-COBERTURA-V67.json` y el borrador V92 sin copiarlos ni elevar su clasificación. La aprobación técnica por un job de GitHub **NO** equivale a aprobación humana, ni a autorización de publicación. No se modificó `docs/V67-EVIDENCIAS-PENDIENTES.json`.

**Criterio de cierre:** una persona técnica independiente del autor debe cotejar el catálogo V67, evidencia primaria completa, commit SHA exacto, entorno, fixture, logs sanitizados, límites de la prueba y autorización; registrar dictamen en un sistema de acceso restringido. Si no es verificable, sigue `PENDING`. No escribir nombres, firmas privadas, tokens ni datos de clientes en repositorio público.

## 2. Ruta crítica — ocho bloques sin duplicaciones

| Orden | Bloque | Controles | Situación actual |
| ---: | --- | --- | --- |
| 1 | **Revisión independiente de pruebas ya ejecutadas** | `HTTP-01`, `HTTP-02`, `HTTP-03`, `HTTP-04`, `HTTP-05`, `HTTP-07`, `HTTP-08`, `HTTP-09`, `HTTP-11`, `HTTP-12`, `HTTP-13`, `LOAD-01`, `LOAD-02`, `REC-01` | READY TO ASSIGN REVIEWER |
| 2 | **Política OBS, cifrado, alertas y responsables** | `OBS-01`, `OBS-02`, `OBS-03`, `OBS-04` | DRAFT PENDING PRIVACY REVIEW |
| 3 | **REC-03: restauración del esquema completo y suite V53** | `REC-02`, `REC-03` | BLOCKED ON FULL SCHEMA AND TEST FIXTURES |
| 4 | **Autenticación y MFA con identidades de ensayo** | `AUTH-01`, `AUTH-02`, `AUTH-03` | BLOCKED ON SANDBOX AND AUTH PROVIDER |
| 5 | **Roles efectivos, SQL y cancelación transaccional** | `DATA-01`, `DATA-02` | BLOCKED ON AUTHORIZED PG17 WITH FULL SCHEMA |
| 6 | **Proxy/TLS y límites con red controlada** | `HTTP-06`, `HTTP-10`, `HTTP-14`, `LOAD-03`, `OPS-01` | BLOCKED ON APPROVED PROXY AND INTERFACE |
| 7 | **Cifrado, retención y objetivos de recuperación** | `REC-04` | BLOCKED ON POLICY OWNER AND RPO RTO |
| 8 | **Plan de reversión, ventana y decisión de producción** | `OPS-02` | DEPENDENT ON ALL 32 INDEPENDENT REVIEWS |

**Orden propuesto:** revisar la evidencia ya existente primero; en paralelo pueden prepararse documentos de OBS y requisitos de REC-03. Las tareas con PG17, SQL, IAM/MFA, proxy/TLS o pruebas operativas **no pueden ejecutarse amparadas en V93**; cada etapa requiere permiso expreso y delimitado.

### A. REC-03: restauración real del esquema MG + suite V53

**Dependencias comprobadas en `tests/v53-rls-runtime.test.sql` y la documentación V53:**

- El script V53 contiene `INSERT INTO auth.users`, utiliza `SET LOCAL ROLE authenticated`, manipula las tablas de MG WEB STUDIO CLOUD y ejecuta **56 aserciones pgTAP** en el esquema `extensions`.
- El resultado histórico V53 fue 56/56 en STAGING; **no se ejecutó sobre una copia restaurada**.
- La V90 creó solo `mg_v86.records`, tres roles de demostración y cuatro filas sintéticas. Ese fixture **no incluye** las 12 tablas MG, `auth.users`, `authenticated` o la extensión pgTAP requeridas por V53.
- Los SQL canónicos/migraciones desde V45 deben reconciliarse antes de instalar un esquema completo en un laboratorio nuevo. **No reutilizar una copia real ni restaurar STAGING.**

**Diseño de un eventual ensayo, aún no autorizado para V93:** validar compatibilidad de migraciones; desplegar esquema MG y funciones de autenticación ficticias compatibles en un origen PG17 aislado; preparar únicamente fixtures sintéticos; respaldar; restaurar a **otro** destino PG17 temporal con roles/pgTAP verificados; ejecutar `v53-rls-runtime.test.sql` en destino dentro de transacción y comprobar rollback, salida de 56 aserciones, ausencia de persistencia y comparación de esquemas/políticas. Capturar únicamente resultados sanitizados, SHA del artefacto y evidencias de limpieza. Bloquear el job antes de usar cualquier ambiente real, variable de conexión o cuenta existente.

**Criterio de aceptación:** 56/56 (o suite revisada formalmente si cambió el esquema), cero filas ficticias persistidas, sin permisos indebidos, cero efectos externos, y revisión independiente. Si las migraciones de MG o las dependencias de Auth no pueden reproducirse sin datos reales, registrar **BLOCKED**, no sustituir por V86.

**Permisos ausentes:** autorización explícita nueva para crear/arrancar PostgreSQL 17 desechable y realizar restauración/SQL de ensayo con esquema ampliado; aprobación distinta si algún proveedor real fuera necesario. La autorización V90 fue solo para su fixture reducido.

### B. AUTH-01..03: integración real de JWT, sesiones y MFA

- V88 validó firmas ES256 verdaderas con JWT, pero JWKS y sesiones fueron simulados en memoria. Ese resultado **no certifica** identidad persistida, revocación en proveedor ni MFA.
- Definir un proveedor de autenticación en sandbox, sus roles, emisor/audiencia y revocación persistida; usar cuentas **solo de prueba**, nunca credenciales de clientes.
- Probar expiración, JWT corrupto, sesión revocada, pertenencia entre empresas/sucursales y elevación de privilegios con MFA **validado por servidor**; las afirmaciones `aal2` introducidas por el usuario deben seguir siendo ignoradas.
- No iniciar sesión, emitir tokens externos o modificar IAM bajo esta V93.

**Permiso futuro:** autorización separada para usar un proveedor de identidades de prueba y su entorno/red de ensayo, con alcance de usuarios/roles, MFA y revocación expresamente aprobado.

### C. DATA-01..02: permisos reales, cancelación SQL y residuos

- V86 probó `RLS` en una tabla sintética; V53 demostró 56/56 aserciones históricas sobre un esquema mayor. No acredita completamente los grants efectivos de los roles del backend ni el aislamiento actual.
- Auditar ACLs, `BYPASSRLS`, `service_role`, `SECURITY DEFINER`, defaults de funciones y acceso a funciones privadas del esquema definitivo.
- En un futuro PG17 de prueba autorizado, ejecutar una transacción cancelable con `statement_timeout`/AbortSignal, comprobar rollback y que el trabajo SQL subyacente termine, no solo que Node responda HTTP 503.
- Un test de timeout HTTP sin consulta real sigue siendo evidencia **parcial** para DATA-02 y LOAD-03.

**Permiso futuro:** autorización específica de SQL y cancelación dentro de PG17 sintético; nunca contra el contenedor BAZAR-ONLINE.

### D. OBS, proxy/TLS y cierre productivo

- V92 preparó una política de minimización, retención propuesta de **30 días** y tres alertas **desactivadas**, sin propietario, proveedor ni aprobación. **No afirmar OBS-03/04 cumplidos.**
- OBS-02 necesita correlación real entre capas sin PII; la V66 todavía devuelve `requestId: unavailable` en ciertos rechazos.
- HTTP-06/10/14, LOAD-03 y OPS-01 requieren supervisión y proxy/TLS auténticos **en ambiente expresamente aprobado**; no abrir puertos públicos por conveniencia.
- REC-04 necesita RPO/RTO de un volumen representativo y política de cifrado/retención revisada; los 99 ms/68 ms de V90 sobre cuatro filas no son objetivos garantizados.
- OPS-02 es el último bloqueo: ventana de cambio, procedimiento de rollback probado, responsable y autorización **separada de publicación**.

## 3. Matriz de traspaso al revisor (32 entradas)

| ID | Cobertura V91 | Etapas fuente | Bloque responsable propuesto | Dictamen independiente actual |
| --- | --- | --- | --- | --- |
| `HTTP-01` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-02` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-03` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-04` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-05` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-06` | Parcial | V87 | INGRESS_TLS | **Sin revisar** |
| `HTTP-07` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-08` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-09` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-10` | Parcial | V87 | INGRESS_TLS | **Sin revisar** |
| `HTTP-11` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-12` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-13` | Observada | V87 | EVIDENCE_REVIEW | **Sin revisar** |
| `HTTP-14` | Parcial | V87, V89 | INGRESS_TLS | **Sin revisar** |
| `LOAD-01` | Observada | V89 | EVIDENCE_REVIEW | **Sin revisar** |
| `LOAD-02` | Observada | V89 | EVIDENCE_REVIEW | **Sin revisar** |
| `LOAD-03` | Parcial | V89 | INGRESS_TLS | **Sin revisar** |
| `OBS-01` | Parcial | V87, V89 | OBS_PRIVACY | **Sin revisar** |
| `OBS-02` | Parcial | V87, V89 | OBS_PRIVACY | **Sin revisar** |
| `OBS-03` | Sin ejecución exigida | — | OBS_PRIVACY | **Sin revisar** |
| `OBS-04` | Sin ejecución exigida | — | OBS_PRIVACY | **Sin revisar** |
| `AUTH-01` | Parcial | V88 | IDENTITY_MFA | **Sin revisar** |
| `AUTH-02` | Parcial | V88, V86, V53 | IDENTITY_MFA | **Sin revisar** |
| `AUTH-03` | Parcial | V88 | IDENTITY_MFA | **Sin revisar** |
| `DATA-01` | Parcial | V86, V53 | SQL_CANCELLATION | **Sin revisar** |
| `DATA-02` | Parcial | V86, V89 | SQL_CANCELLATION | **Sin revisar** |
| `REC-01` | Observada | V90 | EVIDENCE_REVIEW | **Sin revisar** |
| `REC-02` | Parcial | V90 | RESTORE_FULL_SCHEMA | **Sin revisar** |
| `REC-03` | Sin ejecución exigida | V90, V53 | RESTORE_FULL_SCHEMA | **Sin revisar** |
| `REC-04` | Parcial | V90 | RECOVERY_POLICY | **Sin revisar** |
| `OPS-01` | Parcial | V85, V87, V89 | INGRESS_TLS | **Sin revisar** |
| `OPS-02` | Sin ejecución exigida | — | PRODUCTION_RELEASE | **Sin revisar** |

**NOTA:** “bloque responsable” se refiere a una línea de trabajo, **no** a una persona designada. Todos los campos `reviewer` siguen `UNASSIGNED`, y toda firma, referencia de aprobación o dictamen es `null`.

## 4. Procedimiento reproducible de revisión y custodia

1. El revisor valida la integridad del catálogo `docs/V67-EVIDENCIAS-PENDIENTES.json`, la matriz V91, el paquete OBS de V92 y la matriz estructurada V93, sin modificar sus estados.
2. Para cada evidencia V85–V90, abre la ejecución GitHub asociada, valida que `completed/success` corresponde al SHA de esa rama y lee las limitaciones del informe. El SHA debe verificarse en la evidencia primaria, no deducirse del resultado de otro job.
3. Para cada control, contrasta `security-acceptance-v67.cjs` (criterio canónico) contra la observación real y los faltantes. Si un paso carece de alcance o permiso, se marca **BLOCKED/PENDING** hasta cumplirlo.
4. Registra el resultado humano en un sistema con acceso controlado, identidad del revisor y sello temporal. En GitHub público deja únicamente una referencia inocua validada, si la política lo permite; **no crear “firmas” automáticas.**
5. Formaliza planes de prueba separados para REC-03, AUTH, DATA, proxy/TLS y recuperación. Requiere aprobación explícita **antes** de cada operación.
6. La publicación solo se propone tras todos los controles independientes aprobados, responsables reales, plan de rollback y autorización adicional de producción.

**Archivo de acta:** `docs/V93-ACTA-REVISION-INDEPENDIENTE-SIN-FIRMA.md`.  
**Paquete estructurado:** `docs/V93-PAQUETE-REVISION-INDEPENDIENTE.json`.  
**Verificador offline:** `scripts/audit-v93-review-gates.cjs`.  

## 5. Estado de seguridad al cerrar V93

No se han ejecutado PG17, SQL, Auth/MFA, tráfico HTTP, alertas, restauración, proxy ni despliegue en V93. Las pruebas automatizadas solo comprueban consistencia documental, bloqueos y ausencia de aprobaciones ficticias.

**V67: 32 `PENDING` / 0 `PASS` formal. Decisión: `NO_GO` de producción.**
