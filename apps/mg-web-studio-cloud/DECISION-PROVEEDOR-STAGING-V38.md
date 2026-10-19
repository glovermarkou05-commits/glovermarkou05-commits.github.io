# MG WEB STUDIO CLOUD — V38 | Selección técnica de proveedor y presupuesto de staging

**Fecha de evaluación:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** **RECOMENDACIÓN, NO AUTORIZACIÓN / NO GO**  
**Objetivo:** cerrar la evaluación de proveedor de G01/V37 antes de solicitar la creación de un entorno segregado. **No se contrató, creó, conectó ni desplegó ningún servicio**.

## 1. Propuesta recomendada

**Opción A — Supabase Free ($0/mes de tarifa base publicada), en un proyecto y espacio administrativo completamente separados de producción.** Esta opción sería adecuada **solo** para pruebas sintéticas de funciones básicas de PostgreSQL, Auth y RLS, siempre que la cuenta tenga un cupo gratuito disponible y se respete el aislamiento. El plan Free no es una garantía de continuidad ni de backup automatizado.

La **primera región a evaluar** es **São Paulo (`sa-east-1`)**, que figura en la lista oficial de regiones específicas; **no** hay pruebas de disponibilidad en la cuenta del usuario ni medición de latencia desde Ecuador. Si no está disponible o no conviene por razones técnicas/legales, revisar `us-east-1` (N. Virginia). No fijar una región por la distancia geográfica sin revisar la residencia de datos, la experiencia y las opciones reales.

### Cuadro de evaluación

| Candidato | Costo base publicado | Beneficios | Limitaciones principales | Decisión |
|---|---:|---|---|---|
| **A. Supabase Free aislado** | **USD 0/mes** | Postgres administrado y servicios Auth/Storage; sin infraestructura propia | 500 MB de base, 1 GB de almacenamiento, 5 GB de salida; hasta dos proyectos Free activos, posible pausa tras una semana de inactividad; **sin copias automáticas de DB** | **Recomendado, condicionado** |
| B. Supabase CLI + runtime local | Sin cuota cloud Supabase | Entorno desechable para pruebas aisladas en la computadora | Exige equipo, contenedores, espacio/memoria, mantenimiento y respaldos propios; no sirve como staging compartido sin configuración adicional | Alternativa técnica |
| C. Supabase Pro | Desde **USD 25/mes** | Más límites, soporte y backups diarios del servicio | Facturación mensual y posibles cargos por compute, proyectos adicionales, add-ons o uso; Spend Cap no cubre todo | **No recomendado sin nueva aprobación de presupuesto** |

**No se ha comprobado** si la cuenta del usuario tiene espacio para un nuevo proyecto Free, su organización actual, políticas de acceso, región realmente habilitada, configuración de facturación o si existen otros recursos que deban conservarse. **No se asume** que Pro sea gratuito ni que ya exista un staging.

**Fuentes oficiales consultadas el 19-10-2026:**

- [Supabase Pricing](https://supabase.com/pricing) — Free $0, dos proyectos activos como máximo, base de 500 MB, Storage de 1 GB y plan Pro desde $25.
- [Supabase Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) — cuota y reglas de proyectos gratuitos.
- [Available Regions](https://supabase.com/docs/guides/platform/regions) — São Paulo `sa-east-1` y regiones alternativas.
- [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) — pausa del plan Free ante inactividad.
- [Local Development](https://supabase.com/docs/guides/local-development) — CLI y contenedores.
- [Control Your Costs](https://supabase.com/docs/guides/platform/cost-control) — alcance limitado del Spend Cap para planes pagos.

Precios, límites, condiciones y disponibilidad pueden cambiar y deben confirmarse **al momento de cualquier decisión de contratación**. El coste base publicado no calcula energía/equipamiento local ni servicios de terceros.

## 2. Presupuesto y política de cero cargos

**Propuesta comercial inicial: plataforma Free sin cargos recurrentes.** El presupuesto todavía **no ha sido aprobado** por el propietario, y no se autoriza ninguna forma de pago, complemento, upgrade, servicio de correo, cron externo, dominio de pago, IA facturable, pasarela de pagos o cuenta Pro.

Antes de cualquier creación se debe verificar en la interfaz de cuenta:
- Que el proyecto se crearía efectivamente en una organización **Free**, no en una organización Pro con compute facturable.
- Que existe un cupo gratuito elegible y la acción no inicia un cobro.
- Que la cuenta y los miembros/roles no comparten secretos ni bases con FINZY, BAZAR ONLINE u otros proyectos.
- Que no se procesarán datos reales de clientes.
- Que no se subirán claves a GitHub ni se copiarán a documentos del proyecto.

El plan Free **no incluye backups automáticos**. Si las pruebas requieren restaurar un estado, habrá que diseñar y autorizar explícitamente una copia y ejercicio de recuperación de datos ficticios. Ninguna prueba real puede darse por superada anticipadamente.

## 3. Decisión del propietario — pendiente

La selección propuesta **no tiene valor de aprobación**. Para una autorización de alcance limitado faltan todavía estas confirmaciones:

1. **Cuenta/organización** que se utilizaría, con proyecto totalmente segregado y cupo Free confirmado.
2. **Proveedor/plan:** Supabase Free (recomendado) u otro.
3. **Región:** São Paulo `sa-east-1` **solo si** está disponible y es aceptable; revisar política de datos y latencia.
4. **Presupuesto máximo:** propuesta de **USD 0/mes en servicios cloud pagos**. Si se necesita algo de pago, detener la acción y pedir un permiso distinto.
5. **Responsable** de credenciales, seguridad, respaldo y eliminación del entorno.
6. **Datos de prueba**: únicamente ficticios, sin contenido de clientes.
7. **Autorización exacta:** inicialmente **solo crear un proyecto aislado** después de confirmar lo anterior. **NO** ejecutar SQL, conectar recursos existentes, desplegar funciones, publicar ni enviar correos.

Una confirmación general como «sigamos» no sustituye una autorización **específica** para crear infraestructura o aceptar costos.

## 4. Orden real de ejecución propuesto, pero NO autorizado

| Paso | Operación | Estado |
|---|---|---|
| 1 | Validar cupo, cuenta, acceso y condiciones del plan Free | **No verificado** |
| 2 | Solicitar autorización expresa para crear un proyecto nuevo y aislado | **Pendiente** |
| 3 | Crear proyecto solo tras permiso, sin SQL ni complementos | **No ejecutado** |
| 4 | Revisar acceso, configuración y presupuesto, sin exponer secretos | **No ejecutado** |
| 5 | Revisar esquema real y diseñar backup/restore de datos ficticios | **No ejecutado** |
| 6 | Solicitar autorización separada para SQL de staging y pruebas de concurrencia/RLS | **Pendiente** |
| 7 | Solicitar permiso separado para desplegar backend de ensayo | **Pendiente** |
| 8 | Producción y cobros: requieren nueva autorización independiente | **NO GO** |

## 5. Resultados y trazabilidad

El archivo `staging/v38-provider-selection.review.json` conserva las tres opciones, límites conocidos, enlaces oficiales, condiciones de decisión y todas las banderas de ejecución desactivadas.

**V38 no incorpora un nuevo simulador**: es una evaluación pública de precios y condiciones orientada a desbloquear la decisión G01. Se revisó documentalmente que: (a) no se confirma cupo ni región de una cuenta; (b) no existe aprobación ni coste activado; (c) SQL/producción continúan bloqueados; (d) ninguna opción permite modificar proyectos existentes por defecto.

**Estado final:** **PROPUESTA A / NO GO**. El siguiente avance real depende de una decisión humana concreta y de verificar las condiciones actuales del proveedor; no de agregar más scripts ficticios.

**Restricciones conservadas:** no se consultó una cuenta Supabase del usuario, no se creó proyecto, no se ejecutó SQL, no se modificaron `main`, Supabase, Lovable ni otros productos; cero servicios pagos activados.
