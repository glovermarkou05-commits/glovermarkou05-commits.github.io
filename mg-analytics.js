/* MG Digital Solutions · V8 · medición comercial opcional con consentimiento previo.
 * Sin backend ni almacenamiento de formularios. No envía datos personales.
 * El ID GA4 se configura en mg-analytics-config.js; cualquier evento requiere consentimiento.
 */
(function () {
  "use strict";
  const conf = window.MG_ANALYTICS_CONFIG || {};
  const measurementId = typeof conf.ga4MeasurementId === "string" ? conf.ga4MeasurementId.trim().toUpperCase() : "";
  const enabled = /^G-[A-Z0-9]{5,18}$/.test(measurementId);
  const storageKey = "mg-digital:analytics-consent:v1";
  const safePage = location.origin + location.pathname;
  let choice = null;
  let started = false;
  let banner = null;
  let preferencesButton = null;

  function readChoice() {
    try {
      const value = localStorage.getItem(storageKey);
      return value === "granted" || value === "denied" ? value : null;
    } catch (_) { return null; }
  }
  function saveChoice(value) {
    try { localStorage.setItem(storageKey, value); } catch (_) { /* sesión privada sin almacenamiento */ }
  }
  function currentProduct() {
    const file = location.pathname.split("/").pop().toLowerCase();
    if (file === "ventry.html") return "ventry";
    if (file === "mg-club-plus.html") return "mg_club_plus";
    if (file === "finzy.html") return "finzy";
    return "mg_digital_solutions";
  }
  // V8: modelo de eventos comerciales, sin datos personales ni textos libres.
  // Los valores enviados se limitan a enumeraciones conocidas, no a campos de formularios.
  const allowedProducts = ["ventry", "mg_club_plus", "finzy", "mg_digital_solutions"];
  const allowedMethods = ["whatsapp", "email", "section"];
  const allowedLocations = ["inicio", "problemas", "ventry", "sectores", "casos", "confianza",
    "soluciones", "demo", "planes", "portafolio", "nosotros", "contacto", "producto",
    "flujo", "avances", "modulos", "comparar", "funcionamiento", "diferenciales",
    "implementacion", "preguntas", "faq", "navigation", "other"];
  const allowedEvents = ["select_product", "contact_click", "contact_intent", "contact_form_prepared", "cta_click"];
  function productFromPath(path) {
    const name = path.split("/").pop().toLowerCase();
    if (name === "ventry.html") return "ventry";
    if (name === "mg-club-plus.html") return "mg_club_plus";
    if (name === "finzy.html") return "finzy";
    return null;
  }
  function ctaLocation(target) {
    const section = target && typeof target.closest === "function" ? target.closest("section[id]") : null;
    const id = section && section.id ? section.id.toLowerCase() : "navigation";
    return allowedLocations.includes(id) ? id : "other";
  }
  function safeEnum(value, list) {
    return typeof value === "string" && list.includes(value) ? value : null;
  }
  function track(name, details) {
    if (!enabled || choice !== "granted" || !started || typeof window.gtag !== "function") return false;
    if (!allowedEvents.includes(name)) return false;
    const info = details && typeof details === "object" ? details : {};
    const product = safeEnum(info.product, allowedProducts);
    const method = safeEnum(info.contact_method, allowedMethods);
    const cta = safeEnum(info.cta_location, allowedLocations);
    const params = { source_page: currentProduct(), page_path: location.pathname };
    if (product) params.product = product;
    if (method) params.contact_method = method;
    if (cta) params.cta_location = cta;
    window.gtag("event", name, params);
    return true;
  }
  window.mgTrackEvent = track;

  function startAnalytics() {
    if (!enabled || started || choice !== "granted") return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    // Modo básico: ningún script de Google se añade antes del consentimiento.
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      page_title: document.title,
      page_location: safePage,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    script.onerror = function () { /* No interrumpe navegación ni formularios */ };
    document.head.appendChild(script);
  }
  function removeBanner() {
    if (banner) { banner.remove(); banner = null; }
  }
  function setChoice(value) {
    choice = value;
    saveChoice(value);
    removeBanner();
    if (value === "granted") startAnalytics();
    else if (started) {
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      }
      // Cortar cualquier sesión previamente aceptada: recargar sin iniciar etiquetas.
      location.reload();
    }
  }
  function addStyles() {
    const style = document.createElement("style");
    style.textContent = ".mg-privacy-banner{position:fixed;z-index:9999;bottom:16px;left:16px;right:16px;max-width:760px;margin:auto;padding:18px 22px;background:#0b1f34;color:#f6fbff;border:1px solid rgba(72,200,255,.38);border-radius:17px;box-shadow:0 18px 65px rgba(0,0,0,.44);font:14px/1.6 system-ui,sans-serif}.mg-privacy-banner h2{font-size:17px;line-height:1.3;margin:0 0 6px;color:#fff}.mg-privacy-banner p{margin:0 0 13px;color:#c4d4e5}.mg-privacy-banner a{color:#80dfff;text-decoration:underline}.mg-privacy-actions{display:flex;gap:10px;flex-wrap:wrap}.mg-privacy-actions button{cursor:pointer;padding:10px 17px;min-height:42px;border-radius:10px;font:700 14px system-ui,sans-serif;border:1px solid #80dfff}.mg-privacy-accept{color:#071321;background:#55d8ff}.mg-privacy-reject{color:#f6fbff;background:transparent}.mg-privacy-actions button:focus-visible,.mg-privacy-preferences:focus-visible{outline:3px solid #55d8ff;outline-offset:3px}.mg-privacy-preferences{padding:3px 6px;border:0;background:transparent;color:#a9dffb;cursor:pointer;text-decoration:underline;font:inherit}@media(max-width:600px){.mg-privacy-banner{bottom:9px;left:9px;right:9px;padding:15px}.mg-privacy-actions button{flex:1}}";
    document.head.appendChild(style);
  }
  function showBanner() {
    if (!enabled || banner) return;
    banner = document.createElement("section");
    banner.className = "mg-privacy-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Preferencias de medición de visitas");
    banner.innerHTML = '<h2>Estadísticas opcionales</h2><p>Nos gustaría medir qué páginas se visitan y qué botones se usan para mejorar MG Digital Solutions. Solo activaremos Google Analytics si aceptas; puedes cambiar tu decisión cuando quieras. <a href="privacidad.html">Ver privacidad</a>.</p><div class="mg-privacy-actions"><button type="button" class="mg-privacy-reject" data-mg-choice="denied">Rechazar</button><button type="button" class="mg-privacy-accept" data-mg-choice="granted">Aceptar estadísticas</button></div>';
    banner.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-mg-choice]");
      if (button) setChoice(button.dataset.mgChoice);
    });
    document.body.appendChild(banner);
  }
  function setupPreferencesButton() {
    const footer = document.querySelector("footer");
    if (!footer || !enabled) return;
    preferencesButton = document.createElement("button");
    preferencesButton.type = "button";
    preferencesButton.className = "mg-privacy-preferences";
    preferencesButton.textContent = "Preferencias de estadísticas";
    preferencesButton.addEventListener("click", function () { showBanner(); });
    footer.appendChild(preferencesButton);
  }
  function handleClick(event) {
    const target = event.target;
    const element = target && typeof target.closest === "function" ? target : null;
    if (!element) return;
    const area = ctaLocation(element);
    const button = element.closest("button#waFloat");
    if (button) {
      track("cta_click", { product: currentProduct(), cta_location: area });
      track("contact_click", { product: currentProduct(), contact_method: "whatsapp", cta_location: area });
      return;
    }
    const a = element.closest("a[href]");
    if (!a) return;
    if (a.id === "waBtn") {
      track("cta_click", { product: currentProduct(), cta_location: area });
      track("contact_click", { product: currentProduct(), contact_method: "whatsapp", cta_location: area });
      return;
    }
    const href = a.getAttribute("href") || "";
    let u;
    try { u = new URL(href, location.href); } catch (_) { return; }
    const targetProduct = u.origin === location.origin ? productFromPath(u.pathname) : null;
    const isContactSection = u.origin === location.origin && (u.hash === "#contacto" || u.hash === "#demo");
    const isWhatsApp = u.hostname === "wa.me" || u.hostname === "api.whatsapp.com";
    const isEmail = u.protocol === "mailto:";
    // Un botón de navegación interna no es una oportunidad de venta confirmada.
    const isCommercialCta = isContactSection || isWhatsApp || isEmail ||
      Boolean(targetProduct && u.pathname !== location.pathname);
    if (isCommercialCta) track("cta_click", {
      product: targetProduct || currentProduct(), cta_location: area
    });
    if (isWhatsApp || isEmail) {
      track("contact_click", {
        product: currentProduct(), contact_method: isWhatsApp ? "whatsapp" : "email",
        cta_location: area
      });
    } else if (isContactSection) {
      // Priorizar el hash: soluciona los enlaces a #demo/#contacto en la propia página de producto.
      track("contact_intent", {
        product: currentProduct(), contact_method: "section", cta_location: area
      });
    } else if (targetProduct && u.pathname !== location.pathname) {
      track("select_product", { product: targetProduct, cta_location: area });
    }
  }
  function init() {
    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", function (e) {
      if (e.target && e.target.id === "demoForm") track("contact_form_prepared", { product: currentProduct(), contact_method: "whatsapp", cta_location: ctaLocation(e.target) });
    }, true);
    if (!enabled) return;
    addStyles();
    setupPreferencesButton();
    choice = readChoice();
    if (choice === "granted") startAnalytics();
    else if (choice === null) showBanner();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
