# MG Web Studio Cloud — V95 | Entrega para revisión independiente V67

**Fecha:** 2 de noviembre de 2026, Ecuador.  
**Alcance:** auditoría de evidencias y entrega a revisión; **sin conexión a bases**, SQL nuevo, despliegue, migraciones, cambios en `main` ni alteraciones de productos.

## Dictamen

- Los **32 casos canónicos V67 continúan `PENDING`**, con **0 `PASS`**; los expedientes V67 y V93 siguen sin firmas y no se modificaron.
- **15** casos cuentan con observación de laboratorio relacionada, **14** tienen evidencia parcial y **3** aún no tienen el ensayo o acto exigido.
- La variación frente a V91 es exclusivamente **REC-03**, reclasificado de `NOT_EXERCISED` a **`LAB_OBSERVED`**, porque V94B ejecutó 56/56 aserciones V53 sobre PostgreSQL 17 restaurado.
- **REC-02** permanece `PARTIAL` por la falta de evidencia de la historia completa de migraciones, la integración real de Auth/Supabase y la revisión independiente, aunque V94B restauró el esquema histórico MG V45 (16 tablas).
- Los **3 casos aún `NOT_EXERCISED`** son: `OBS-03` (cifrado, retención, borrado de logs y responsable), `OBS-04` (incidentes, alertas, responsables y ensayo), `OPS-02` (aprobación independiente, plan de cambio y rollback para producción).
- Las **15 observaciones de laboratorio NO son 15 aprobaciones formales** ni justifican producción. `NO_GO` permanece.

## Evidencia técnica reutilizada, sin repetir pruebas

| Entregable | Evidencia / alcance | Límite |
| --- | --- | --- |
| [Run V94B #41387289030](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41387289030) | GitHub Actions `success`, PG 17.11, 17/17 guardas, 56/56 pgTAP, 16 tablas, 12 políticas, 11 índices, backup/restauración y limpieza 2/2 | Auth es ficticio, no es Supabase real; no demuestra RPO/RTO |
| `docs/V94B-RESULTADO-ENSAYO-PG17-MG-COMPLETO-20261101.md` | Informe técnico con SHA fuente y snapshot, incidencias corregidas y limpieza | Informe elaborado por el ejecutor, no verificado por revisor externo |
| `docs/V91-MATRIZ-COBERTURA-V67.json` | Baseline 14 observados / 14 parciales / 4 sin ensayo | Estado anterior a V94B; conservar para trazabilidad |
| `docs/V93-PAQUETE-REVISION-INDEPENDIENTE.json` | Los 32 IDs V67, bloques y requisitos de revisor | Revisor sin asignar, estados `NOT_REVIEWED` |
| `docs/V92-PAQUETE-REVISION-OBSERVABILIDAD.json` | Propuesta de logs minimizados y alertas | Retención/cifrado/alertas no configurados ni aprobados |
| `docs/V95-TRAZABILIDAD-32-CONTROLES-V94B.json` | Matriz actualizada por caso con evidencia real V94B y límites | Ningún `PASS`, firma ni cambio de permisos |

## Controles agrupados para la revisión

| Área | IDs | Trabajo independiente pendiente |
| --- | --- | --- |
| HTTP | HTTP-01..14 | Revisar V87 y distinguir 06/10/14 que requieren proxy/TLS real |
| Carga | LOAD-01..03 | Verificar V89; LOAD-03 no demuestra SQL/carga sostenida |
| Observabilidad | OBS-01..04 | OBS-03/04 requieren operación real y aprobación de responsables |
| Identidad | AUTH-01..03 | Firmas ES256 sintéticas no equivalen a MFA/ proveedor real; no usar claims de `raw_user_meta_data` para autorización |
| Datos | DATA-01..02 | Asegurar catálogo real de grants, `BYPASSRLS`, `PUBLIC EXECUTE`, `SECURITY DEFINER` y cancelación SQL |
| Recuperación | REC-01..04 | REC-03 obtuvo evidencia V94B, REC-02 parcial, REC-04 falta cifrado/retención/RPO/RTO |
| Operaciones | OPS-01..02 | Permiso de ensayo ≠ autorización de deploy. OPS-02 sin aprobación |

## Hallazgos de seguridad adicionales sin intervención en producción

1. **Cadena de suministro V94B:** `actions/checkout@v4` y `actions/setup-node@v4` están referenciadas por etiquetas, no por SHA de commit inmutable. Requiere fijar hashes verificados y validación offline; **no modificar el workflow V94B ahora**, pues podría provocar una restauración nueva innecesaria.
2. **Docker:** `FROM postgres:17.11-bookworm` es una etiqueta, y `apt-get install postgresql-17-pgtap` resuelve paquetes dinámicamente. La imagen final se registró por Image ID del runner, pero no constituye una cadena de suministro reproducible aprobada. Requiere digest y snapshot/package checksum verificados.
3. **Auth:** `auth.users`, `auth.uid()` y roles se implementaron con una simulación en laboratorio. No trasladar esos scripts a Supabase remoto ni usar sus resultados como prueba de MFA real.
4. **Privacidad de registros:** V92 documenta un horizonte de retención **propuesto**, no implementado; no fijar plazos operativos ni afirmaciones legales sin aprobación del responsable.

## Protocolo de revisión independiente

El revisor debe ser una persona distinta de quien desarrolló/ejecutó V94B. **No está designado.** Para cada control, deberá:

1. Verificar el ID, el requisito formal V67, la clase técnica y sus evidencias V85–V94B en los enlaces correctos.
2. Comparar SHA/versión de código, run ID/job ID y logs sanitizados del job; confirmar la limpieza, sin solicitar dumps con datos sensibles.
3. Registrar el *alcance* de la evidencia (laboratorio sintético o entorno final), la diferencia contra criterio formal, el riesgo residual y los requisitos adicionales.
4. Emitir dictamen escrito firmado o registrar `NEEDS_MORE_EVIDENCE`, sin alterar estados por inferencia ni usar una firma generada automáticamente.
5. Mantener `productionAuthorized=false` y el PR en borrador hasta una decisión separada del propietario y responsable de seguridad.

### Orden para cerrar bloqueos sin duplicar trabajo

**Primero:** asignar revisor y revisar V94B/REC-02/03, V87/V89 y V92.  
**Después:** acordar responsable de logs/alertas (OBS-03/04), identidad/MFA reales (AUTH), cancelación SQL (DATA-02) y proxy/TLS (HTTP).  
**Por último:** revisar REC-04 RPO/RTO y OPS-02 publicación con rollback. Cualquier prueba real adicional requiere alcance y autorización diferenciados.

**Esta entrega no contiene aprobación, firma, ejecución SQL o publicación.**
