# V10 · Tablero Ejecutivo Comercial — MG Digital Solutions

**Estado:** plano de implementación; el tablero de Looker Studio requiere autorizar la propiedad GA4 desde la cuenta del propietario. No se han creado ni publicado dashboards dentro de Looker Studio mediante GitHub.

## Fuente oficial de datos

- Google Analytics 4, propiedad: **MG Digital Solutions Web**.
- ID de medición del flujo web: `G-JCXNZ6W46C`. **No usar el ID de medición como ID de propiedad**; seleccionar la propiedad por su nombre en el conector.
- Sitio: https://glovermarkou05-commits.github.io/
- Los eventos propios de V8 requieren consentimiento del visitante.
- Dimensiones personalizadas de **ámbito Evento**, ya registradas en GA4:
  - **Página de origen** → `source_page`
  - **Producto consultado** → `product`
  - **Medio de contacto** → `contact_method`
  - **Ubicación del botón** → `cta_location`

## Creación de la fuente y del tablero (propietario en Looker Studio)

1. Abrir https://lookerstudio.google.com/ e iniciar sesión con la cuenta que administra **MG Digital Solutions Web**.
2. Elegir **Crear → Fuente de datos → Google Analytics**. Autorizar si aparece el diálogo.
3. Seleccionar cuenta y propiedad **MG Digital Solutions Web**, y pulsar **Conectar**.
4. Pulsar **Crear informe** y luego **Añadir al informe**.
5. Nombrar el informe **MG Digital Solutions | Dashboard Ejecutivo V10**.
6. Añadir control de intervalo de fechas; por defecto **Últimos 28 días**. Confirmar que incluya eventos de octubre de 2026.
7. Comprobar que existan en la fuente las cuatro dimensiones personalizadas; si no aparecen, actualizar los campos de la fuente y verificar permisos y procesamiento de GA4.
8. Mantener el informe como **privado** hasta revisar sus permisos, resultados y diseño. No compartirlo públicamente ni incrustarlo en la web sin autorización.

### Diseño sugerido

- Formato panorámico 16:9, fondo claro, encabezado azul oscuro `#071321`, acentos celestes `#48C8FF` y blancos. Estilo coherente con MG Digital Solutions.
- Una página inicial ejecutiva y hasta tres páginas de detalle. No mostrar métricas como ventas si solo se miden clics.
- Encabezado: **MG Digital Solutions | Dashboard Ejecutivo**, fecha del período, filtro de fechas y marca de *Datos de GA4 (consentimiento)*.

## Página 1 — Resumen ejecutivo

| Componente | Métrica GA4 | Filtro / dimensión | Interpretación |
|---|---|---|---|
| Tarjeta 1: Usuarios activos | **Usuarios activos** | Fuente web | Personas activas estimadas, según GA4 |
| Tarjeta 2: Vistas | **Vistas** | Fuente web | Páginas vistas |
| Tarjeta 3: Clics en productos | **Número de eventos** | **Nombre del evento** exactamente `select_product` | Interacciones con enlaces de productos |
| Tarjeta 4: Clics a contacto | **Número de eventos** | **Nombre del evento** exactamente `contact_click` | Intentos de abrir WhatsApp o correo |
| Tarjeta 5: Formularios preparados | **Número de eventos** | **Nombre del evento** exactamente `contact_form_prepared` | Formulario que preparó WhatsApp; no fue enviado necesariamente |
| Gráfico de evolución | **Vistas** y/o **Usuarios activos** | **Fecha** | Tendencia diaria |
| Tabla de páginas | **Vistas**, **Usuarios activos** | **Título de página y nombre de pantalla** | Inicio, Ventry, MG CLUB+, FINZY |

**No sumar** usuarios activos de cada página para obtener el total de usuarios distintos. Evitar ratios de conversión comercial basados en clics sin un evento de contacto recibido o de venta confirmada.

## Página 2 — Interés por producto

- Gráfico de barras o tabla.
- **Dimensión:** `Producto consultado`.
- **Métrica:** `Número de eventos`.
- **Filtro:** `Nombre del evento` coincide exactamente con `select_product`.
- Agrupar valores `ventry`, `mg_club_plus` y `finzy`; conservar `(sin definir)` como dato de calidad cuando aparezca, no asignarlo a ningún producto.
- Segundo gráfico: vistas por página (`Título de página y nombre de pantalla`, `Vistas`), para distinguir tráfico de clics.

## Página 3 — Contactos y botones

- **Clics comerciales por ubicación:** `Ubicación del botón` + `Número de eventos`, filtro `Nombre del evento = cta_click`.
- **Contactos por medio:** `Medio de contacto` + `Número de eventos`, filtro `Nombre del evento = contact_click`.
- **Intención de contactar:** `Nombre del evento` + `Número de eventos`, incluir `contact_click`, `contact_intent`, `contact_form_prepared` mediante filtro regex `^(contact_click|contact_intent|contact_form_prepared)$`.
- Los eventos `contact_click` y `contact_form_prepared` ya se comprobaron en tiempo real; reflejan intención, **no mensajes entregados**.

## Página 4 — Tendencias y optimización

- Serie temporal por **Fecha** y **Número de eventos** para interacciones comerciales con un filtro de tipos de eventos elegido.
- Tabla de **Página de origen** por **Nombre del evento** con **Número de eventos**.
- Filtro de fecha para 7, 28, 90 días y personalizado. Si no hay datos históricos suficientes, mostrar falta de datos, no cifras ficticias.

## Control de calidad V10

- Verificar la conexión leyendo 3 usuarios activos y 5 vistas en el primer informe GA4 **solo como referencia a la captura de prueba del 22–28 de octubre de 2026**. No usar esos valores como tarjetas permanentes ni asegurar que seguirán iguales.
- Comprobar los nombres de eventos con `Número de eventos` y **Nombre del evento**.
- Comprobar que la fila `(sin definir)` no se atribuya a ninguno de los productos.
- Verificar controles de fecha y que no existan filtros heredados inesperados.
- Confirmar que solo cuentas autorizadas puedan ver el panel. Se puede compartir con usuarios concretos tras validar.
- Guardar captura y URL privada de Looker Studio para validar el tablero desde ChatGPT sin exponerlo públicamente.

## Documentación oficial

- https://docs.cloud.google.com/data-studio/connect-to-google-analytics?hl=es
- https://docs.cloud.google.com/data-studio/add-data-to-a-report
- https://support.google.com/analytics/answer/14239696?hl=es
