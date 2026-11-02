# MG WEB STUDIO CLOUD — V94B | Resultado real de recuperación sintética del esquema MG

**Fecha local:** 2026-11-01, Ecuador (ejecución en UTC: 2026-11-02 04:14).  
**Resultado del laboratorio:** `TECHNICAL_LAB_PASS` / **17/17 contratos**, **56/56 pgTAP**, restauración PostgreSQL 17.11 con el esquema V45 íntegro.  
**Resultado de producción:** **NO_GO** / **32 controles V67 pendientes de aceptación formal** / revisión independiente no realizada.

## 1. Evidencia de ejecución de GitHub Actions

- **Ejecución:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41387289030
- **Job:** `125090834612` (`v94-disposable-pg17-only`).
- **Commit del ensayo:** `199fba2044f1ac1a03f2894847d6d6740510795e`.
- **Resultado GitHub:** `completed / success`.
- **PR origen:** [#7, borrador](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7), rama `docs/mg-web-studio-v94-preflight-20261101`, base `feature/mg-digital-v5-web-services`.
- **Revisión previa:** 17 pruebas de contratos/refusals (11 de laboratorio + 6 de recursos/contexto), **17 PASS y 0 FAIL**.
- **Capacidad observada del runner:** aproximadamente 14.960 MiB libres de RAM y 87.630 MiB de espacio libre en workspace; los límites V84 heredados se cumplieron. Estos datos pertenecen solo a este job.

## 2. Restauración y seguridad verificadas

| Evidencia comprobada en el job | Resultado |
| --- | --- |
| Motor real | `postgres (PostgreSQL) 17.11 (Debian 17.11-1.pgdg12+2)` |
| Clústeres | **2**: origen `mg-webstudio-v94-source` y destino `mg-webstudio-v94-destination` |
| Aislamiento de ambos | `--network none`, sin puertos publicados, `listen_addresses=` vacío, acceso por socket Unix |
| Recursos por contenedor | 1 vCPU, máximo 1536 MiB RAM, 800 MiB PGDATA en tmpfs, filesystem de imagen read-only |
| Imagen de laboratorio construida | `postgres:17.11-bookworm` con paquete `postgresql-17-pgtap` instalado antes de iniciar bases |
| Image ID observado | `sha256:9e86de80168c59cb57107393ccafb3720dda3bf97c06c248adcd5205fd5a2a40` (solo imagen de este job, no pin inmutable aprobado) |
| DDL MG V45 | **16** tablas, 12 políticas de lectura, 11 índices `CREATE INDEX` verificados en origen y destino |
| Datos de demostración | **1 fila MG ficticia** en `mg_organizations` (`v94-lab-fixture`), sin datos personales |
| Archivo backup custom-format | **335.153 bytes**, firma `PGDMP`, SHA-256 `e9b68532b7262a0717d315a61c405cb9333c04c7c484eea21f2602beb00ca69f` |
| Restauración | `pg_restore -Fc --exit-on-error --single-transaction --no-owner` en clúster distinto y descartable |
| Comparación de origen y destino | **Coincidencia exacta** de instantáneas canónicas de tablas, columnas, índices, políticas, constraints, propietarios, ACL serializadas, versión pgTAP y fila ficticia |
| pgTAP V53 ejecutado en destino restaurado | **56/56 PASS**, ninguna aserción `not ok` |
| Rollback | **PASS:** identidades de ensayo V53 no persistieron; instantánea posterior igual a previa |
| Snapshot final SHA-256 | `7be760a4a97aa8e38a2547112e00e6a6747f97b77636fec01c5f4fed60b9300f` |
| Limpieza | **PASS:** dos contenedores y archivo dump temporal eliminados; comprobación final de nombres ausentes |
| Acceso a STAGING/Supabase remoto/otros proyectos | **No realizado** |
| Merge, deploy o cambios a `main` | **No realizado** |

**Hashes de código usados en el ensayo:** V45 SHA-256 `fdfd5aafcb01aeb9c5f4cb3a6229f64cbc46dc0f2f0d3d458385856fc74c11dc`; V53 SHA-256 `8b360fdf2b865dae4b842ed80cb5a950c73432eb1f171a38aa715209118d1ecb`. Son hashes SHA-256 de archivos; distintos de los SHA de blob Git.

## 3. Incidencias resueltas sin tocar otros entornos

1. Ejecución `41386927608`: los **11 contratos iniciales pasaron**, pero el comprobador antiguo V84 rechazó el contexto `refs/pull/7/merge`. Se incorporó un comprobador V94 exacto para este PR que reutiliza los umbrales de V84 sin alterar V84. No arrancó PG en ese intento.
2. Ejecución `41387114150`: imagen pgTAP, dos PG17 y DDL MG cargados. Falló el snapshot porque `pg_policy.polcmd` es tipo `"char"`; se corrigió a `polcmd::text`. Limpieza correcta.
3. Ejecución `41387200610`: `pg_dump` y `pg_restore` completos, snapshot idéntico. Falló `extensions.plan(56)` por `search_path` faltante en la función interna pgTAP `_set`. Se añadió `SET search_path TO public, extensions` **solo para la sesión V53**, sin modificar V53 ni STAGING. Limpieza correcta.
4. Ejecución final `41387289030`: todos los pasos del job terminaron en **success**, incluida la limpieza.

**No se alteraron** los archivos históricos V45/V53, el controlador V84, el contenedor BAZAR-ONLINE ni datos reales.

## 4. Alcance formal y límites de la demostración

Esta prueba **sí** muestra una recuperación técnica real del DDL histórico V45 y un dato sintético entre dos PostgreSQL 17 con roles y Auth/pgTAP **simulados para ese laboratorio**. La prueba V53 se ejecutó físicamente en el destino restaurado y pasó 56/56.

No demuestra:
- Que la versión de producción de Supabase Auth, PostgREST y MFA tenga comportamiento idéntico al fixture de `auth.users`/`auth.uid()` simplificado.
- Que el respaldo de clientes reales esté cifrado, replicado, retenido o permita alcanzar RPO/RTO objetivos.
- Que las políticas y ACL efectivas de STAGING/producción sean idénticas a las simuladas en PG17.
- Que el SQL V45 sea una migración portable, revisada y segura para repetirse en otros proyectos.
- Que exista una aprobación independiente de `REC-02/REC-03`; los **32 controles V67 siguen PENDING**.
- Que puedan publicarse MG Web Studio Cloud u otras aplicaciones.

**Limitación de reproducibilidad:** la imagen/paquete se instalaron dinámicamente en el runner; se guardó el image ID observado, pero no existe todavía una cadena de suministro fijada y aprobada por digest para uso empresarial.

## 5. Dictamen por gates

| Gate | Evidencia V94B | Estado operativo |
| --- | --- | --- |
| G1 Fuente DDL | Esquema histórico restauró técnicamente; fuente ejecutable de producción y decisión independiente no aprobadas | **PENDING formal** |
| G2 Auth/pgTAP | Dependencias ficticias funcionaron en laboratorio; no prueba el proveedor de Auth real | **LAB PASS / PENDING formal** |
| G3 Restauración/rollback | 16 tablas, 12 políticas, 11 índices, un dato, snapshots coincidentes, 56/56 y limpieza correcta | **LAB PASS / PENDING formal** |
| G4 Autorización | Usuario autorizó explícitamente V94B en GitHub Actions con dos PG17 desechables y SQL ficticio; **ejecutado dentro de ese alcance** | **AUTHORIZED AND EXERCISED (LAB ONLY)** |
| G5 Aislamiento | Dos PG17 sin red ni puertos, límites de recursos y limpieza confirmados; falta revisión independiente y pin digest | **LAB PASS / PENDING formal** |
| G6 Revisor independiente | Ninguno designado ni autorizado a aprobar V67 | **UNASSIGNED** |
| G7 Producción | 32 pendientes formales, cero dictámenes independientes | **NO_GO** |

## 6. Próximas actividades acotadas

1. Solicitar **revisión independiente** de los logs sanitizados del job `125090834612` y los SHA exactos; verificar criterios `REC-02/REC-03` sin volver a correr por defecto el laboratorio.
2. Revisar `postgres`/`supabase_admin`, defaults de funciones y Auth real en entorno autorizado y separado; no copiar roles ficticios a STAGING.
3. Diseñar la migración canónica portable y el sistema de evidencias formal, **no promovido automáticamente por un job verde**.
4. Mantener producción `NO_GO` hasta los 32 dictámenes formales y autorización posterior separada para despliegue.

**Resultado cerrado de V94B:** recuperación técnica de MG Web Studio Cloud verificada. **No hay autorización para producción, STAGING ni cambios a otras aplicaciones.**
