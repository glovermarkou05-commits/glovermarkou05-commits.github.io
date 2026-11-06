# MG WEB STUDIO CLOUD — V94B | Preflight final y criterios de prueba en laboratorio

**Corte:** 01/11/2026 (Ecuador). **Tipo:** PLAN NO EJECUTABLE, revisión estática.  
**PR:** [#7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) en borrador, contra `feature/mg-digital-v5-web-services`.  
**Estado:** **NO READY / NO AUTORIZADO PARA EJECUTAR SQL, PG17, DUMP, RESTORE NI pgTAP**. V67: 32/32 PENDING, cero PASS, producción NO_GO.

## Conclusión de la inspección

**Reutilizable de V90, pero no equivalente a V94B:** el archivo `scripts/run-v90-pg17-synthetic-restore.sh` verifica el repositorio/rama/runner, usa dos PG17 en contenedores distintos con `--network none`, ningún puerto, `listen_addresses=` vacío, socket Unix, límite de recursos, clave aleatoria ficticia, backup efímero, `pg_restore --single-transaction --exit-on-error --no-owner`, snapshots y limpieza. El workflow V90 tiene permisos `contents: read` y ninguna publicación. Resultado histórico válido SOLO para el fixture `mg_v86.records` y 4 filas.

**No reutilizable sin adaptación:** `sql/v90-target-roles-only.sql` declara únicamente `mg_v86_tenant_a`, `mg_v86_tenant_b`, `mg_v86_guest` (NOLOGIN), y no satisface `anon`, `authenticated`, `service_role`, `auth.users`, `auth.uid()` o `extensions.pgtap`. La imagen usada es `postgres:17-bookworm`; no se confirmó instalación/disponibilidad de pgTAP o extensiones Supabase en ella. La migración V53 para pgTAP es exclusiva de STAGING: no se debe aplicarla allí de nuevo ni asumir que la imagen base la incluye.

**Base candidata:** V45 histórico, 16 tablas MG con 11 índices `CREATE INDEX`, 12 políticas de lectura y 16 `ENABLE RLS`, propuesto documentalmente, **NO migración canónica portátil autorizada**. `db/schema_core.review.sql` se solapa en siete tablas y concede ciertos DML a `authenticated` distintos de V45; no concatenarlo. V54 tiene alcance parcial (defaults de tablas y secuencias creadas por postgres en public). La suite V53 tiene 56 aserciones históricas con identidades sintéticas, `BEGIN`/`ROLLBACK`, pero nunca se ejecutó sobre una restauración V94.

## Lista de gates antes de programar o ejecutar V94B

| Gate | Comprobación de entrada concreta | Estado |
| --- | --- | --- |
| **G1** | DDL V45 convertido, **después de revisión**, en fuente canónica reproducible para un clúster de prueba vacío; orden, hashes, FK/índices, políticas, owners/grants y alcance de V54 reconciliados; sin duplicar V1/core. | PENDING |
| **G2** | Definir mecanismo **100 % ficticio** para `auth.users` (columnas de V53), `auth.uid()`, roles `anon`/`authenticated`/`service_role`, extensiones necesarias y `pgTAP` en `extensions`, con disponibilidad comprobable en imagen fijada y sin contactar al proveedor. | PENDING |
| **G3** | Fijar fixtures `example.invalid`, rollback, comparación de 16 tablas/objetos/ACL entre origen y destino, prueba 56/56 en destino y evidencia de cero residuos; evitar equivalencias incorrectas entre pruebas simuladas y Auth/MFA real. | PENDING |
| **G4** | Usuario autoriza **expresamente** la intervención puntual: GitHub Actions de este repositorio, dos contenedores PG17 efímeros con datos falsos, creación/arranque, SQL de ensayo, pg_dump/pg_restore y pgTAP; no acceso externo a STAGING ni a BAZAR/FINZY. | NOT AUTHORIZED |
| **G5** | Revisión de capacidad y aislamiento: runner GitHub-hosted, CPU/RAM/tiempo acotados, Docker sin puertos/red para bases, sin `secrets` de DB, logs sanitizados, sin artefactos persistentes, cleanup en EXIT y verificación final. Imagen y paquetes fijados. | PENDING |
| **G6** | Persona técnica independiente y custodia de evidencia definida; puede evaluar el resultado tras el ensayo, pero no inventar un PASS antes de inspeccionar los logs. | UNASSIGNED |
| **G7** | Autorización de producción totalmente separada, con 32/32 criterios V67 aprobados, RPO/RTO, rollback y dictamen humano. No se concede al autorizar V94B. | NO_GO |

## Diseño de un eventual ensayo V94B (secuencia de verificaciones, NO instrucciones para ejecutar)

1. **Precheck fail-closed:** verificar autorización nueva y delimitada, SHA exacto, rama, repository, runner, ausencia de secretos e imágenes fijadas; no iniciar contenedores si falta un gate de seguridad de laboratorio. El PR de V94A sigue sin fusionar hasta revisión.
2. **Provisionar solo en runner desechable:** dos contenedores PG17 independientes, sin red ni puertos, con base/roles/funciones de Auth sintéticos previamente auditados; comprobar pgtap disponible en ambos cuando corresponda, sin instalar paquetes dentro de bases con red abierta.
3. **Reconstruir esquema propuesto:** instalar únicamente los objetos MG que figuran en la fuente canónica revisada, roles y ACL. Comprobar 16 tablas, 11 índices explícitos, 12 políticas, RLS declarado en 16/16, FK y owner. El catálogo PG puede tener índices adicionales implícitos de PRIMARY KEY: no exigir total real de índices = 11.
4. **Backup/restauración:** generar `pg_dump` del origen ficticio y restaurar al destino aislado, precreando roles globales necesarios. Controlar que `pg_restore --no-owner` NO altere inadvertidamente los permisos efectivos; capturar y comparar propietarios, ACL y políticas, y fallar en cualquier diferencia no autorizada.
5. **Post-restore real:** verificar integridad estructural origen/destino, dependencias/pgTAP, y ejecutar la batería V53 56/56 en el **destino restaurado** con fixture ficticio. Demostrar aislamiento tenant A/B, roles, rollback y cero residuos de usuarios/registros de ensayo.
6. **Cierre verificable:** capturar solo hash de fuente/backup transitorio, resultados sanitizados y conteos; destruir contenedores, archivos de respaldo y entorno temporal. Ante errores: detener, registrar BLOCKED/FAIL, jamás pasar a STAGING como solución.
7. **Evaluación humana separada:** revisor coteja evidencia contra REC-02/03 y firma únicamente en sistema restringido si procede. Un workflow verde nunca promueve automáticamente V67 a PASS ni habilita producción.

## Riesgos que requieren atención especial

- **Disponibilidad de pgTAP en la imagen:** V90 utilizó `postgres:17-bookworm` y solo extensiones predeterminadas; la capacidad de instalar `pgtap` en `extensions` no está demostrada. Requerir imagen/artefacto aprobado y fijado por digest para laboratorio; no asumir extensiones Supabase en PostgreSQL estándar.
- **Contrato Auth simulado ≠ Supabase Auth:** V53 usa `auth.uid()` y cambia a `authenticated`, además de insertar en `auth.users`. Un esquema mínimo ficticio puede validar el comportamiento RLS de un diseño, pero **no** AUTH-01/02/03 ni MFA real.
- **Propietarios/grants:** `pg_dump` no transporta roles globales. La opción `--no-owner` usada en V90 puede cambiar ownership, con impacto sobre comprobaciones de RLS y permisos; V94B debe demostrar equivalencia efectiva y restricciones, no solo que `pg_restore` termine.
- **Espacio/capacidad:** los límites de V90 eran apropiados para 4 filas; no afirmar que 640 MiB de tmpfs y 1 GiB RAM son automáticamente suficientes para el nuevo esquema y pgTAP. Medir recursos solo en ensayo autorizado y abortar si exceden.
- **Superficie comercial:** ninguna prueba aquí repara por sí sola los 14 controles parciales de HTTP/AUTH/DATA/OBS o los 4 casos sin ejecución identificados en V91; siguen siendo bloques separados.

## Acta de alcance para autorización posterior (NO constituye autorización)

**Objetivo solicitado:** V94B: un ensayo de restauración entre dos PostgreSQL 17 efímeros en GitHub Actions, exclusivo para MG Web Studio Cloud, sin datos reales ni llamadas a bases/servicios productivos, con SQL ficticio + pgTAP y limpieza.  
**Queda fuera:** STAGING, Supabase remoto, GitHub `main`, BAZAR-ONLINE, FINZY, Ventry, MG CLUB+, credenciales reales, migraciones productivas, red pública, deploy, merge o firma de los 32 controles V67.

**Conclusión:** este preflight identifica los preparativos exactos y previene repetir V90. No se generó un workflow V94B ni un SQL ejecutable. G1/G2/G3/G5 todavía necesitan resolución técnica; G4 requiere autorización explícita nueva. Producción permanece NO_GO.
