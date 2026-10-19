# MG WEB STUDIO CLOUD — V20 | Contratos canónicos de navegación y propuestas

**Fecha:** 19 de octubre de 2026  
**Rama:** \`feature/mg-digital-v5-web-services\`  
**Tipo de entrega:** diseño implementado en funciones JavaScript puras, un laboratorio y SQL de **solo comentarios**. No se ejecutó SQL, no existe autenticación ni sincronización reales y no se alteraron los SQL originales V1/V13.

## Decisiones propuestas para revisión

### 1. Página Inicio

El modelo recomendado es **slug guardado \`home\`** y **ruta visible \`/\`**. La API de migración futura deberá traducir los borradores antiguos que usaban \`slug=""\` a \`home\` antes de persistir. \`GET /home\` no debe crear un segundo contenido; por ahora el contrato V20 lo rechaza como ruta no canónica. El módulo solo acepta rutas de primer nivel, sin parámetros, fragmentos, URL encoding ni barras finales.

Se exige una sola página con slug \`home\` por sitio en el documento de diseño; una futura implementación SQL debe garantizar **al menos una página Home por sitio publicado** mediante un mecanismo transaccional o validación servidora revisada. \`unique(site_id,slug)\` protege la unicidad, **pero no garantiza por sí solo que exista una Home**.

Importante: el CHECK regex ya escrito en \`schema_core.review.sql\` **permite la cadena literal \`home\`**. El conflicto detectado por V19 no exige cambiar esa regex para aceptar \`home\`, sino actualizar el formato usado en el simulador, las reglas de publicación y la navegación.

### 2. Estados de propuesta

Se propone mantener una lista única de seis estados:

| Canónico | Estado histórico SQL | Uso |
|---|---|---|
| \`draft\` | \`draft\` | Borrador editable MG |
| \`submitted\` | \`submitted_for_review\` | Enviado al cliente |
| \`needs_changes\` | \`needs_changes\` | Cliente/editor solicita cambios |
| \`rejected\` | \`rejected\` | Cliente rechaza |
| \`approved\` | \`approved\` | Cliente aprueba |
| \`applied\` | \`applied_to_draft\` | Contenido aprobado se integra al borrador (NO publicación) |

El módulo \`shared/mg-contracts-v20.js\` incluye compatibilidad **solo de lectura** para las dos etiquetas históricas (las convierte a \`submitted\` y \`applied\`). Los SQL V13 mantienen sus etiquetas actuales; no se ha transformado ningún dato ni se ha cambiado su CHECK.

### 3. Transiciones simuladas y permisos

| Acción | Antes → después | Perfil ficticio |
|---|---|---|
| Crear | vacío → \`draft\` | SUPERADMIN con MFA |
| Enviar | \`draft\` → \`submitted\` | SUPERADMIN con MFA |
| Aprobar | \`submitted\` → \`approved\` | OWNER/ADMIN |
| Solicitar cambios | \`submitted\` → \`needs_changes\` | OWNER/ADMIN/EDITOR asignado al sitio |
| Rechazar | \`submitted\` → \`rejected\` | OWNER/ADMIN |
| Nueva revisión | \`needs_changes\` / \`rejected\` → \`draft\`, revisión +1 | SUPERADMIN con MFA |
| Aplicar | \`approved\` → \`applied\`, borrador +1 | OWNER/ADMIN/EDITOR asignado al sitio |

El simulador requiere versión de propuesta y, para aplicar, versión del borrador. Bloquea doble aprobación, reenvío obsoleto, notas insuficientes y edición en otro sitio. Los permisos se prueban con **identidades ficticias provistas por la propia página**, que cualquier usuario podría manipular. **No son controles de producción** ni sustituyen JWT, RLS, MFA real, auditoría ni operaciones ACID de PostgreSQL. La acción \`applied\` NO publica.

### 4. Requisitos SQL todavía pendientes

El archivo \`db/v20-contratos-propuestos.review.sql\` contiene **únicamente comentarios** que describen el destino previsto. No incluye ALTER TABLE, CREATE POLICY ni DDL ejecutable. Para elaborar futuras migraciones se deberá:

- Unificar el estado en el CHECK real y actualizar backend, eventos, auditoría, UI, historial, exportaciones y notificaciones.
- Determinar estrategia segura de transformación de valores heredados si existieran datos en un entorno futuro. Los SQL actuales no se han aplicado y **no hay datos que migrar confirmados**.
- Implementar versionado condicional e idempotencia/outbox en transacciones reales; verificar concurrencia y rollback.
- Auditar función \`mg_private.mg_can_access_site\`: \`SECURITY DEFINER\`, propietario, grants y roles; la RLS por sitio y empresa debe comprobarse con pruebas reales.
- Separar permisos \`GRANT\` de políticas RLS, nunca permitir que políticas antiguas amplias sobrevivan. Según [documentación de Supabase sobre RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), se requieren ambos controles y pruebas de base de datos para saber si las políticas se comportan como se espera.
- No crear ni ejecutar migraciones sin autorización independiente de proveedor, proyecto, región y presupuesto.

## Entregables

1. \`shared/mg-contracts-v20.js\`: normalización de slug/path, normalización de estados heredados, transiciones y permisos ficticios.
2. \`db/v20-contratos-propuestos.review.sql\`: propuesta conceptual con líneas comentadas. **NO EJECUTAR**.
3. \`tests/contracts-v20.test.cjs\`: casos de rutas, estados, duplicados y roles, incluidos rechazos.
4. \`laboratorio-contratos-v20.html\`: prueba visual en un navegador con datos ficticios, sin almacenamiento persistente.
5. \`tests/contracts-v20-ui.test.cjs\`: pruebas de interfaz en DOM simulado.
6. Enlaces al laboratorio desde SUPERADMIN y el portal del emprendedor.

## Estado y próximo paso

El trabajo V20 **resuelve a nivel de propuesta de contrato** cómo deberían funcionar Home y estados, **pero NO resuelve todavía los dos bloqueos V19 en los SQL originales ni realiza una migración**.

Tras aprobar el contrato funcional, la siguiente etapa debería preparar **un diff SQL de revisión coordinado** y una matriz de compatibilidad API ↔ esquema, sin ejecutar migraciones. Para instalar una base real se mantendrá la puerta NO GO de V17–V19 hasta tener permisos específicos.

**Restricciones conservadas:** \`main\` intacta; sin SQL ejecutado, sin Supabase modificado, sin producción, sin cobros, sin Lovable, sin APIs IA de pago y sin afectar otros proyectos.
