# MG Digital Solutions — V9 · Informe Comercial GA4

Fecha de preparación: 27 de octubre de 2026 (hora Ecuador).
Estado: **plantilla documentada en GitHub; exploración GA4 aún requiere crearse desde la cuenta del propietario**. No se almacena ni expone información privada de Google Analytics en el repositorio público.

## Propósito y límites

Construir una exploración de **Google Analytics 4 → Explorar → Formato libre** denominada:

**V9 | MG Digital Solutions · Informe Comercial**

Propiedad GA4: MG Digital Solutions Web. ID público de medición: `G-JCXNZ6W46C`.

La web fue verificada en Search Console y GA4 recibió eventos de prueba con consentimiento. No existe desde GitHub Pages acceso a la API privada de Google Analytics ni un CRM de contactos confirmados. **No afirmar que los clics son clientes o ventas.**

## Datos comprobados previamente (captura de pruebas, no resultados comerciales)

Los siguientes números proceden de la captura del informe *Tiempo real* durante las pruebas iniciales, no de una extracción histórica automatizada:

- Usuarios activos en esa ventana: **3**.
- `page_view`: **5**.
- `first_visit`: **3**.
- `session_start`: **3**.
- `cta_click`: **2**.
- `select_product`: **2**.
- `contact_intent`: **1**.
- La captura de vistas por página mostraba **3 vistas de la página principal** y **2 de Ventry Commercial**.

No se confirmó `contact_click` ni `contact_form_prepared` en aquella captura. Los valores de la ventana de tiempo real pueden cambiar y no describen un período comercial completo.

## Dimensiones personalizadas — ya creadas por el propietario

Todas son de ámbito **Evento**:

| Nombre exacto en la propiedad | Parámetro exacto | Ejemplos permitidos |
| --- | --- | --- |
| Página de origen | `source_page` | `mg_digital_solutions`, `ventry`, `mg_club_plus`, `finzy` |
| Producto consultado | `product` | `ventry`, `mg_club_plus`, `finzy` |
| Medio de contacto | `contact_method` | `whatsapp`, `email`, `section` |
| Ubicación del botón | `cta_location` | `portafolio`, `planes`, `producto`, `contacto`, `demo` |

Las dimensiones nuevas pueden tardar 24–48 horas en verse con datos. Para `page_view`, pueden aparecer dimensiones de evento como **(not set)**: los parámetros comerciales se envían con nuestros eventos personalizados, no en todos los eventos automáticos.

## Preparación en Google Analytics

1. Entrar a https://analytics.google.com/ y seleccionar **MG Digital Solutions Web**.
2. Ir a **Explorar → Formato libre**.
3. Cambiar el nombre de la exploración a **V9 | MG Digital Solutions · Informe Comercial**.
4. Seleccionar un período consistente: **Últimos 28 días**, y comparar posteriormente con el período previo cuando haya volumen.
5. En **Variables → Dimensiones (+)**, importar:
   - **Nombre del evento**.
   - **Fecha**.
   - **Título de página y nombre de pantalla**.
   - **Ruta de página y clase de pantalla**, o la dimensión de ruta de página disponible en la propiedad.
   - En pestaña **Personalizada**: **Página de origen**, **Producto consultado**, **Medio de contacto**, **Ubicación del botón**.
6. En **Variables → Métricas (+)**, importar:
   - **Número de eventos**.
   - **Vistas**.
   - **Usuarios activos** (para la pestaña de tráfico, no para afirmar contactos únicos).
7. La técnica **Formato libre** permite varias pestañas, tablas, visualizaciones y filtros. Crear las siguientes cuatro pestañas.

### Pestaña A — Tráfico por producto

- Nombre: **01 · Tráfico por página**.
- Visualización: **Tabla**.
- Filas: **Título de página y nombre de pantalla** (o **Ruta de página y clase de pantalla** si el título no diferencia las páginas).
- Valores: **Vistas**, **Usuarios activos**.
- Si hay contenido adicional de la propiedad, aplicar filtros adecuados del flujo web.
- Interpretación: tráfico hacia inicio, Ventry, MG CLUB+ y FINZY. **No son ventas**.

### Pestaña B — Interés por producto

- Nombre: **02 · Interés por producto**.
- Visualización: **Tabla** (y opcionalmente gráfico de barras).
- Filas: **Producto consultado**.
- Valores: **Número de eventos**.
- Filtro: **Nombre del evento** → coincide exactamente con `select_product`.
- Interpretación: clics desde una página hacia la página de un producto. Un mismo usuario puede generar varios eventos.
- Si alguna fila se muestra como `(not set)`, revisar que el filtro sea `select_product` y que GA4 haya procesado la dimensión.

### Pestaña C — Rendimiento de botones

- Nombre: **03 · Botones comerciales**.
- Visualización: **Tabla**.
- Filas: **Ubicación del botón**, y opcionalmente **Página de origen** como segunda fila anidada.
- Valores: **Número de eventos**.
- Filtro: **Nombre del evento** → coincide exactamente con `cta_click`.
- Interpretación: qué zonas del sitio producen más clics. No convierte los clics en clientes confirmados.

### Pestaña D — Canales e intención de contacto

- Nombre: **04 · Intención de contacto**.
- Visualización: **Tabla**.
- Filas: **Nombre del evento**, **Medio de contacto**.
- Valores: **Número de eventos**.
- Filtro: **Nombre del evento** → coincide con la expresión regular `^(contact_click|contact_intent|contact_form_prepared)$` (o filtros de inclusión equivalentes, según la interfaz).
- Interpretación:
  - `contact_click`: se pulsó un enlace a WhatsApp o correo.
  - `contact_intent`: se abrió una sección de contacto.
  - `contact_form_prepared`: el formulario preparó el mensaje de WhatsApp.
  - Ninguno confirma mensaje enviado, cotización aprobada ni venta.

## Pruebas finales pendientes: dos eventos de contacto

En una ventana de incógnito con consentimiento explícito para estadísticas:

1. Abrir https://glovermarkou05-commits.github.io/ventry.html.
2. Pulsar un enlace a WhatsApp: puede abrir el servicio, pero **no es necesario enviar un mensaje**. En GA4 *Resumen en tiempo real* observar si aparece `contact_click`.
3. Volver al formulario de demostración, rellenar únicamente datos genéricos de prueba sin datos personales innecesarios y pulsar su botón para preparar el mensaje. **No enviar el mensaje desde WhatsApp**. En tiempo real comprobar `contact_form_prepared`.
4. Consultar **Administrar → Visualización de datos → Eventos** y los informes de Exploración cuando los eventos se hayan procesado.
5. Si `contact_click` no aparece porque el navegador cambia a WhatsApp antes de enviar la solicitud, considerar en una etapa futura un mecanismo de entrega más robusto, manteniendo la privacidad.

## Indicadores mensuales de dirección (definiciones)

| KPI | Cálculo | Limitación |
| --- | --- | --- |
| Vistas totales | Suma de `Vistas` | Una visita a una página no es un comprador. |
| Interés por producto | Recuento `select_product` por `product` | Clics, no usuarios únicos. |
| Botones más usados | Recuento `cta_click` por `cta_location` | No equivale a oportunidades reales. |
| Clics de contacto | Recuento `contact_click` por `contact_method` | El mensaje puede no enviarse. |
| Formularios preparados | Recuento `contact_form_prepared` | No confirma entrega. |
| Conversión real | **No medible aún** | Requiere vincular un proceso de recepción y cierre comercial autorizado. |

## Control de calidad y mantenimiento

- Conservar la V8 publicada, Google Search Console, sitemap, privacidad y archivo de verificación.
- Documentar cambios de eventos y de dimensiones antes de modificar el código.
- No capturar ni publicar token OAuth, JSON de servicio, credenciales GA4, identificadores de visitantes ni mensajes de contacto en GitHub.
- Recordar que Google Analytics solo se carga cuando el visitante acepta las estadísticas.
- Esta guía **no crea la exploración dentro de la cuenta GA4**; esa acción aún debe realizarla una persona autorizada dentro de Google Analytics.
- Fuentes técnicas: https://support.google.com/analytics/answer/9327972?hl=es y https://support.google.com/analytics/answer/14239696?hl=es.
