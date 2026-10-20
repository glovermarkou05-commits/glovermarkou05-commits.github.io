# MG WEB STUDIO CLOUD — V49 | Revisión estática de aislamiento RLS V45

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**SQL revisado:** blob `135ff2c25d935d87e5c8e9e0f9189705cd40b411`  
**Dictamen:** **SIN BYPASS MULTIEMPRESA CONFIRMADO EN LA REVISIÓN ESTÁTICA; FALTA VERIFICACIÓN REAL EN POSTGRESQL**.

## Alcance

Se revisó el SQL versionado de V45 sin ejecutarlo. La suite V49 valida el texto de las 12 políticas SELECT, las rutas de autorización por usuario/membresía/organización/sitio, el aislamiento heredado por relaciones compuestas, las notificaciones propias, los permisos de navegador y los 16 flags RLS.

## Hallazgos estáticos

- Las 12 políticas se limitan a `SELECT TO authenticated`; no se detectaron políticas anónimas ni operaciones de escritura para el navegador.
- El perfil, membresía y alcance de sitio requieren `auth.uid()`; las membresías y organizaciones además exigen estado activo.
- Propietarios y administradores del cliente pueden leer todos los sitios de su organización activa. Editores y lectores necesitan una fila explícita de alcance de sitio.
- Páginas, borradores, propuestas, revisiones y evaluaciones enlazan sitio y organización; sus políticas subordinan la lectura a los sitios que RLS permite ver. Las notificaciones y lecturas se limitan al destinatario autenticado.
- Las tablas `mg_private` no conceden acceso a roles de navegador. `service_role` recibe permisos de servidor y puede omitir RLS; el backend futuro debe validar actor, organización y sitio.
- No se detectaron `auth.role()`, claims de `user_metadata`, funciones `SECURITY DEFINER` ni vistas en el borrador revisado.

**Resultado acotado:** no encontramos un bypass multiempresa evidente en las expresiones revisadas. Es una conclusión de inspección estática, no prueba de que PostgreSQL aplique el resultado esperado.

## Bloqueos y pruebas requeridas

1. El borrador todavía no se ha parseado con PostgreSQL 17.
2. La revisión no ejecutó queries como `anon`, dos usuarios de organizaciones distintas, miembros sin alcance, editor, lector, propietario ni administrador.
3. Hace falta pgTAP en un entorno PostgreSQL aislado para probar filas permitidas y denegadas por las 16 tablas y permisos por rol. La documentación de Supabase indica que grants y RLS son controles separados y recomienda probar acceso permitido y denegado. V49 no crea ni ejecuta esas pruebas.
4. El `service_role` futuro evita la protección RLS; ninguna autorización de backend está implementada ni validada por este informe.

## Fuentes oficiales consultadas

- Supabase, [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): políticas por rol, predicados de identidad y pruebas pgTAP.
- Supabase, [Securing your API](https://supabase.com/docs/guides/api/securing-your-api): grants controlan el acceso al objeto y RLS controla filas.
- Supabase changelog, [tablas nuevas y exposición a Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): documenta el cambio gradual anunciado en 2026. V49 no infiere la configuración efectiva del proyecto a partir del changelog.

## Registro de avance

- **V46:** informe registra 72/72 validaciones estáticas; SQL, RLS real y restauración sin probar.
- **V47:** 8/8 pruebas locales de integridad.
- **V48:** plantilla de recuperación pendiente de responsable, retención, RPO/RTO y destino.
- **V49:** revisión estática de aislamiento RLS; pruebas de texto aprobadas. No cambia el estado NO GO para PostgreSQL, Supabase STAGING o producción.
- **Siguiente trabajo:** continuar auditoría del esquema y preparación de pruebas. Para confirmar el comportamiento RLS se necesita un entorno PostgreSQL autorizado y pruebas runtime; instalar V45 en Supabase STAGING es una autorización distinta.

**No se ejecutó SQL, no se modificó Supabase y no se autorizó instalación, backend ni producción.**
