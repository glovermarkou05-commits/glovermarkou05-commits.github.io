# MG WEB STUDIO CLOUD — QA V19 | Auditoría estática SQL

**Fecha:** 19 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Conclusión:** **NO GO** para generar/aplicar migraciones, crear staging o publicar. Las pruebas de compatibilidad estática identificaron **2 incompatibilidades bloqueantes y 3 revisiones técnicas abiertas**. No se modificaron los cuatro SQL originales.

## Entregables completados

| Archivo | Propósito |
|---|---|
| \`shared/mg-sql-compat-v19.js\` | Analiza textos SQL, relaciones entre tablas y FKs, presencia de RLS, orden de creación, políticas creadas/retiradas, permisos antiguos y contratos con la demo |
| \`tests/sql-compat-v19.test.cjs\` | Suite de 72 verificaciones con mutaciones que detectan fallos hipotéticos de permisos, tablas, claves y enums |
| \`staging/v19-sql-audit.cjs\` | CLI local de **solo lectura**; muestra NO GO y retorna código 2 cuando hay bloqueos; no ejecuta SQL |
| \`staging/V19-HALLAZGOS-COMPATIBILIDAD.md\` | Diagnóstico y propuesta de corrección coordinada, aún sin aplicar |
| \`QA-AUDITORIA-SQL-V19.md\` | Este informe de QA |

El informe V19 quedó enlazado desde los paneles **SUPERADMIN y emprendedor** y desde el plan de despliegue en seco V18, sin tocar el flujo de la aplicación.

## Resultado de análisis del diseño SQL

\`\`\`text
MG WEB STUDIO CLOUD · V19 · AUDITORÍA SQL ESTÁTICA · NO GO
Tablas reconocidas: 21
Dependencias fuera de orden: 0
Políticas heredadas retiradas: 10
Problemas de compatibilidad confirmados: 2
Revisiones pendientes: 3
Autorización/despliegue: NO
SQL ejecutado: NO
RLS real probado: NO
\`\`\`

### Bloqueos confirmados (2)

- **\`HOME_SLUG_CONFLICT\`**: \`mg_pages.slug\` obliga a un identificador no vacío, y las páginas Inicio del simulador usan \`slug=""\`. Es necesario acordar una representación canónica que preserve la URL \`/\`.
- **\`STATUS_CONTRACT_MISMATCH\`**: \`mg_site_proposals.status\` del SQL usa \`submitted_for_review\` y \`applied_to_draft\`, mientras que la capa V14/V16 usa \`submitted\` y \`applied\`. Deben uniformarse antes de guardar datos reales.

### Revisiones pendientes (3)

- **\`SECURITY_DEFINER_REVIEW\`**: propietario, \`search_path\`, grants y bypass de RLS del helper de permisos \`mg_private.mg_can_access_site\`.
- **\`CAS_SQL_TRANSACTION_UNPROVEN\`**: el SQL no prueba que las operaciones de versionado, idempotencia, aprobación y outbox sean ACID ni que se gestionen colisiones concurrentes.
- **\`POSTGRES_REQUIRED\`**: falta revisión con parser real, creación de esquema en base aislada y pruebas SQL/pgTAP de permisos, rollback y comportamiento de la Data API.

**Detalle:** [V19-HALLAZGOS-COMPATIBILIDAD.md](./staging/V19-HALLAZGOS-COMPATIBILIDAD.md).

## QA V19 efectivamente ejecutado: 72/72

Los casos prueban el inventario de 21 tablas, 10 políticas retiradas en la simulación textual, presencia de RLS, dependencias válidas identificadas, consistencia de FKs compuestas, conflictos de estados, detección de errores de slug y advertencias de auditoría.

Se probaron mutaciones de riesgo: \`main\`/deploy en manifiesto, archivos SQL ausentes, tablas duplicadas, FKs a tablas no existentes, orden alterado, \`ENABLE RLS\` omitido, eliminación de permisos scoped, resurrección de políticas amplias y concesiones de escritura que no fueron retiradas.

### QA de regresión

| Suites | Correctas |
|---|---:|
| V9–V13 | 398/398 |
| V14–V15 | 240/240 |
| V16–V17 | 236/236 |
| V18 | 135/135 |
| **Subtotal V9–V18** | **1.009/1.009** |
| **V19** | **72/72** |
| **TOTAL V9–V19** | **1.081/1.081** |

Se ejecutaron los tests con los módulos JavaScript recuperados de GitHub dentro de un arnés JS; las pruebas UI usan DOM simulado. El comando CLI V19 fue evaluado con lectura de archivos simulada; **no se lanzó un proceso Node del equipo del usuario**, ni se ejecutó ningún SQL.

## Comandos seguros para revisión local

\`\`\`powershell
node apps/mg-web-studio-cloud/tests/sql-compat-v19.test.cjs
node apps/mg-web-studio-cloud/staging/v19-sql-audit.cjs
\`\`\`

El segundo comando debe retornar **exit code 2** mientras haya bloqueos de contrato. Es un resultado esperado, no una migración fallida. Ambos comandos solo leen datos y muestran informes en consola.

## Qué NO está probado

- Sintaxis/ejecución real de PostgreSQL.
- Semántica real de políticas permisivas/restrictivas, \`GRANT\`, propietarios, funciones privilegiadas y \`auth.uid()\`.
- Aislamiento contra fuga de datos reales en sesiones independientes.
- Backups/restore, concurrencia real, integridad en múltiples nodos, servidor HTTP y publicación.
- Calidad de Chrome/Android reales y rendimiento.
- Costos, proveedor, región ni autorizaciones de infraestructura.

**No interpretar «1.081 pruebas» como certificación de seguridad o plataforma lista para lanzar.** Solo indica que el conjunto de verificaciones **simuladas y estáticas** pasó.

## Próxima etapa recomendada: V20

Preparar, **sin ejecutar**, una propuesta de contrato canónico de navegación/slug y estados de propuestas; agregar pruebas de equivalencia de transiciones de estado y de rutas; revisar la función privilegiada y los permisos heredados para una futura migración explícitamente autorizada. Mantener el paquete V18 como NO GO hasta aprobar infraestructura exclusiva.

**Restricciones vigentes:** no tocar \`main\`, no crear/alterar Supabase, no consumir Lovable ni IA de pago, no registrar cobros, no cambiar dominios, no publicar, y no modificar proyectos FINZY, BAZAR-ONLINE ni Regaladitos Club.
