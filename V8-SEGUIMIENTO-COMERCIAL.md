# V8 · Seguimiento comercial MG Digital Solutions

Estado del código: preparado en GitHub Pages. La propiedad Google Analytics 4 usa el flujo web `G-JCXNZ6W46C`.

## Qué se mide después del consentimiento

| Evento GA4 | Acción observada | Interpretación correcta |
| --- | --- | --- |
| `page_view` | Visita a una página | Visita, no cliente potencial |
| `select_product` | Clic en otra página de producto (Ventry, MG CLUB+ o FINZY) | Interés por un producto |
| `cta_click` | Clic en un acceso a producto, demostración, WhatsApp o correo | Interacción con un botón o enlace comercial |
| `contact_intent` | Clic hacia la sección `#contacto` o `#demo` | Deseo de ver medios de contacto |
| `contact_click` | Clic en enlace a WhatsApp, correo o botón flotante de WhatsApp | Intento de abrir un canal; **no** mensaje confirmado |
| `contact_form_prepared` | Formulario válido que prepara un mensaje para WhatsApp | Solicitud preparada; **no** envío confirmado ni venta |

La V8 corrige el registro de enlaces `#demo` y `#contacto` dentro de la misma página de producto, que podían omitirse en la V7.

## Parámetros incluidos

- `source_page`: valores cerrados `mg_digital_solutions`, `ventry`, `mg_club_plus` y `finzy`.
- `product`: producto al que se dirige un clic o página actual donde se realiza el contacto (conjunto cerrado).
- `contact_method`: `whatsapp`, `email` o `section`.
- `cta_location`: sección del sitio donde se hace clic (`portafolio`, `planes`, `producto`, `demo`, `contacto`, etc.), con valores cerrados.
- `page_path`: ruta sin parámetros de URL ni mensajes de WhatsApp.

No se envían los nombres, teléfonos, correos, cédulas, contenido de formularios ni parámetros URL con información personal en **los eventos propios de V8**. El envío de datos generado automáticamente por GA4 está sujeto a la configuración y políticas de ese proveedor. Los visitantes deben otorgar consentimiento para activar las etiquetas.

## Configuración en Google Analytics 4 (requiere acceso del propietario)

1. Entrar a https://analytics.google.com/ y seleccionar la propiedad **MG Digital Solutions Web**.
2. Abrir **Administrar → Visualización de datos → Definiciones personalizadas → Crear dimensión personalizada**.
3. Crear estas 4 dimensiones con **Ámbito: Evento** y el parámetro exacto:

| Nombre visible sugerido | Parámetro de evento |
| --- | --- |
| Página de origen | `source_page` |
| Producto consultado | `product` |
| Medio de contacto | `contact_method` |
| Ubicación del botón | `cta_location` |

No crear otra dimensión para `page_path` si puede utilizarse la dimensión estándar de ruta de página.

4. Abrir **Informes → Tiempo real** y, tras una visita de prueba con consentimiento, comprobar los eventos `select_product`, `cta_click`, `contact_intent`, `contact_click` y `contact_form_prepared` según la acción realizada.
5. Para el análisis mensual, entrar en **Explorar → Formato libre**. Importar las dimensiones de evento anteriores y usar `Nombre del evento` junto con `Número de eventos` para comparar interés por producto, ubicación y medio de contacto.
6. Las dimensiones personalizadas pueden tardar **24–48 horas** en aparecer en informes convencionales después de recibir datos y crearlas.

## Indicadores sugeridos

- Visitantes y vistas por página: GA4 `usuarios` / `vistas`.
- Interés por producto: recuento de `select_product` filtrado por `product`.
- Intención de contacto: recuento `contact_intent`, `contact_click` y `contact_form_prepared`, separados.
- Puntos del sitio que generan más interés: recuento `cta_click` por `cta_location`.
- Canales preferidos: `contact_click` por `contact_method`.

**Estos números no equivalen a clientes únicos, mensajes recibidos, cotizaciones cerradas ni ventas.** Los mismos usuarios pueden realizar varios clics. Para medir conversiones reales será necesaria una integración con el proceso de recepción del contacto o un CRM autorizado.

## Eventos clave

No marcar como ventas ni `generate_lead` automáticamente el clic al WhatsApp: no garantiza que el mensaje haya sido enviado. Si el negocio quiere usar un indicador preliminar como evento clave de intención, puede valorar marcar `contact_form_prepared` como evento clave, con una etiqueta de **solicitud preparada**, no de cliente conseguido.

## QA y criterios de aceptación

- V8: 12 verificaciones dinámicas superadas en escenarios de navegación, enlaces, consentimiento y formularios.
- Con consentimiento rechazado o pendiente: ningún evento propio ni etiqueta GA4.
- Con consentimiento aceptado: etiqueta GA4 cargada; clics de producto y contacto con parámetros limitados.
- Enlaces de Ventry y FINZY a la sección de contacto: corregidos.
- Se conservan estilos V7 y contenido comercial.
- Google Analytics recibe visitas en tiempo real según comprobación anterior del propietario; los **nuevos eventos V8** deben probarse mediante interacción en el navegador.

No eliminar el archivo de verificación `google973dc75fbd198bb1.html` ni publicar contraseñas o tokens.
