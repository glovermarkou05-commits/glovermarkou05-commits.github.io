/* MG AI WEB ASSISTANT V9 — Generador DETERMINISTA de borradores de ejemplo.
 * No es un modelo de IA. No realiza llamadas externas, no persiste ni publica.
 * El resultado se valida y requiere revisión humana antes de aplicarse al borrador.
 */
(function(root){
 "use strict";
 const TYPES={
  tienda:{label:"Tienda y catálogo",lead:"Descubre productos para tu día a día",service:"Productos destacados",detail:"Explora una selección de productos y encuentra opciones para tus necesidades.",intent:"Explorar productos",extra:"Categorías y novedades"},
  servicios:{label:"Servicios profesionales",lead:"Soluciones para tus próximos proyectos",service:"Nuestros servicios",detail:"Conoce las soluciones que ofrecemos y solicita información personalizada.",intent:"Solicitar información",extra:"Proceso de atención"},
  restaurante:{label:"Café y restaurante",lead:"Sabores y experiencias para compartir",service:"Nuestro menú",detail:"Descubre nuestros platos, bebidas y momentos especiales.",intent:"Conocer el menú",extra:"Visítanos"},
  portafolio:{label:"Portafolio creativo",lead:"Proyectos que cuentan nuestra historia",service:"Trabajos recientes",detail:"Conoce las ideas y proyectos que nos inspiran.",intent:"Ver proyectos",extra:"Nuestra trayectoria"},
  educacion:{label:"Educación y talleres",lead:"Aprender y crear nuevas oportunidades",service:"Programas y talleres",detail:"Explora actividades, cursos y talleres para desarrollar nuevas habilidades.",intent:"Consultar programas",extra:"Cómo aprender"}
 };
 const STYLES={
  moderno:{label:"Moderno",color:"#186999"},
  elegante:{label:"Elegante",color:"#51427c"},
  creativo:{label:"Creativo",color:"#ad4d85"},
  natural:{label:"Natural",color:"#347b63"}
 };
 const GOALS={vender:"Presentar productos",contacto:"Recibir consultas",mostrar:"Mostrar mi trabajo",reservar:"Solicitar reservas o citas"};
 const PLANS={Start:1,Crece:3,Pro:5};
 const escSpace=v=>String(v==null?"":v).replace(/\s+/g," ").trim();
 const copy=v=>JSON.parse(JSON.stringify(v));
 function slug(value){return escSpace(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,64);}
 function validate(input){
  if(!input||typeof input!=="object"||Array.isArray(input))return "Completa el formulario del asistente.";
  if(!TYPES[input.type]||!STYLES[input.style]||!GOALS[input.goal]||!PLANS[input.plan])
   return "Selecciona un sector, objetivo, estilo y plan disponibles.";
  for(const [key,min,max] of [["brand",2,65],["audience",4,100],["offering",5,170]]){
   const val=escSpace(input[key]);
   if(val.length<min||val.length>max)return "Revisa "+key+": debe tener entre "+min+" y "+max+" caracteres.";
   if(/<[^>]*>|[\u0000-\u001f]/.test(val))return "Usa solo texto descriptivo, sin etiquetas HTML ni caracteres de control.";
  }
  return null;
 }
 function block(type,title,body){
  return {type,title,body,visible:true,image:"",images:[],alt:"",imageAssetId:"",galleryAssetIds:[]};
 }
 function createProposal(input){
  const error=validate(input);if(error)return {ok:false,error};
  const a={type:input.type,style:input.style,goal:input.goal,plan:input.plan,
   brand:escSpace(input.brand),audience:escSpace(input.audience),offering:escSpace(input.offering)};
  const t=TYPES[a.type],style=STYLES[a.style],goal=GOALS[a.goal],max=PLANS[a.plan];
  const title=a.brand+" | "+t.lead;
  const desc=a.brand+" ofrece "+a.offering+" para "+a.audience+". Conoce nuestra propuesta y encuentra la opción ideal para ti.";
  const cta=a.goal==="contacto"?"Solicitar información":a.goal==="mostrar"?"Ver nuestros proyectos":
    a.goal==="reservar"?"Consultar disponibilidad":t.intent;
  const tagline="En "+a.brand+" nos especializamos en "+a.offering+". Pensamos en "+a.audience+
   " y buscamos una experiencia clara, útil y cercana.";
  const home={name:"Inicio",slug:"",title:title.slice(0,100),description:desc.slice(0,300),cta:cta.slice(0,45),
   seo:{title:(a.brand+" | "+t.service).slice(0,100),description:desc.slice(0,160),shareTitle:a.brand,shareDescription:desc.slice(0,160),noindex:false},
   blocks:[block("text","Bienvenidos a "+a.brand,tagline),block("services",t.service,a.offering+". "+t.detail),
    block("cta","Hablemos de lo que necesitas","Déjanos conocer tus ideas o consulta nuestras opciones.")]};
  const pages=[home];
  if(max>=3)pages.push({name:"Servicios",slug:"servicios",title:t.service+" de "+a.brand,
   description:desc.slice(0,300),cta:cta.slice(0,45),
   seo:{title:(t.service+" | "+a.brand).slice(0,100),description:desc.slice(0,160),shareTitle:"",shareDescription:"",noindex:false},
   blocks:[block("services",t.service,a.offering+". "+t.detail),block("text","Pensado para "+a.audience,
    "Conoce nuestra propuesta y contacta a nuestro equipo para resolver tus consultas.")]});
  if(max>=3)pages.push({name:"Contacto",slug:"contacto",title:"Contacta con "+a.brand,
   description:"Cuéntanos qué necesitas. "+desc.slice(0,240),cta:"Enviar una consulta",
   seo:{title:("Contacto | "+a.brand).slice(0,100),description:desc.slice(0,160),shareTitle:"",shareDescription:"",noindex:false},
   blocks:[block("text","Estamos para ayudarte","Puedes compartir tus preguntas sobre "+a.offering+"."),
    block("contact","Solicita información","Este formulario se mostrará únicamente como demostración hasta contar con un backend autorizado.")]});
  if(max>=5)pages.push({name:"Nosotros",slug:"nosotros",title:"Conoce a "+a.brand,
   description:desc.slice(0,300),cta:"Conoce nuestros servicios",
   seo:{title:("Nosotros | "+a.brand).slice(0,100),description:desc.slice(0,160),shareTitle:"",shareDescription:"",noindex:false},
   blocks:[block("text","Nuestra historia",tagline),block("services","Nuestra propuesta",t.detail)]});
  if(max>=5)pages.push({name:"Destacados",slug:"destacados",title:t.extra+" de "+a.brand,
   description:desc.slice(0,300),cta:cta.slice(0,45),
   seo:{title:(t.extra+" | "+a.brand).slice(0,100),description:desc.slice(0,160),shareTitle:"",shareDescription:"",noindex:false},
   blocks:[block("text",t.extra,tagline),block("cta","Da el siguiente paso","Conoce más y pregunta por nuestras opciones.")]});
  return {ok:true,proposal:copy({mode:"template-simulation",businessName:a.brand,plan:a.plan,color:style.color,
   pages:pages,summary:"Propuesta orientativa para "+a.brand+" ("+t.label+", "+style.label+"). No es contenido generado por IA real.",
   warnings:["Revisa cada texto, precio, dato y afirmación antes de usarlo.","Los formularios y botones son demostrativos, sin envío real.","La publicación requiere aprobación humana."]})};
 }
 root.MGAIWebAssistant=Object.freeze({version:"9.0-demo",mode:"template-simulation",
  sectors:Object.keys(TYPES).map(k=>({id:k,label:TYPES[k].label})),
  styles:Object.keys(STYLES).map(k=>({id:k,label:STYLES[k].label})),
  goals:Object.keys(GOALS).map(k=>({id:k,label:GOALS[k]})),
  plans:Object.keys(PLANS),validate,createProposal});
})(typeof window!=="undefined"?window:globalThis);
