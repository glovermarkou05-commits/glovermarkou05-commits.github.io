# MG WEB STUDIO CLOUD — V37 | Solicitud de autorización de staging aislado

**Documento para revisión del propietario — SIN APROBACIÓN OTORGADA**  
**Fecha de revisión:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Solicitud asociada:** G01 de V33; primero P00 de V36.  
**Estado:** **NOT_AUTHORIZED / NO GO**. Este documento no constituye consentimiento, autorización ni presupuesto aprobado.

## 1. Decisión que se solicita, cuando se disponga de los datos

Se propone evaluar **un proyecto de pruebas completamente separado** de producción y de otros productos, para empezar a demostrar lo que las simulaciones V20–V36 aún no verifican: autenticación real, PostgreSQL, RLS, preservación de datos y recuperación.

**No se solicita ahora** habilitar pagos reales, IA de pago, publicación, dominio comercial, despliegues, envío de correos, ni ejecutar los archivos `*.review.sql`. La primera eventual autorización debe limitarse a **preparar un ambiente aislado dentro de un presupuesto definido**, y exigir un segundo permiso explícito antes de ejecutar SQL o activar servicios.

### Información indispensable para evaluar la autorización

| Decisión abierta | Información requerida |
|---|---|
| Responsable | Persona que aprueba el staging y responde por gastos e incidentes |
| Proveedor | Proveedor y cuenta separados de producción; por ejemplo, evaluar un proyecto de pruebas de Supabase, **sin crearlo aún** |
| Región | Ubicación de los datos y cumplimiento de privacidad |
| Presupuesto | Límite en USD por mes y condición para detener gastos o excedentes; **sin asumir cuota gratuita** |
| Control de costos | Alertas, límites de recursos, propietario de la facturación y procedimiento de suspensión |
| Datos | Prohibición de datos reales de clientes; **solo datos ficticios** y archivos permitidos |
| Separación | Proyecto, secretos, accesos, ramas y dominios aislados de MG Digital Solutions en producción, FINZY y otros productos |
| Permisos de acciones | Diferenciar **crear un entorno**, **leer configuración**, **ejecutar migraciones SQL**, **desplegar servicios** y **publicar**; cada acción necesita alcance expreso |
| Recuperación | Responsable de respaldos, reversión, incidencias y cierre de pruebas |

No introduzca contraseñas, claves de servicio, tokens, datos bancarios ni conexiones de PostgreSQL en este documento ni en GitHub. Si se decide configurar un entorno, sus secretos deben administrarse mediante controles adecuados del proveedor.

## 2. Clasificación de los 16 controles originales V18

| Antes de decidir si se autoriza staging: 5 | Una vez exista permiso y entorno: 11 |
|---|---|
| `authorization`: decisión humana y alcance | `secrets_review`: manejo real de secretos |
| `budget`: costo máximo aprobado | `tenant_scope`: aislamiento real por empresa/sitio |
| `provider_region`: cuenta, proveedor y ubicación | `auth_mfa`: sesión, MFA y revocación reales |
| `isolated_environment`: especificación de separación | `rls_pgtest`: RLS y roles PostgreSQL |
| `privacy_fixtures`: reglas de datos sintéticos | `sql_compat`: contrato V13/V20 instalado |
| | `home_slug`: Inicio publicada y concurrente |
| | `rollback_review`: reversión aprobada |
| | `backup_restore`: restauración real probada |
| | `observability`: alertas y comportamiento operativos |
| | `smoke_e2e`: pruebas reales end-to-end |
| | `signoff`: aceptación final documentada |

**Importante:** los 5 primeros tampoco están aprobados; son información que hay que definir antes de dar permiso. Los 11 restantes continúan **NOT_EXECUTED**. La distinción evita exigir pruebas de PostgreSQL antes de que exista permiso para abrir un entorno de pruebas.

## 3. Orden propuesto tras una autorización futura

1. Verificar identidad del proveedor, cuenta correcta y presupuesto, sin reutilizar recursos de producción.
2. Crear únicamente recursos expresamente autorizados; reportar su configuración sin compartir secretos.
3. Inspeccionar esquema instalado: **el contenido de archivos `*.review.sql` no demuestra la existencia de tablas reales**.
4. Probar respaldos y restauración sin datos de clientes; después solicitar autorización específica para cambios SQL.
5. Pasar por revisión de seguridad del archivo `db/v13-endurecimiento-rls-legado.review.sql`, que contiene SQL activo pese al nombre; **nunca ejecutarlo automáticamente**.
6. Aplicar solo cambios versionados y aprobados en un entorno aislado, con rollback diseñado, pruebas de Home y estados, RLS/GRANT, MFA, CAS, auditoría y outbox.
7. Ejecutar pruebas reales, documentar el resultado y solicitar **otra autorización** antes de pensar en producción.
8. Retirar recursos de prueba y detener gastos cuando corresponda.

## 4. Riesgos abiertos y evidencias que no existen todavía

| Riesgo | Situación |
|---|---|
| SQL activo oculto tras extensión `.review.sql` | Detectado en V36; cuarentena documental |
| Home publicada sin garantía de existencia | Diseño V34; no probado en PostgreSQL |
| Estados `submitted_for_review` y `applied_to_draft` frente a V20 | Diseño V35; no migrados |
| MFA, roles, RLS, SECURITY DEFINER, scopes | Pruebas reales pendientes |
| Transacción ACID, auditoría, idempotencia, outbox | Modelos simulados, no backend durable |
| Backup, restauración, tolerancia a fallos | Solo planes documentados |
| Proveedor, costo y autorización | Sin definición o permiso formal |

El resumen V33 y los protocolos V36 se mantienen en **NO GO**. Ningún cambio de este documento o del JSON V37 puede declarar autorizado el proyecto por sí solo.

## 5. Resolución pendiente

**Estado formal:** `PENDIENTE_DE_DECISIÓN_HUMANA`.

La continuación recomendada es que el propietario determine primero **proveedor/cuenta, región, presupuesto máximo y responsable**, además de aceptar datos ficticios y aislamiento. Esos datos permitirán formular una solicitud limitada; no autorizan ejecutar nada de forma implícita.

**Hasta entonces, trabajo permitido:** revisión de código y documentos en la rama de GitHub, análisis estático y simulación aislada sin créditos.

**Trabajo prohibido:** modificar `main`, conectar o modificar un Supabase real, ejecutar SQL, usar claves, crear staging, desplegar, publicar, activar IA de pago o cobros, enviar mensajes externos o cambiar otros productos.

---

Referencia verificable: `staging/v37-authorization-packet.review.json` + `staging/v37-authorization-preflight.cjs`. El preflight devuelve **2 para un documento coherente pero NO AUTORIZADO** y **1 si es inconsistente**; nunca devuelve GO.
