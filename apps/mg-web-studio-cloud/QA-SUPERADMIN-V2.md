# MG WEB STUDIO CLOUD — QA SUPERADMIN V2

**Fecha de implementación:** 15 de octubre de 2026.
**Estado:** demo HTML autocontenida en la rama \`feature/mg-digital-v5-web-services\`. No hay API, autenticación, datos personales reales ni despliegue de producción.

## Nuevas funcionalidades
- **Clientes:** alta, modificación del nombre, plan (Start, Crece, Pro) y estado (Propuesta, Activo, Pausado). Código de ejemplo y filtros por nombre/código/estado.
- **Sitios:** alta de fichas demo asociadas mediante identificador interno a un cliente; estado Borrador y dominio inexistente.
- **Suscripciones:** configuración de plan, frecuencia Mensual/Anual, estado (No configurada, Pendiente, Activa, En pausa, Cancelada), fecha referencial opcional y observación interna. NO se activa ningún cobro.
- **Soporte:** alta y edición de tickets asociados a cliente, prioridades (Baja, Media, Alta), estados (Abierto, En seguimiento, Resuelto, Cerrado) y notas.
- **Dashboard:** KPIs derivados del estado de los objetos ficticios, sin presentar ingresos.
- **Actividad demo:** registro en memoria de altas/cambios importantes, máximo 100 eventos por sesión.
- **Tarifas:** no se presentan precios o cuotas de implementación ilustrativos que puedan interpretarse como aprobados. Los nombres comerciales utilizados son Start, Crece y Pro.

## Verificaciones automatizadas sobre el script
**36/36 comprobaciones positivas**, mediante ejecución JavaScript con DOM simulado:
- Parseo sintáctico del script, planes normalizados y ausencia de precios anteriores no aprobados.
- Alta y edición de clientes; rechazo de planes inválidos.
- Alta de sitio vinculado al cliente correcto; rechazo de referencias inexistentes.
- Alta y edición de suscripciones sin facturar; rechazo de fechas imposibles, estados o ciclos desconocidos.
- Alta y gestión de ticket; rechazo de estados no reconocidos.
- Registro temporal de eventos.
- Render de 10 módulos sin errores.
- Población correcta del selector de clientes y formularios de edición.
- Filtros de clientes/tickets, estados sin resultados.
- Escape de HTML en nombres y ausencia de llamadas directas a endpoints externos en el prototipo.

## Funcionalidades deliberadamente NO realizadas
- **Cobros, facturas, pasarela, contratos, renovación automática, suspensión real o correo**: ninguna.
- **Alta real de usuarios, autenticación, roles seguros, MFA ni acceso privado**: ninguna.
- **Administración de DNS, certificados, dominios o publicación del cliente**: ninguna.
- **Métricas reales o ingresos**: ninguna.
- **Datos persistentes**: nada se guarda en localStorage, Supabase ni un servidor. Todo se pierde al recargar.
- **Prueba visual en navegador real**: pendiente; los tests con DOM simulado no la reemplazan.

## Criterios antes de producción
1. Proyecto de base independiente expresamente autorizado y con costo aprobado; no reutilizar otros Supabase.
2. Modelo relacional tenant → cliente → sitio → plan/suscripción/ticket; autorizaciones por servidor y RLS.
3. Administradores reales con MFA, registros de auditoría persistentes y controles de acceso mínimo.
4. Estados de suscripción independientes de pagos, con conciliación y pruebas; avisos y políticas comerciales por aprobar.
5. Integraciones de billing, factura y proveedores solo tras autorización explícita.
6. Pruebas de navegador (Chrome, Firefox, Android), seguridad, accesibilidad y QA multiusuario.

**La rama \`main\` sigue sin modificaciones.**
