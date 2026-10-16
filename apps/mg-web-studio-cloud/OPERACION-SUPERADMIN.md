# Diseño operativo SUPERADMIN — borrador sin aplicación a producción

### Cliente
- ID técnico estable, código, nombre comercial, estado Propuesta/Activo/Pausado, plan, sitios asociados.
- Una actualización de cliente **no modifica** automáticamente DNS, sitios, pagos ni accesos de usuarios; esas decisiones requieren sus propios flujos y controles.

### Suscripción
- Entidad de servicio separada de la contabilidad/pagos.
- Para la futura aplicación real: identificación de plan, ciclo mensual o anual, período cubierto, renovaciones, estados, historial auditable, proveedor e identificador de cobro cuando exista.
- Los estados que aparecen en la demostración **no significan facturas ni ingresos verificados**. No calcular MRR con valores inventados.
- Antes del lanzamiento aprobar precios, IVA aplicable, períodos de gracia, suspensión/reactivación, cancelación, respaldo y portabilidad; no aplicar automáticamente reglas comerciales de otros productos como Ventry sin aprobación específica para MG WEB STUDIO CLOUD.

### Soporte
- Ticket asociado al ID real de cliente y a un sitio opcional, prioridad, estado, historial inmutable, mensajes y adjuntos con políticas de privacidad.
- El prototipo usa notas simples y no envía comunicaciones.
- Futuros SLA, reasignación y escalamientos dependen de las condiciones de Start / Crece / Pro aprobadas.

### Riesgos de seguridad
- El SUPERADMIN deberá tener sesión comprobada en servidor, MFA obligatorio, políticas RLS, segregación de organizaciones, verificación de permiso de cada operación y auditoría con fecha/actor/diff.
- Este HTML es una demostración pública y **nunca** debe usarse como panel administrativo con datos reales.
- Mantener datos de producción fuera de GitHub Pages y jamás añadir secretos al JavaScript.

### Próximas fases viables sin gasto
- Preparar invitaciones/onboarding y propuesta de roles con emails ficticios.
- Diseñar estados de onboarding, documentos comerciales y QA de clientes.
- Definir esquema y tests de aislamiento, sin ejecutar migraciones en proyectos existentes.
- Revisar el diseño comercial y tarifas finales antes de conectar facturación.

**No implementado en infraestructura: solo documentación y maqueta.**
