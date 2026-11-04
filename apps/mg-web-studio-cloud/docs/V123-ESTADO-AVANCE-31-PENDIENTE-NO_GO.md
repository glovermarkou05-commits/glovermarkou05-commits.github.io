# MG WEB STUDIO — tablero de avance V123 (estimación técnica)

**Fecha:** 3 de noviembre de 2026, Ecuador. **Fuente:** V95, matriz de 32 controles, publicada 2026-11-02. Este documento **no es una certificación** ni un permiso de lanzamiento.

## Barra de avance de la cobertura técnica estimada

**69% completado / 31% pendiente (estimación)**

`[██████████████░░░░░░]` **69%**

Cálculo transparente, sin inflar resultados: **(15 observados × 1 + 14 parciales × 0,5 + 3 no ensayados × 0) / 32 × 100 = 68,75%, redondeado a 69%.** No es un porcentaje universal del proyecto ni un plazo de finalización. Los ensayos V116–V122 no se convierten automáticamente en cobertura V67 hasta reconciliarse y revisarse.

**Aprobación formal V67: 0/32 (0%).** El estado de producción **es NO_GO**. La barra es una ayuda de seguimiento del trabajo técnico, **no** indica que falte «31% para publicar».

## Controles del baseline

| Cobertura V95 | Número | Interpretación |
| --- | ---: | --- |
| LAB_OBSERVED | 15 | Evidencia de laboratorio; falta firma y validación en entorno aplicable |
| PARTIAL | 14 | Evidencia parcial; quedan pruebas o decisiones adicionales |
| NOT_EXERCISED | 3 | Ensayo o decisión todavía inexistente |
| Formalmente aprobado | **0/32** | Ningún control tiene aprobación independiente |

Sin ensayo en V95: **OBS-03** (retención y seguridad de registros), **OBS-04** (incidentes/alertas y responsables), **OPS-02** (aprobación de producción y rollback).

## Bloqueos reales para finalizar y publicar

1. **Revisión independiente humana**: ninguna persona designada. Puede realizarse sin una segunda cuenta GitHub, mediante expediente y dictamen externo firmado.
2. **Autorización específica para QA**: las propuestas V110/V111/V112 siguen en revisión; no hay permiso para aplicar DDL en MG WEB STUDIO AUTH QA.
3. **Políticas de sesiones Auth — revisión visual recibida, origen no autenticado de forma independiente**: el usuario compartió tres capturas del Dashboard con sesión única desactivada, duración máxima 0 (sin límite), inactividad 0 (sin límite), access-token expiry 3600 segundos, detección de refresh tokens comprometidos activada y reuse interval 10 segundos. Las capturas no muestran la referencia del proyecto ni garantizan que no haya cambios posteriores. **Ya no falta solicitar esas pantallas**, pero siguen pendientes la confirmación independiente del contexto del proyecto, la revisión DBA/Seguridad, una prueba real de revocación y la aprobación de acceso restringido a Auth. La conexión a Supabase real todavía NO está aprobada.
4. **Integración real de MFA y acciones empresariales**: V121 y V122 utilizan proveedores confiables inyectados y V119 opera sobre un negocio ficticio en PG17. Faltan arquitectura, pruebas y validación en entorno autorizado.
5. **Los 32 controles formales V67**: registrar evidencia válida por control, dictamen firmado independiente, cierre de observabilidad/operaciones/backup y autorización separada para producción.

## Evidencia nueva de interfaz — Supabase Auth (capturas del usuario)

**Fecha de recepción:** 3 de noviembre de 2026, Ecuador. **Procedencia:** tres capturas compartidas por el usuario después de seguir el enlace al Dashboard Auth Sessions. **Tipo:** evidencia de valores visibles, no una consulta autenticada a configuración Auth vía API. Las imágenes están recortadas y **no muestran la referencia del proyecto**, por lo que no se debe afirmar verificación independiente del ID.

| Configuración observada | Valor |
| --- | --- |
| Enforce single session per user | Desactivado |
| Time-box user sessions | `0` / never |
| Inactivity timeout | `0` / never |
| Access token expiry time | `3600` segundos (1 hora) |
| Detect and revoke potentially compromised refresh tokens | Activado |
| Refresh token reuse interval | `10` segundos |
| Acceso a edición de políticas de sesión | Dashboard muestra opción **Upgrade to Pro**, con ajustes de sesiones no disponibles para modificar desde esa pantalla |

**Conclusión:** estos valores visibles son compatibles con el **escenario de laboratorio sin políticas extra de duración/inactividad/sesión única**, previsto en V122. Eso **no** equivale a autorizar usar `auth.sessions` en QA: hay que validar el principal privado, que el token sea realmente verificado y la revocación en entorno autorizado. Tampoco representa garantía de revocación inmediata entre el último SELECT y el COMMIT. **No se modificaron los ajustes.**

**Actualización de la barra:** se mantiene **69% técnico estimado / 31% pendiente** hasta que exista una matriz V95 revisada con nuevas evidencias; aprobación V67 continúa **0/32 (0%)**, producción **NO_GO**.

## Evidencia visual de Data API — comprobación de esquemas y permisos (2026-11-03 Ecuador)

El usuario compartió capturas del panel **API de datos → Ajustes**. Después envió una captura **con el selector desplegado**, que identifica los dos esquemas efectivamente elegidos para la API. Una consulta separada de solo lectura al catálogo PostgreSQL del proyecto QA `tbfhiqkivsoeuudlpkgi` confirmó sus nombres reales.

| Comprobación | Observación | Procedencia |
| --- | --- | --- |
| Esquemas expuestos | `graphql_public` y `public` (traducción visual «graphql_público», «público») | Selector mostrado por usuario + `pg_namespace` |
| Esquema `auth` en Data API | **No seleccionado** | Captura del selector (aunque existe en catálogo) |
| Esquema `mg_auth_ledger` | **No seleccionado y ausente en catálogo** | Captura + `pg_namespace` |
| Exponer automáticamente nuevas tablas | **Desactivado (OFF)** | Captura anterior del usuario |
| Tablas / funciones seleccionables | Controles muestran «No tables available» / «No functions available» | Captura anterior, instante observado |
| Ruta de búsqueda adicional | `public` y `extensions` | Captura (no confundir con lista de esquemas expuestos) |
| Máximo de filas | `1000` | Captura |
| Pool de Data API | Configurado automáticamente | Captura |
| Roles `anon`, `authenticated` y `service_role` frente a `auth.sessions` | `has_table_privilege(...,'SELECT'/'INSERT'/'UPDATE')=false` para los 3 roles | Consulta SQL de **solo lectura** a permisos efectivos |
| `USAGE` de esos roles en esquema `auth` | `true` para los 3, `CREATE=false` | Catálogo PostgreSQL; **USAGE no equivale a exposición Data API ni permiso SELECT sobre la tabla** |

**Conclusión puntual:** la combinación de esquemas observada no expone `auth` a través de la configuración Data API; los roles de API citados no tienen `SELECT` directo sobre `auth.sessions` según el catálogo del momento. **No** afirmar aislamiento futuro de cualquier nueva tabla ni seguridad integral de RLS/grants. Antes de crear `mg_auth_ledger`, un revisor DBA/Seguridad debe confirmar el aislamiento y permisos finales. **No se realizaron escrituras ni se pulsó Guardar.**

**Próximo bloqueo real:** no hacen falta más capturas de este selector. Continúan pendientes dictamen independiente de seguridad, principal backend privado y configuración TLS, autorización explícita solo QA para DDL y comprobación real del flujo MFA/revocación.

**Barra:** mantiene **69% avance técnico estimado / 31% pendiente** por baseline V95 sin reetiquetar controles. **V67 0/32 aprobados; producción NO_GO; PR #7 en borrador**.

## Evidencias técnicas comprobadas anteriormente

- [V116: 11/11 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41584359140)
- [V117: 13/13 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41584359086)
- [V118: 15/15 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41759192024)
- [V119 + V121: 20/20 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41763003960)
- [V121: 18/18 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41762848292)
- [V122: 30/30 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41765139754)
- [V124: 17/17 PASS — MFA→Auth→negocio ficticio PG17](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41768590732). La primera ejecución falló por contaminación entre escenarios y se corrigió únicamente el aislamiento de fixtures antes de la ejecución aprobada; [informe V124](V124-INTEGRACION-MFA-AUTH-NEGOCIO-PG17-20261103.md).

**Todas estas aprobaciones son de pruebas técnicas**, no de los 32 controles canónicos V67.

## Estado de las autorizaciones

- PR #7 abierto y en borrador; **NO MERGE**.
- Supabase QA sin cambios DDL autorizados, sin rol lector V122 implantado.
- Sin acceso de clientes a `auth.sessions`, sin claves de producción ni publicación.
- Autoridad humana y owner QA pendientes.
- **Producción: NO_GO**.

El script `qa/v123-release-progress.cjs` recalcula el estado desde fuentes canónicas de solo lectura y rechaza falsificaciones de aprobación formal. El estado de Auth Sessions debe verificarse mediante el [Dashboard Auth Sessions de QA](https://supabase.com/dashboard/project/tbfhiqkivsoeuudlpkgi/auth/sessions) con acceso autorizado y sin exponer claves.
