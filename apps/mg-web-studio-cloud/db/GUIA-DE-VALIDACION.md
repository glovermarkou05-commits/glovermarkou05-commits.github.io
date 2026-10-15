# Núcleo seguro — despliegue controlado y pruebas (V1)

**Estado:** preparado para revisión. No se ha aplicado SQL en Supabase ni se han creado usuarios.

## Importante
El archivo db/schema_core.review.sql es una **propuesta de esquema**, no una migración autorizada ni probada.
Antes de aplicarlo:
1. Crear proyecto Supabase separado, tras elegir organización, verificar costo y aprobarlo.
2. Revisar diseño, grant de permisos y políticas RLS con la versión actual de Supabase.
3. Generar una migración con Supabase CLI (supabase migration new ...) y mantenerla versionada.
4. Instalar dependencias con versiones fijadas y archivo lock; probar entorno local/staging.
5. Preparar datos y usuarios ficticios y ejecutar matriz de aislamiento y roles.
6. Solo después habilitar API y conectar aplicación autenticada.
7. Ejecutar análisis de seguridad/advisors, validar recuperación, no pasar secretos al cliente.

## Reglas de alta
- Sin registro público autónomo de organizaciones.
- Solo una operación privilegiada y auditada crea empresa, usuario e invitación.
- Roles organizacionales no se pueden modificar mediante el cliente web.
- Staff de MG pertenece a un esquema privado sin acceso directo desde frontend.
- Cuentas de terceros, FINZY, BAZAR, Ventry, Regaladitos no se reutilizan.

## Tests obligatorios (en entorno de ensayo dedicado)
| Caso | Preparación | Resultado esperado |
| --- | --- | --- |
| A/B aislamiento | User A org A; User B org B | No consulta ni modifica sitios ajenos |
| Viewer lectura | User A viewer | Solo SELECT, sin escribir |
| Editor páginas | User A editor | Edita su página, no clientes ni roles |
| Manager sitios | User A admin | Crea sitio en A; no en B |
| Mutación org ID | Editor intenta UPDATE organization_id | Denegado |
| Mutación site ID | Editor intenta mover página a otro sitio | Denegado |
| Acceso anon | request sin login | Sin acceso a tablas privadas |
| Alta membership | Usuario intenta autoasignarse CLIENT_OWNER | Denegado |
| Staff role | Usuario intenta concederse SUPERADMIN | Denegado |
| Dominio | Cliente intenta configurar DNS desde Data API | Denegado |
| Suspensión | Revocar membresía | Se pierde acceso al contenido privado |
| Publicación | Modificar página draft | No publicar sin backend autorizado |
| Edición paralela | Dos editores y revisiones | Resolver conflictos y conservar historial |
| MFA | SUPERADMIN sin segundo factor | Denegar acciones sensibles |
| Sesión vencida | Revocar tokens | Rechazar mutaciones sensibles |

## Integración pendiente
El prototipo HTML actual es una maqueta funcional local. La autenticación real se realizará en una aplicación React/TypeScript con Supabase Auth, rutas protegidas y verificación de permisos del backend. No incluir scripts externos sin versión y lockfile. No crear un usuario SUPERADMIN hasta que haya políticas y bootstrap de servidor validado.

## Alcance definido
Preparado: modelo de tablas con organizaciones, membresías, páginas, sitios, dominios, perfiles y auditoría privada.
Pendiente: esquema completo comercial/CMS, migraciones, backend de invitaciones, autenticación real, storage, pruebas integrales y despliegue.

## Decisión para ejecutar
Requerido: organización explícita, presupuesto/costo confirmado, región Supabase y autorización para crear un proyecto exclusivo.
