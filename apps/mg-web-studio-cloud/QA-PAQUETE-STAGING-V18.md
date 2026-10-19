# MG WEB STUDIO CLOUD · QA de paquete staging V18

**Fecha:** 19 de octubre de 2026  
**Rama GitHub:** \`feature/mg-digital-v5-web-services\`  
**Conclusión:** **NO GO para infraestructura, migraciones, pagos, IA de pago y publicación**. El paquete es una revisión estática y no existe autorización de proveedor ni de gasto.

## Archivos creados y revisados

| Entregable | Función |
|---|---|
| \`staging/v18-manifest.review.json\` | Define proyecto MG WEB STUDIO CLOUD, rama feature, protección de main, destino vacío, ejecución desactivada y 16 precondiciones pendientes |
| \`staging/v18-env-names.review.json\` | Nombres de variables; clasificación pública/servidor; **ningún valor ni credencial** |
| \`staging/v18-procedure.review.json\` | Procedimiento documental y post-autorización futura; \`executables=[]\` |
| \`staging/v18-preflight.cjs\` | Revisión de archivos locales, impresión NO GO; no shell, red, SQL o escrituras |
| \`shared/mg-staging-package-v18.js\` | Validador que rechaza cambios de rama, autorizaciones inventadas, valores secretos, comandos de migración y falta de controles |
| \`tests/staging-package-v18.test.cjs\` | Suite positiva/negativa reproducible en Node local |
| \`staging/V18-PLAN-DRY-RUN.md\` | Procedimiento detallado y bloqueos técnicos |
| \`QA-PAQUETE-STAGING-V18.md\` | Este informe de revisión |

Se añadieron enlaces al plan V18 desde \`prototipo.html\` (SUPERADMIN), \`portal-cliente.html\`, \`preparacion-backend-v16.html\` y \`evaluacion-staging-v17.html\`.

## Resultado de preflight del paquete (sin ejecutar SQL)

\`\`\`text
MG WEB STUDIO CLOUD — V18 · SOLO REVISIÓN EN SECO
Estado: NO GO · No autoriza despliegue, gastos, SQL ni publicación
Validez estructural: Comprobación estática correcta
SQL de revisión cargados: 4/4
Requisitos pendientes: 16
Bloqueos de formato:
Limitación: no se ejecutó SQL, HTTP, migración, CLI, RLS ni navegador real.
Autorización real: NO.
\`\`\`

Las cuatro rutas SQL son \`*.review.sql\`, incluyen avisos de no ejecución y permanecen fuera de cualquier carpeta de migraciones desplegables.

La evaluación valida **solo que el paquete no contiene habilitaciones peligrosas conocidas**, no la corrección del SQL ni la configuración de una base.

## QA nuevo V18 — 135/135 correctas

Incluye comprobaciones de:
- Estructura del manifiesto, rama feature, \`main\` protegida, destino NULL, autorización denegada, 16 requisitos pendientes, no datos reales.
- Banderas \`mayProvision\`, \`mayRunMigrations\`, \`mayDeploy\`, \`mayPublish\`, \`mayCharge\`, \`mayCallPaidAI\` y \`maySendEmail\` desactivadas.
- Detección de intentos de habilitar esas operaciones, añadir destinos remotos, introducir aprobadores o referencias falsas.
- Validación de catálogo de nombres de variables: clasificación privada de URL de base/clave secreta, sin valores, \`default\`, ejemplos ni secretos públicos.
- Procedimiento con cero ejecutables; rechaza comandos de despliegue (\`supabase db push\`, \`git push\`), comandos arbitrarios, cambios de fase o pasos incompletos.
- Inventario de cuatro diseños SQL y señales de \`NO EJECUTAR\`; controles tenant/sitio, reemplazo de políticas amplias, rechazo de SQL faltante o alterado estructuralmente.
- Plan escrito de aislamiento y rollback, exclusión explícita de FINZY, BAZAR-ONLINE y Regaladitos Club, inhabilitación de IA real y pruebas de vínculos de los paneles.
- El comando preflight de Node se inspeccionó en el arnés JS de pruebas de solo lectura. Está preparado para ejecutarse localmente, **pero no se ejecutó desde un proceso Node del equipo del usuario**.

## Regresión previa V9–V17 — 874/874 correctas

| Módulo | Pruebas |
|---|---:|
| V9 asistente de plantillas | 49 |
| V10 intercambio manual | 52 |
| V11 revisiones | 64 |
| V12 bandeja | 81 |
| V12 UI | 30 |
| V13 contratos SQL estáticos | 122 |
| V14 API transaccional en memoria | 80 |
| V14 UI | 33 |
| V15 recuperación y consistencia | 86 |
| V15 UI | 41 |
| V16 adaptador | 59 |
| V16 integración entre fachadas | 45 |
| V17 motor de evaluación | 90 |
| V17 UI | 42 |
| **Subtotal V9–V17** | **874** |
| **V18 paquete y preflight** | **135** |
| **TOTAL V9–V18** | **1.009** |

Se ejecutaron suites JavaScript en un entorno de pruebas aislado usando archivos actuales recuperados de GitHub. En interfaz, el DOM se simuló; **no se comprobó browser Chrome/Android real**. Tampoco se ejecutó PostgreSQL, HTTP, Supabase CLI, RLS real, backups, ni desplegaron funciones.

## Controles pendientes que bloquean staging

Los **16 prerrequisitos** permanecen pendientes. Para proceder alguna vez se necesitan autorización explícita de proveedor/plan/región/presupuesto, proyecto aislado exclusivo, secretos en servidor, RLS por sitio y tenant, Auth/MFA real, migraciones corregidas, pruebas de base de datos, recuperación real de backups, observabilidad, protección de costos y signoff.

**Problemas de diseño que requieren corrección antes de generar migraciones:**
- Compatibilidad de \`slug=""\` del prototipo con la validación SQL de Home no vacío.
- RLS original demasiado amplia para EDITOR/VIEWER del mismo tenant, sin scopes de sitio.
- Revisar \`SECURITY DEFINER\`, propiedad de funciones, privilegios y Data API, y casos multitenant.
- Idempotencia, autorización, outbox y versionado todavía son **simuladores de una instancia JS**, no transacciones ACID del backend.
- Los checkpoints V15 no equivalen a backups/restore reales.
- Los paneles de cliente y agencia aún no comparten datos a través de un servidor.

## Comandos de revisión local (seguros, sin red por diseño)

\`\`\`powershell
node apps/mg-web-studio-cloud/staging/v18-preflight.cjs
node apps/mg-web-studio-cloud/tests/staging-package-v18.test.cjs
\`\`\`

Se requiere tener los archivos bajo \`apps/mg-web-studio-cloud\` y Node instalado. Ninguno de estos comandos inicia un servicio o conecta Supabase. **No se recomienda copiar los SQL de revisión a migraciones ni ejecutar el contenido manualmente.**

## Referencia oficial

[Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations). La documentación distingue entre generar/probar migraciones localmente y aplicar migraciones al proyecto remoto. Estas últimas operaciones **no se realizaron**.

## Siguiente paso V19 propuesto

Continuar con inspección **estática** de dependencias SQL entre esquemas V1, V2 y V13; detectar incompatibilidades estructurales, definiciones duplicadas y riesgo de policies permisivas. No crear infraestructura ni aplicar migraciones. La futura conexión real solo procederá con permisos expresos de proyecto, presupuesto y alcance.

**Registro de cambios limitado a la rama feature; \`main\` intacta; sin gastos, publicaciones, cambios en proyectos Supabase ni llamadas a Lovable/IA de pago.**
