# MG Digital Solutions — V7: medición y conversiones

Estado: **código preparado, medición externa DESACTIVADA** hasta que el propietario configure un ID de Google Analytics 4 real.

## Qué incluye V7

1. Las cuatro páginas `index.html`, `ventry.html`, `mg-club-plus.html` y `finzy.html` cargan dos scripts locales diferidos.
2. `mg-analytics-config.js` tiene el identificador GA4 vacío. No se conecta a Google y no aparece un banner innecesario mientras esté vacío.
3. `mg-analytics.js` registra eventos solo cuando la configuración contiene un ID válido y el visitante **acepta** las estadísticas.
4. `privacidad.html` describe el funcionamiento, formularios y la medición opcional; cada página enlaza el aviso.
5. Con GA4 activo el visitante puede **aceptar o rechazar**; el botón para revisar la decisión aparece en el pie. El consentimiento se guarda localmente.
6. Se bloquean las etiquetas externas **antes** del consentimiento (modo básico). Después de aceptar, se carga `gtag.js` con señales de anuncios denegadas.

## Qué mide el sitio cuando se active y se acepte

| Evento GA4 | Significado | No significa |
| --- | --- | --- |
| `page_view` | Visita a una de las páginas, mediante GA4 | Venta o cliente conseguido |
| `select_product` | Clic hacia otra página de producto | Cliente que contrató |
| `contact_intent` | Clic hacia una sección de contacto | Mensaje enviado |
| `contact_click` | Clic a un enlace WhatsApp o correo | Mensaje enviado o entregado |
| `contact_form_prepared` | Envío del formulario que prepara el mensaje para WhatsApp | Mensaje enviado o venta cerrada |

Eventos limitados a: `source_page`, `page_path`, `product`, `contact_method`. **No** copiar campos del formulario, cédulas, teléfonos, correos o textos libres a Analytics.

## Activación manual de GA4 (requiere cuenta Google)

1. Entrar a https://analytics.google.com/ con la cuenta empresarial.
2. Crear **Cuenta → Propiedad GA4 → Flujo de datos web**.
3. URL web: `https://glovermarkou05-commits.github.io/`.
4. Nombre sugerido del flujo: **MG Digital Solutions Web**.
5. Copiar el **ID de medición**, que comienza por `G-`. NO copiar credenciales, API secrets ni claves privadas.
6. Cambiar solo `ga4MeasurementId: ""` en `mg-analytics-config.js` a `ga4MeasurementId: "G-XXXXXXXXXX"`.
7. Publicar y abrir la web en una sesión limpia. Confirmar que ninguna llamada a `googletagmanager.com` aparece **antes** de aceptar; aceptar y comprobar actividad en **Informes → Tiempo real** de GA4.
8. Rechazar y comprobar que no se carga el script en una visita nueva. Verificar el botón de preferencias para modificar la decisión.
9. Revisar el funcionamiento en móvil y los enlaces de WhatsApp.

No hay un ID configurado todavía: **no existen estadísticas activas ni un panel de visitas que pudiera inventarse**.

## Alcance y restricciones

- GitHub Pages no tiene backend de captación de contactos.
- Los formularios preparan WhatsApp y requieren pulsar *Enviar* allí.
- Google Search Console (verificado previamente) informa sobre presencia en resultados de búsqueda; GA4 permite estadísticas de visitas cuando esté activo.
- Para ver *clientes interesados reales* que completaron un contacto y las ventas, hará falta una integración de WhatsApp/CRM autorizada o registro comercial. Un clic no equivale a un contacto confirmado.
- Mantener `google973dc75fbd198bb1.html` en la raíz para conservar verificación Search Console.
- La conexión a GA4 y ajustes jurídicos/comerciales de privacidad deben ser revisados por el propietario antes de su activación.
