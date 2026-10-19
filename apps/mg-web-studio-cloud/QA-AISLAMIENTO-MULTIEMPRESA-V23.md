# MG WEB STUDIO CLOUD — V23: seguridad y aislamiento multiempresa (simulación)

**Fecha:** 19 de octubre de 2026
**Rama:** `feature/mg-digital-v5-web-services`
**Decisión:** **NO GO** para ambiente real, despliegue o datos de clientes.

## Revisión anterior a los cambios

El repositorio ya contenía `shared/mg-api-security-mock.js` (V8), la matriz de 31 casos en `db/v13-casos-autorizacion.review.json`, los SQL de revisión V13, el contrato de propuestas V20 y la simulación de cambios V22. V23 no sustituye ni modifica esos componentes. Reutiliza la matriz V13 como punto de partida.

## Archivos nuevos

- `shared/mg-tenant-security-v23.js`: evaluador puro de permisos con identidad de sesión **simulada**, tenant explícito, membresía activa, estado de sitio, roles y scopes de sitio. Incluye filtrado por sitio, validación de entrega de mensajes a un destinatario y funciones para crear copias de fixtures tras revocaciones.
- `tests/tenant-security-v23.test.cjs`: 81 verificaciones de permisos, aislamiento, sesiones y escenarios adversariales.

## QA ejecutado en esta etapa

**81/81 comprobaciones simuladas aprobadas.** Se leyeron los archivos guardados en GitHub y se evaluó la suite con JavaScript y sustitutos locales de lectura de archivos y aserciones. No se lanzó un servidor ni un proceso Node del equipo del usuario; no se creó un proyecto ni se ejecutó PostgreSQL.

Cobertura relevante:
- Se reutilizaron 31 casos de V13 para OWNER, ADMIN, EDITOR, VIEWER y accesos denegados.
- Usuarios de dos empresas no heredan privilegios entre organizaciones.
- Los EDITOR/VIEWER requieren asignación explícita del sitio; VIEWER solo lee.
- Una sesión inválida, vencida, revocada o atribuida a otro usuario se deniega.
- SUPERADMIN necesita una sesión ficticia AAL2 para la operación administrativa simulada; no hereda acceso automático a datos de clientes.
- La revocación de membresía o scope se comprueba de nuevo para lecturas y entregas simuladas de eventos, aunque la sesión siga vigente.
- Duplicados ambiguos de membresía o scope se rechazan.
- El usuario no obtiene privilegios por enviar campos falsificados de rol o identidad dentro de la solicitud.
- La lista de sitios se filtra por empresa y scopes asignados; las mutaciones de prueba no modifican fixtures originales.

**Advertencia:** el módulo recibe la identidad de un callback/argumento de pruebas. En una aplicación real, solo un servidor autenticado podría construir ese contexto; un navegador puede falsificar estos valores. Las comprobaciones **NO autentican a nadie ni implementan protección real**.

## Pendientes críticos antes de usar clientes reales

1. Backend real con verificación criptográfica de credenciales, sesiones, expiración y revocación; prohibido confiar en cabeceras, parámetros, claims o roles autodeclarados.
2. PostgreSQL separado y autorizado: ensayar RLS, grants, revocaciones, funciones privilegiadas y aislamiento con identidades reales.
3. Revalidar permisos en cada petición, trabajo en cola y suscripción de eventos; probar expiración, cache, desconexión y revocación propagada.
4. Auditar `SECURITY DEFINER`, `search_path`, dueño de función, permisos EXECUTE y políticas heredadas permisivas.
5. Mantener la incompatibilidad de Home/estados y las limitaciones ACID identificadas en V19–V22 como bloqueos del lanzamiento.
6. Probar transferencias de titularidad, protección del último propietario, invitaciones y auditoría persistente.
7. Realizar pruebas de seguridad y concurrencia en un entorno aislado únicamente después de autorización específica de infraestructura.

## Restricciones conservadas

Sin modificaciones de `main`, Supabase, otros proyectos o producción. Sin consumo de Lovable, ejecución SQL, IA de pago ni servicios con costo. Esta etapa no concede aprobación de publicación.

**Prueba local opcional:** `node apps/mg-web-studio-cloud/tests/tenant-security-v23.test.cjs`.
