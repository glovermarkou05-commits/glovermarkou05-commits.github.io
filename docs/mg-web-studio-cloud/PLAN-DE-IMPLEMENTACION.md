# MG WEB STUDIO CLOUD — Implementación por fases y condiciones de publicación
**Estado: planificación; ninguna fase técnica desplegada.**

| Fase | Entregable | Validación obligatoria |
|---|---|---|
| 0 — Diseño | Arquitectura, roles, módulos, costos, contratos y bocetos | Aprobación funcional y presupuesto |
| 1 — Núcleo | App administrativa, Auth/MFA, organizaciones, usuarios, RLS y auditoría | Tests de aislamiento entre clientes |
| 2 — CMS | Plantillas, páginas, identidad visual, media, borradores, vista previa, versiones | Editar/publicar/revertir sin filtrar datos |
| 3 — Publicación | Renderizador, dominios, SSL, caché, SEO y monitoreo | Pruebas sobre subdominio + dominio del cliente |
| 4 — Negocio | Clientes, planes, contratos, cobro manual conciliado, alertas y soporte | Ciclo de suscripción completo sin pérdida |
| 5 — Autogestión avanzada | Catálogo, campañas, productos, formularios seguros, analítica | Operación de clientes piloto |
| 6 — Automatización | Pagos recurrentes, renovaciones, correos, integraciones y ecommerce | Pruebas end-to-end, costos y cumplimiento |

## Regla de entregas
Se puede construir por módulos en paralelo solamente después de consolidar contratos API, roles y esquema compartido. Cada fase debe pasar QA antes de activarse para clientes reales.

## Costos por validar ANTES de vender planes con hosting incluido
- Hosting de la consola y renderizador por entorno; dominio corporativo y múltiples dominios personalizados.
- Base de datos, almacenamiento y transferencias, correos transaccionales, mensajería, logs y backups.
- Buzones comerciales por proveedor y usuario; licencias y renovaciones.
- Tarifa pasarela/contracargos, impuestos SRI, soporte técnico y tiempo operativo.
- Costos de adquisición y renovación de dominios, transferencias y certificados de pago si aplicaran.
- Reservas de margen y límites por plan (cambios mensuales, visitas, almacenamiento, buzones, tickets, SLA).
- Separar costo variable por cliente del costo fijo de la plataforma.
- Proyección de punto de equilibrio: costos fijos mensuales / contribución mensual media por cliente.

## Políticas comerciales indispensables
- Titularidad de dominio y archivos del cliente.
- Alcance de soporte y horario; cambios de contenido incluidos, urgencias y extras.
- Suspensión reversible, mora y periodo de gracia informado.
- Exportación/traspaso y cierre de servicio, retención y eliminación de datos.
- Cambios solicitados, aceptación y control de presupuesto.
- Protección de datos, consentimiento de formularios y administración delegada.
- Servicio de facturación electrónica solo después de integración aprobada y validación legal.

## Lista de verificación QA mínimo
- Desktop/móvil/tablet y accesibilidad por teclado.
- Controles por roles y RLS: pruebas cruzadas tenant A/B con acciones positivas y negativas.
- DNS, SSL, rendimiento, SEO, robots y sitemap; verificación de enlaces y formularios.
- Creación de organización, sitio, edición de bloque, catálogo, promoción, publicación y rollback.
- Plan, pago, ticket, vencimiento, suspensión y reactivación.
- Backups, restauración, alertas de fallo, logs y secretos.
- Facturación y cobros de prueba sin efectos reales.
- Exportaciones, privacidad, consentimiento y derecho de salida.
- Solo publicar previa aprobación expresa, sin pasar ramas de desarrollo a main automáticamente.

## Resultado de esta etapa
Especificación funcional completa, no un software SaaS finalizado. La web corporativa V5 está en una rama independiente y la aplicación MG WEB STUDIO CLOUD sigue pendiente de implementación.