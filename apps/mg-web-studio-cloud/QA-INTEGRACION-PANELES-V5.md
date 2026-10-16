# MG WEB STUDIO CLOUD — Integración de paneles V5 (demostración)

**Fecha:** 16 de octubre de 2026.
**Estado:** navegación entre páginas HTML estáticas en la rama \`feature/mg-digital-v5-web-services\`. No se ha publicado producción, creado usuarios ni contratado servicios.

## Qué se integró de verdad
- Se normalizaron dos fixtures de ejemplo entre SUPERADMIN (\`prototipo.html\`) y portal emprendedor (\`portal-cliente.html\`):
  - \`c1\` / \`s1\`: Café Horizonte · plan Crece por defecto.
  - \`c2\` / \`s2\`: Papelería Nube · plan Start por defecto.
- El negocio \`c3\` (Servicios Costa) permanece en SUPERADMIN **sin portal de ejemplo**. Los sitios adicionales creados por el usuario también aparecen «sin portal de ejemplo», hasta habilitar un sistema real de aprovisionamiento.
- Nuevo módulo **Conexión de paneles**: tabla que muestra asociación organización / sitio, enlaces de navegación y verificación de roles simulada para colaboradores que hayan aceptado invitaciones ficticias.
- En «Sitios web» se pueden abrir ejemplos del portal cuando existe una asociación de fixtures conocida.
- La función de enlace de SUPERADMIN revisa la membresía de muestra para el enlace de colaborador y rechaza IDs de sitios de otra empresa.
- El enlace local \`./portal-cliente.html?mgdemo=c1.s1.CLIENT_EDITOR&mgplan=Crece\` selecciona el negocio, sitio, rol y plan **solamente dentro de la simulación**.
- El portal valida los componentes de la URL contra identificadores, roles y planes conocidos. Rechaza URL malformadas y cruces entre empresa/sitio, y ofrece un enlace de regreso al SUPERADMIN demo.

## Qué NO está sincronizado
Las dos páginas conservan **datos en memoria independientes**. Un nombre, colaborador, plan o contenido editado en el SUPERADMIN no se guarda para el portal; el único valor comercial trasladado en el enlace es el **plan de ejemplo** al momento de abrirlo. Un ajuste posterior en cualquiera de las páginas no se propaga automáticamente a la otra.

El enlace no transmite usuarios, tokens ni identidades reales; cualquier visitante puede modificar parámetros y selectores porque son maquetas públicas. **No se puede considerar la navegación como inicio de sesión ni seguridad multiempresa.**

Un visor externo de HTML (incluido un visor GitHub) puede no conservar las rutas relativas o los parámetros. Para probar el flujo entre documentos, ejecutar ambos archivos servidos **desde la misma carpeta y origen** (por ejemplo, un servidor estático local), sin subirlos a producción. El acceso directo a cada HTML puede abrirse por separado para revisar la UI, pero eso no verifica el enlace cruzado.

## Contrato de datos para próxima etapa
\`DEMO-PANELES-CONTRATO.json\` contiene los IDs, nombres y correspondencia de fixtures. Es un contrato declarativo; todavía no lo consume ninguna API ni lo cargan dinámicamente los dos documentos.

### Futuro modelo en backend
- Organizaciones con IDs estables en una base de datos exclusiva.
- Sitios vinculados por FK de organización.
- Membresías por usuario, rol y alcance de sitio.
- Recursos editoriales versionados por organización y sitio.
- SUPERADMIN con autorización y MFA reales; el portal cliente cargará sus organizaciones y sitios desde una API autorizada.
- Roles y planes determinados por servidor, jamás por \`?mgdemo\` u otros parámetros editables.
- Integración de publicación, soporte y suscripción con flujos auditados e idempotentes.

## QA ejecutado
**73 de 73 comprobaciones correctas**, ejecutando los scripts con DOM simulado:
- Correspondencia cruzada entre clientes \`c1\`, \`c2\` y sitios \`s1\`, \`s2\`, nombres iguales en ambas pantallas.
- Apertura con contexto de ejemplo y plan.
- Rechazo de sitio ajeno, rol no reconocido, plan inválido, ID inexistente y parámetro mal codificado.
- Integración de enlaces para colaborador autorizado, rechazo de otro negocio, revocación y actualización de plan de ejemplo.
- Creación de sitio ficticio sin asociación a portal: no crea enlace incorrecto.
- Renderizado sin excepción de 14 vistas SUPERADMIN y 18 vistas del emprendedor.
- Sin red ni autenticación real.

## Pendientes
- Prueba manual de navegación en servidor estático local, visual y responsive; el entorno de revisión de código no la sustituye.
- Pruebas RLS reales y verificación de sesiones/permisos **solo después de autorizar proyecto independiente y costos**.
- Reconciliación definitiva del contrato de datos del portal y SUPERADMIN contra el backend.
- No se ha verificado el comportamiento de los enlaces relativos en \`htmlpreview.github.io\` ni en otros visores externos.

**Sin gastos, sin Lovable, sin Supabase nuevo, sin cambios en proyectos existentes y sin publicación a \`main\`.**
