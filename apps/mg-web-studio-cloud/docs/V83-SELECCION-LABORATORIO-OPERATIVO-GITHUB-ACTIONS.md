# MG WEB STUDIO CLOUD — V83 | Selección de laboratorio independiente para las 32 pruebas V67

**Fecha de decisión técnica:** 27/10/2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** **OPCIÓN PREFERIDA IDENTIFICADA — EJECUCIÓN NO AUTORIZADA (NO_GO)**  
**Alcance de V83:** seleccionar plataforma, coste, riesgos, matriz de aptitud de pruebas y pasos de autorización. **No crear ni iniciar PostgreSQL 17, no abrir servidores HTTP, no cambiar BAZAR, no conectar Supabase y no publicar.**

## 1. Verificaciones reales del entorno del usuario

- Repositorio GitHub confirmado mediante API: `glovermarkou05-commits/glovermarkou05-commits.github.io`, visibilidad **PUBLIC**, rama predeterminada **main**.
- La rama aislada de desarrollo sigue siendo `feature/mg-digital-v5-web-services`, y la V82 documentada finalizó con **584 pruebas automatizadas correctas**; eso **NO** significa aprobar ningún control de V67.
- La rama `main` no contiene actualmente archivos en `.github/workflows/` según su árbol, mientras que los flujos de CI se ejecutan desde la rama de desarrollo.
- La computadora Windows del usuario registró **8 CPU, RAM total 7.865 MiB, RAM disponible 740 MiB, C: 18.106 MiB libres, NVMe/NTFS**, y el contenedor de BAZAR-ONLINE fue reportado `healthy`. Por política V81: **NO_GO** para un segundo PG17 en ese equipo.
- `E:` es una tarjeta USB/SD, no destino recomendado para datos PostgreSQL persistentes.

## 2. Decisión recomendada

**Primer laboratorio técnico preferido: GitHub Actions, ejecutor `ubuntu-24.04` alojado por GitHub, efímero y limitado a datos ficticios.**

Características documentadas para runners Linux estándar de **repositorio público**: **4 CPU, 16 GB RAM, 14 GB SSD** y uso sin cargos de minutos de cómputo para runners estándar en repositorios públicos. Las cuotas y límites de concurrencia del plan siguen aplicando según el producto y pueden cambiar. El almacenamiento anunciado **no es espacio libre garantizado**: el espacio real y las imágenes en caché se deberán medir antes de utilizarlo.

GitHub documenta expresamente el uso de **PostgreSQL como contenedor de servicio** en un job Ubuntu. La imagen/versión PG17 debe elegirse y fijarse cuidadosamente en la fase autorizada; una imagen `postgres:17` flotante no equivale a verificar un digest inmutable.

**Precaución crítica:** que un runner sea una máquina virtual nueva y temporal **no** prueba aislamiento total de red. Puede tener conexiones salientes a Internet, utiliza infraestructura gestionada y sus logs de una ejecución en repositorio público son visibles. Se prohíbe introducir contraseñas de producción, credenciales Supabase, datos de clientes, volcados reales, PIIs, tokens de servicio, direcciones privadas, variables con secretos o capturas sensibles.

**Fuentes verificadas el 27/10/2026:**
- GitHub-hosted runners: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- Servicio PostgreSQL: https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers
- GitHub Actions runner pricing: https://docs.github.com/en/billing/reference/actions-runner-pricing
- Visibilidad de logs públicos: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
- Workflow dispatch y rama principal: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

## 3. Comparativo de alternativas

| Alternativa | Recursos y almacenamiento | Coste publicado | Limitaciones críticas | Decisión |
| --- | --- | --- | --- | --- |
| **GitHub Actions estándar en repo público** | 4 CPU, 16 GB RAM, 14 GB SSD del runner Ubuntu | **$0 por cómputo estándar** del repo público, según condiciones actuales | Ejecución temporal, almacenamiento pequeño, salida/artefactos públicos, sin IP estable ni respaldo persistente automático | **PRIMERA OPCIÓN PARA PRUEBAS TÉCNICAS SINTÉTICAS** |
| **DigitalOcean Basic Droplet** | 2 vCPU, 4 GiB RAM, 80 GiB SSD | **US$24/mes** o uso por segundo; impuestos/almacenamiento externo y otros servicios pueden sumar | Requiere cuenta, método de pago, seguridad de red, desactivación y control de cargos | Reserva para pruebas que requieran persistencia |
| **PC Windows del usuario** | 8 CPU, 7,68 GiB total, ~0,72 GiB libre en última captura | Sin alquiler adicional | No cumple los umbrales internos V81 y ya aloja BAZAR | **DESCARTADO COMO LABORATORIO ADICIONAL** |

Precio DigitalOcean verificado en: https://www.digitalocean.com/pricing/droplets. No se han solicitado ni contratado productos de proveedor alguno.

## 4. Aptitud del runner para las 32 verificaciones V67

### Candidatos para ejecutar primero en un runner, **solo después de autorización**
- `HTTP-01..14` (**14**): solicitudes reales al parser Node y reverse proxy **solo dentro del job aprobado**. Registrar HTTP y cierre de socket observados; no reclamar evidencia de un proxy inexistente.
- `LOAD-01..03` (**3**): carga pequeña, acotada y limitada a recursos del runner; detener si excede límites acordados. No saturar redes externas.
- `AUTH-01..03` (**3**): JWT y autorizaciones de **identidades de ensayo**; MFA real de prueba requiere proveedor/flujo aprobado, nunca simular un valor con la etiqueta “real”.
- `DATA-01..02` (**2**): RLS y transacciones en PostgreSQL 17 de servicio **recién creado y aislado**, con roles, bases y dos empresas ficticias, una vez aprobados permisos `database`, `sqlRead` y `tenantFixtures`.
- `REC-01..03` (**3**): únicamente un backup pequeño generado de una base **ficticia del mismo laboratorio** y restaurado a otra base de datos temporal aislada; no se conecta a otros proyectos.

Estos son **hasta 25 controles candidatos técnicos**, no 25 garantías de aprobación: para algunos puede ser necesaria configuración y prueba independiente de proxy/TLS, autenticación e infraestructura, y un revisor puede exigir un laboratorio persistente.

### Controles con revisión humana o infraestructura adicional
- `OBS-01..04` (**4**): políticas de registros, retención, alertas y correlación, con firmas/revisión humana, sin exponer datos privados.
- `REC-04` (**1**): tiempos RPO/RTO medidos e historial de retención y cifrado de respaldos; las métricas efímeras por sí solas no demuestran una política de recuperación persistente.
- `OPS-01..02` (**2**): aprobación por separado del alcance de red/TLS/puerto y del cambio productivo. Un job que “pasa” no concede permisos.

**TOTAL: 25 candidatos técnicos + 7 revisiones dependientes de política/infraestructura = 32 PENDING.** Ningún ID se marcará `PASS` solo por planificarse.

## 5. Condiciones concretas para un primer ensayo real

**NO ejecutar todavía.** Antes de autorizar un solo servicio o listener:

1. Aprobar por separado el **uso de un ejecutor efímero Ubuntu de GitHub** solo para MG WEB STUDIO CLOUD, confirmar límites del proyecto y aceptar que los resultados técnicos sin secretos estarán visibles en el repositorio público.
2. Aprobar independientemente **aprovisionar un PostgreSQL 17 desechable** y datos sintéticos de dos empresas; no utilizar la base de BAZAR-ONLINE ni Supabase.
3. Aprobar independientemente un **listener/puerto loopback** para pruebas HTTP dentro del runner. El hecho de ser local al runner no equivale a consentimiento de uso de red; no acceder a direcciones públicas o servicios reales ajenos.
4. Crear código de harness real con respuestas, auditoría de privilegios y evidencias sanitizadas, con modo **fail-closed**, tiempos de ejecución cortos y rutas sin referencias secretas. No incluir pruebas de carga de alto impacto.
5. Revisar presupuesto de disco y memoria **medidos en el runner real**. La reserva V81 de 20 GiB aplica a un laboratorio sobre el mismo volumen Windows y **no puede trasladarse mecánicamente a un job efímero de Linux con 14 GB de SSD**. Crear umbrales distintos, validados contra tamaño de fixtures y disco efectivo; abortar si insuficiente.
6. Capturar salida de pruebas y metadatos de ejecución (commit, herramienta, Node, PostgreSQL, timestamp UTC, estado) sin IP, tokens, URL con credenciales ni datos de usuarios. Revisar/anonimizar antes de cualquier subida de artefactos.
7. El hecho de ejecutarse no autoriza resultado `PASS`: aplicar los criterios V67 y un revisor independiente debe validar los elementos que pasen.

### Cuidado con la rama principal

La documentación oficial GitHub indica que un workflow con `workflow_dispatch` solo puede **recibir disparos manuales si el archivo existe en la rama predeterminada**. Como la rama predeterminada `main` no contiene los flujos de prueba, **no afirmar que basta con crear un workflow en la rama de desarrollo y pulsar Run workflow**. Incluir archivos de workflows en `main` necesitaría autorización de cambio de rama y revisar el sitio GitHub Pages para evitar publicación accidental.

**En su momento, una alternativa técnica a evaluar** es un flujo solo de rama de ensayo con trigger `push` muy restringido a un marcador de ejecución posterior a aprobación explícita. Ese mecanismo **no existe en V83** y nunca debe dispararse con cambios ordinarios del proyecto.

## 6. Alcance real del cambio V83

- Se registra **una decisión técnica recomendada**, no una aprobación del usuario para crear servicios, instancias, bases, puertos, identidades ni recursos remunerados.
- No se creó ni ejecutó workflow nuevo, job de PostgreSQL, container service, listener HTTP ni despliegue.
- No se modificaron V67, V78, V81, V82 ni sus pendientes y no se consumieron créditos Lovable.
- No se accedió a la base de BAZAR-ONLINE; no hubo operaciones Docker en el equipo del usuario.
- Todas las autorizaciones V78 permanecen `PENDING`. Estado operacional V67: **0/32 aprobadas; 32/32 pendientes**.
- El laboratorio seleccionado es por ahora **PROPUESTA PENDIENTE DE AUTORIZACIÓN**, `NO_GO` hasta que se autorice cada fase.

**Próxima decisión solicitada:** aprobar el **proveedor/entorno** GitHub Actions Ubuntu efímero, **sin** autorizar todavía crear PostgreSQL ni activar peticiones HTTP. Con esa aprobación limitada puede prepararse una ficha final de riesgos y recursos; después se solicitarán las autorizaciones para el servicio y las pruebas correspondientes.
