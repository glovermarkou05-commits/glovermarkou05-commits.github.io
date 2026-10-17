# MG WEB STUDIO CLOUD — V13 | Modelo de datos y seguridad por sitio

**Fecha:** 17 de octubre de 2026  
**Rama única:** \`feature/mg-digital-v5-web-services\`  
**Estado:** documentación y SQL de **revisión sin ejecutar**. NO es una migración ni existe una base de datos MG WEB STUDIO CLOUD habilitada en esta etapa.

## Entregables
1. \`db/v13-propuestas-scopes.review.sql\` — Diseño del modelo de proposals, revisiones, aprobaciones, notificaciones, marcas de lectura, borradores versionados, scopes de sitio, outbox privado e idempotencia.
2. \`db/v13-endurecimiento-rls-legado.review.sql\` — Propuesta de reemplazar políticas RLS antiguas demasiado amplias para sitios, páginas, dominios, productos, identidad y promociones; elimina escritura directa desde la Data API del cliente.
3. \`db/v13-casos-autorizacion.review.json\` — Matriz con **31 escenarios esperados** para OWNER, ADMIN, EDITOR, VIEWER, usuario revocado, sitio de otra empresa y organización suspendida.
4. \`tests/v13-schema-contract.test.cjs\` — Validador estructural y de casos conceptuales, sin dependencias npm ni acceso de red.

Los archivos anteriores se agregaron a GitHub **sin ejecutar ninguna sentencia SQL**, sin conectar Supabase, sin crear proyectos ni cambiar planes.

## Modelo propuesto

| Entidad | Uso principal | Escrituras |
|---|---|---|
| \`mg_membership_site_scopes\` | Lista sitios permitidos a EDITOR/VIEWER dentro del tenant | Solo backend |
| \`mg_site_draft_versions\` | Guardar documento en borrador y revisión CAS | Solo backend |
| \`mg_site_proposals\` | Propuesta por organización/sitio/plan, revisión y estado | Solo backend |
| \`mg_proposal_revisions\` | Instantáneas de cada revisión, con FK compuestas | Solo backend, inmutables por contrato |
| \`mg_proposal_reviews\` | Decisión autorizada sobre una revisión exacta | Solo backend |
| \`mg_proposal_notifications\` | Avisos con destinatario explícito | Solo backend |
| \`mg_notification_reads\` | Lectura por destinatario sin afectar a terceros | Solo backend |
| \`mg_private.mg_proposal_outbox\` | Eventos posteriores a una transacción | Solo backend |
| \`mg_private.mg_operation_idempotency\` | Evitar reintentos duplicados por actor/empresa | Solo backend |

Los campos de empresa/sitio se relacionan mediante claves foráneas compuestas donde procede. La intención es impedir que una propuesta o revisión de empresa A haga referencia a un sitio de empresa B, incluso por error del backend.

## Autorización esperada

\`\`\`text
Usuario autenticado (backend)
    ↓
Membresía activa en organización
    ↓
Sitio pertenece a la organización
    ↓
OWNER / ADMIN: acciones de su empresa
EDITOR / VIEWER: solo sitios asignados
    ↓
Acción concreta: lectura / edición / publicación / colaboradores / pagos
    ↓
RLS y reglas de servidor
\`\`\`

El borrador añade \`mg_private.mg_can_access_site(organization,site,action)\`: función **SECURITY DEFINER con search_path fijado**, acceso restringido a usuarios autenticados, identidad derivada de \`auth.uid()\`, membresía activa, empresa activa y comprobación de scopes. Su uso es una **propuesta de diseño**, no una validación de seguridad realizada. La función privilegiada debe auditarse en staging para detectar bypass de RLS, permisos de ejecución inseguros y errores de rendimiento. Nunca confiar en los roles/IDs proporcionados por el navegador.

**Políticas antiguas identificadas:** el esquema V1 permitía lectura de todos los sitios del tenant para cualquier miembro activo y escritura de páginas a EDITOR sin scope de sitio. V13 propone retirar esas políticas antes de instalar las scoped. Es fundamental: las políticas permisivas se combinan por OR; añadir políticas nuevas sin eliminar las antiguas dejaría el problema abierto.

### Aislamiento y notificaciones
- OWNER A no debe consultar datos del negocio B.
- EDITOR del sitio A1 no debe consultar ni editar A2, aunque sea de la misma empresa.
- VIEWER del sitio A1 no debe editar ni publicar.
- Miembro revocado no debe consultar propuestas ni notificaciones.
- Cada aviso pertenece a un destinatario real; abrirlo afecta solo su estado de lectura.
- Las escrituras de decisiones, envíos, estados y marcas de lectura **no están concedidas a usuarios autenticados desde SQL directo**. Se harán a través de endpoints protegidos que comprueben rol, scope y revisión.

## Validación efectivamente ejecutada

**122/122 comprobaciones estructurales y de matriz conceptual correctas**:
- 7 tablas de esquema público y 2 tablas privadas propuestas.
- RLS habilitado, grants y revocaciones explícitas.
- Relaciones empresa/sitio/usuario y revisión exacta.
- Check de rol/acción/estado en función privada.
- Reemplazo de 10 políticas antiguas por lecturas scoped.
- 31 escenarios de permisos esperados, incluidos cruces horizontales dentro de un mismo tenant.
- Sin permisos de escritura autenticados directos sobre las tablas nuevas.

Comando para repetir (sobre los archivos GitHub, sin conectar una base):
\`\`\`powershell
node apps/mg-web-studio-cloud/tests/v13-schema-contract.test.cjs
\`\`\`

**Estas 122 comprobaciones NO ejecutan SQL, NO prueban el parser SQL de PostgreSQL, NO verifican grants reales, ni garantizan que la futura RLS sea correcta.** Tampoco ejecutamos pruebas pgTAP, ni comprobamos comportamiento de navegador, notificaciones push o concurrencia real.

## Bloqueadores críticos antes de convertir a migración

1. Autorizar expresamente un proyecto **exclusivo** de MG WEB STUDIO CLOUD, región, costos, plan y pruebas staging. No reutilizar proyectos existentes (FINZY, BAZAR ONLINE o Regaladitos Club).
2. Revisar la compatibilidad de los esquemas antiguos, migrações y dependencias; estos archivos de revisión no tienen historial de migraciones.
3. Confirmar modelo de Home y slug (la demo usa slug vacío; el esquema V1 no lo permite), inmutabilidad real de revisiones, snapshot de media y retención.
4. Probar instalación SQL en **staging**, \`supabase db advisors\`, grants, propietarios de funciones, \`search_path\` y RLS con identidades de prueba.
5. Crear tests de base de datos con usuarios anónimos, OWNER A/B, EDITOR A1/A2, VIEWER, revocados, organización suspendida y SUPERADMIN con y sin MFA; comprobar acceso, INSERT, UPDATE, DELETE y SELECT.
6. Completar backfill seguro de scopes: al añadir scopes nuevos, un EDITOR/VIEWER sin asignación debe quedar **sin acceso** hasta otorgar scopes confirmados.
7. API auténtica: aplicación transaccional y versionada de propuestas, auditoría, salida de eventos outbox, reintentos idempotentes, revocación de sesiones y pruebas de concurrencia.
8. Protección de información: propuestas privadas, contactos, medios y contratos no deben terminar en publicaciones ni eventos Realtime públicos.
9. Revisar exposición de la Data API y GRANT específicos en el proyecto real. Los cambios anunciados por Supabase para 2026 hacen que **crear una tabla en \`public\` no implique necesariamente exposición automática**; comprobar configuración, no suponerla.

Fuentes técnicas verificadas:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/changelog?types=breaking-change
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes

## Siguiente etapa sugerida: V14

Preparar un **contrato transaccional de API** que sustituya la bandeja V12 en memoria por servicios de proposals/notifications versionados, usando un mock seguro y pruebas de solicitudes concurrentes. Solo implementar backend real cuando el usuario autorice costos e infraestructura.

**SIN publicaciones, cambios en \`main\`, créditos Lovable, migraciones, proyectos Supabase nuevos ni IA de pago.**
