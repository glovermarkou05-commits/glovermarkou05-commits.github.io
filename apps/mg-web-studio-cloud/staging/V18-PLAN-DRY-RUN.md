# MG WEB STUDIO CLOUD · V18 — Paquete de despliegue en seco (NO GO)

**Fecha:** 19 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Estado:** revisión de código y archivos estáticos **únicamente**. No es una solicitud de permiso ni una ejecución.
**Decisión vigente:** **NO GO** para crear staging, modificar Supabase, ejecutar SQL, contratar recursos, conectar IA, cobrar o publicar.

## Entrega implementada

| Archivo | Propósito | Riesgo / limitación |
|---|---|---|
| \`staging/v18-manifest.review.json\` | Identidad del proyecto y rama, 16 prerrequisitos pendientes, bloqueos de gasto/migración/publicación | Sin autorización, proyecto, región ni presupuesto |
| \`staging/v18-env-names.review.json\` | Solo nombres y clasificación de variables públicas/privadas futuras | **No contiene valores**, tokens ni credenciales |
| \`staging/v18-procedure.review.json\` | Secuencia documental previa/posterior a autorización | \`executables: []\`: ningún comando activo |
| \`shared/mg-staging-package-v18.js\` | Validador de contratos de archivos, fail-closed ante alteraciones no esperadas | No ejecuta PostgreSQL ni prueba seguridad efectiva |
| \`staging/v18-preflight.cjs\` | CLI de solo lectura para verificar archivos y mostrar NO GO | No lee cuentas ni accede a una red |
| \`tests/staging-package-v18.test.cjs\` | Pruebas positivas y negativas del paquete | No reemplaza tests reales de Auth, RLS, backups o navegador |
| \`staging/V18-PLAN-DRY-RUN.md\` | Este procedimiento y los riesgos pendientes | No constituye aprobación de un proyecto |
| \`QA-PAQUETE-STAGING-V18.md\` | Resultado de auditoría técnica y regresión | No es auditoría independiente de seguridad |

### Preflight de solo lectura

Ejecutar desde la raíz del repositorio en una computadora con Node instalado:

\`\`\`powershell
node apps/mg-web-studio-cloud/staging/v18-preflight.cjs
node apps/mg-web-studio-cloud/tests/staging-package-v18.test.cjs
\`\`\`

Estas dos instrucciones **solo leen archivos del repositorio, validan datos y escriben resultados en la consola**. No ejecutan comandos de Supabase, DDL, Git push, API web ni operaciones de despliegue.

La salida estructural esperada de la versión entregada indica:
\`\`\`text
Estado: NO GO · No autoriza despliegue, gastos, SQL ni publicación
Validez estructural: Comprobación estática correcta
SQL de revisión cargados: 4/4
Requisitos pendientes: 16
Bloqueos de formato: [ninguno]
Limitación: no se ejecutó SQL, HTTP, migración, CLI, RLS ni navegador real.
\`\`\`

Que el formato sea correcto **no indica staging operativo ni aplicación segura**.

## Inventario SQL (todos son DISEÑOS sin aplicar)

1. \`db/schema_core.review.sql\` — datos base de organizaciones, miembros y sitios.
2. \`db/modelo-contenido-compartido.review.sql\` — entidades de contenido y publicaciones.
3. \`db/v13-propuestas-scopes.review.sql\` — propuestas, revisiones, avisos, scopes y borradores versionados.
4. \`db/v13-endurecimiento-rls-legado.review.sql\` — retirada de políticas antiguas que daban acceso excesivo dentro de un tenant.

Los cuatro tienen marcador de NO EJECUTAR / NO MIGRACIÓN. **No** se copiaron a \`supabase/migrations\` y todavía no se ha confirmado el orden efectivo de aplicación en PostgreSQL.

### Bloqueos técnicos detectados y mantenidos (NO GO)

- **Slug Home:** la demo utiliza \`slug=""\`, pero el SQL base obliga a un slug no vacío; hay que consensuar y corregir un único modelo.
- **RLS antiguo:** la lectura de miembros de un tenant es demasiado amplia para EDITOR/VIEWER; deben retirarse políticas previas, no simplemente agregar políticas permisivas nuevas.
- **Acceso de equipo interno:** SUPERADMIN/MFA deben autenticarse y auditarse con fuentes del servidor; el selector de roles de JS no es identidad válida.
- **Transacciones:** el mock V14/15 carece de ACID real; hay que diseñar versiones, decisiones y outbox en transacciones PostgreSQL con pruebas de concurrencia, rollback e idempotencia.
- **Privilegios:** \`GRANT\` y RLS son independientes; revisar Data API y exposición del esquema en el proyecto real. Auditar \`SECURITY DEFINER\`, propietario, \`search_path\`, vistas y protección de secretos.
- **Backups:** el checkpoint V15 es un objeto JS temporal, no una restauración de base real. Requerimos backups, RPO/RTO y prueba de restauración segura antes de uso operativo.
- **Privacidad y gastos:** pendientes proveedor, región, plan, responsable, límite mensual, tratamiento de datos, políticas de retención y desactivación de servicios con cargo.
- **UI y dispositivos:** los paneles SUPERADMIN y emprendedor no están sincronizados en red; falta QA de navegador/móvil, sesiones cruzadas, restauración y acceso horizontal.
- **IA real:** seguirá independiente y desactivada hasta seleccionar proveedor, privacidad, costos/cuotas y revisión humana de contenido.
- **Pagos y publicación:** seguirán completamente separados; no se activa una pasarela ni un dominio público por tener una propuesta aprobada.

## Secuencia futura, únicamente tras permiso explícito

**Antes de cualquier acción remota:** obtener autorización expresa para un nuevo proyecto MG WEB STUDIO CLOUD, proveedor/región/costo máximo y alcance preciso; diferenciar creación vacía, migraciones, Auth, Storage y publicación.

**Después de autorización, en un paso aparte:** hacer revisión/corrección de SQL, crear migraciones reales versionadas, probarlas localmente con Postgres y luego únicamente en staging aislado. Realizar QA RLS con varios usuarios y dos sitios de un mismo tenant, revisar CLI/docs vigentes, comprobar sesiones reales y MFA, probar backup/restore, trazabilidad sin contenido privado, DNS y política de costos. Documentar resultados y decidir una nueva puerta GO/NO GO.

**Ante fallo futuro:** suspender staging si es necesario, registrar release anterior, activar un procedimiento de restauración/rollback ya aprobado, verificar integridad, roles, sesiones y permisos, y no reabrir hasta signoff humano. No improvisar SQL inverso ni restaurar en el proyecto de otra aplicación.

### Criterios exactos para que pueda solicitarse GO de staging más adelante
Debe existir autorización específica con: nombre MG WEB STUDIO CLOUD, proveedor, proyecto exclusivo, región, plan, tope de gasto mensual en USD, responsables, uso de datos ficticios, permisos de ejecución delimitados, exclusiones de productos existentes, estrategia de rollback y confirmación explícita de **NO publicación y NO activación de IA ni cobros reales**. Además, las pruebas técnicas deberán demostrar el comportamiento real que hoy solo simulan los laboratorios.

**Nunca se interpreta un «perfecto sigamos» como autorización implícita de gasto, SQL o producción.**

## Referencia técnica

Supabase documenta el proceso de migraciones versionadas y separa explícitamente la edición de migraciones locales de su aplicación a un proyecto remoto: https://supabase.com/docs/guides/deployment/database-migrations

No se copiaron ni ejecutaron comandos de despliegue de la documentación. El paquete V18 continúa siendo **solo lectura**.

## Próxima fase sugerida

V19: revisión de dependencias, compatibilidad SQL y pruebas más exhaustivas de seguridad estática; todavía sin conectar proveedor ni ejecutar migraciones. La decisión de infraestructura seguirá pendiente de una autorización dedicada.
