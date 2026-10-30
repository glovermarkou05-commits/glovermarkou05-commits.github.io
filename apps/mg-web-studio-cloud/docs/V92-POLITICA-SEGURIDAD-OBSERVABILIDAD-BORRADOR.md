# MG WEB STUDIO CLOUD — V92 | Política propuesta de observabilidad, privacidad y respuesta

**Fecha:** 29 de octubre de 2026 (Ecuador)  
**Rama:** `feature/mg-digital-v5-web-services`  
**Clasificación:** **BORRADOR / NO APROBADO / SIN CONFIGURACIÓN OPERATIVA**  
**Alcance autorizado:** documentación, pruebas offline y preparación de revisión independiente. No contiene permisos para conectar una plataforma de logs, almacenar eventos reales, activar alarmas, efectuar cambios en Supabase/BAZAR-ONLINE o publicar.

## 1. Situación real de la telemetría

El componente actual `server/request-budget-v66.cjs` emite, únicamente hacia un callback `observe`, objetos inmutables `{event, status, durationBucketMs}`. Valores válidos de `event`: `admitted`, `rate_limited`, `overloaded`, `peer_capacity`, `completed`, `transport_error`. Las duraciones usan exclusivamente `0, 10, 100, 1000, 10000` ms como categorías aproximadas; se prohíbe registrar tiempo exacto de cada usuario a partir de esta interfaz.

**Hechos confirmados del código:**
- El callback V66 predeterminado no guarda ni transmite eventos. **No existe un colector persistente ni un motor de alertas conectado**.
- V66 no transmite cuerpos, encabezados, rutas, tokens, SQL, identificadores personales ni IP al callback. El origen se usa **solo en memoria** para presupuestos por par de socket.
- V66 responde a algunos rechazos con `requestId: "unavailable"`; **no hay correlación segura de extremo a extremo para esos rechazos**.
- La prueba V87 utilizó HTTP real en loopback y V89 límites 429/503, pero esos registros de GitHub **no demuestran una política de observabilidad productiva**.
- Los logs de GitHub en un repositorio público deben tratarse como **potencialmente visibles por terceros**: nunca subir secretos, tokens reales, PII ni volcados de clientes.
- El nuevo módulo `server/v92-offline-observability-review.cjs` **solo acepta los tres campos anteriores, rechaza campos extra y cuenta hasta 256 observaciones en memoria**. No está integrado con servicios ni archivos y no crea alertas.

## 2. Datos permitidos, prohibidos y controles de minimización

| Categoría | Propuesta | Condición |
| --- | --- | --- |
| Evento agregado | Solo nombre cerrado V66, estado público y bucket de duración | Permitir solo tipos y valores documentados; rechazar datos malformados |
| Métrica del servicio | Conteo agregado de 200/401/403/404/429/503 por intervalo, si se implementa | Sin correlación con usuario/IP y sin emitir rutas privadas |
| Correlación entre capas | Identificador aleatorio opaco creado por servidor, sin datos recuperables | **Pendiente de diseño e implementación**, especialmente para rechazos V66 |
| Datos personales | **No recoger** nombres, teléfonos, correo, documento, IP, cookies o user ID | Prohibidos en la interfaz mínima; auditar otras fuentes antes de conectar un colector |
| Credenciales/datos sensibles | **No recoger** Authorization, JWT, contraseñas, claves, cuerpos, SQL, DSN, headers, query strings, stack traces completos | Fail-closed: rechazar eventos con campos adicionales; no guardarlos “para depurar” |
| Contenido de cliente | **No recoger** páginas, propuestas, archivos, contenido de sitios ni información comercial | Requerir nueva finalidad, revisión legal y autorización independiente para ampliar esquema |

**Limitación:** rechazar entradas en el nuevo filtro V92 no demuestra que todos los procesos, plataformas, dependencias o futuros logs del sistema respeten estas reglas. Eso requiere una revisión real del flujo de registros en un entorno autorizado.

## 3. Ciclo de vida y protección de registros — propuesta no aplicada

| Decisión pendiente | Propuesta inicial | Estado |
| --- | --- | --- |
| Propietario del dato y revisor de privacidad | Asignar responsables identificables, separados del autor | **SIN ASIGNAR** |
| Finalidad y fundamento jurídico | Registrar disponibilidad, rechazos y anomalías mínimas; revisión legal de Ecuador/mercados servidos | **SIN APROBACIÓN** |
| Ubicación del almacenamiento | Elegir región/proveedor tras evaluar acceso y normativa | **SIN SELECCIONAR** |
| Retención de agregados | **30 días propuestos**; revisar necesidad, contratos y excepciones | **NO CONFIGURADO** |
| Cifrado en tránsito y reposo | Requisito técnico antes de recolectar eventos | **NO VERIFICADO** |
| Acceso operativo | Roles mínimos, MFA en el sistema de logs, auditoría de accesos y revocación | **NO IMPLEMENTADO / NO VERIFICADO** |
| Borrado y retención excepcional | Definir proceso de eliminación demostrable y excepciones aprobadas | **NO CONFIGURADO** |
| Respaldo del colector | Evaluar solo si se aprueba almacenamiento; no duplicar registros sensibles | **NO CONFIGURADO** |

La retención de **30 días es una recomendación de planificación**, no un plazo legal determinado ni la configuración actual de ningún proveedor. El responsable de privacidad deberá aprobar su conveniencia antes de contratar o activar el almacenamiento.

## 4. Umbrales de alertas — modelos propuestos, no activados

| Regla | Condición propuesta | Severidad sugerida | Acción sugerida |
| --- | --- | --- | --- |
| A1 — errores del servidor | 5xx ≥ 5 % durante cinco minutos, con al menos 20 solicitudes | Alta | Verificar disponibilidad, cambios recientes y fallo del backend, sin revelar payloads |
| A2 — limitación de peticiones | 429 ≥ 10 % durante cinco minutos, con al menos 20 solicitudes | Media | Revisar tasa legítima, proxy/NAT y configuración antes de modificar límites |
| A3 — ausencia de métricas | No llegar métricas durante 10 minutos **mientras se confirma tráfico real** | Alta | Evaluar colector/servicio, evitar diagnosticar «sin tráfico» como caída |

**Ninguna regla está operativa.** Faltan dueño de guardia, destinatario, horario, canal, confirmación, ventana de respuesta, cadencia y prueba de entrega. Tampoco existe hoy un colector que calcule estas métricas.

### Procedimiento de incidentes (borrador)

1. **Detectar** señal sin registrar datos privados. Abrir una referencia opaca del incidente, registrar momento y severidad, y preservar pruebas técnicas permitidas.
2. **Validar** un posible falso positivo: estado de red, tasa general de errores, concurrencia, despliegues autorizados y dependencias.
3. **Asignar** responsable de guardia y responsable de seguridad; si están ausentes, el procedimiento **no puede declararse listo**.
4. **Contener** solo con facultades vigentes. Cualquier rollback, rotación de credenciales, cambio de firewall, restauración o suspensión de servicio requiere su propia autorización operativa.
5. **Comunicar y escalar** según contrato y obligaciones aplicables, sin copiar datos de clientes en GitHub Issues o logs públicos.
6. **Cerrar** con tiempo de detección/resolución, lecciones aprendidas, evidencia minimizada, revisión y aprobación firmada.

## 5. Dossier de revisión independiente — OBS-01..04

| Control V67 | Material existente | Brecha que impide aprobarlo |
| --- | --- | --- |
| **OBS-01** | Contrato de minimización V66, ejecuciones V87/V89 y nuevo filtro offline V92 | Revisar eventos reales del almacenamiento final y todas las fuentes; muestreo documentado y limpio |
| **OBS-02** | Respuestas sanitizadas V87/V89 | Implementar y verificar trazabilidad cruzada sin PII, especialmente `requestId: unavailable` en V66 |
| **OBS-03** | **Este borrador**, propuesta de retención, acceso y cifrado | Aprobar política, escoger proveedor, verificar cifrado/acceso/borrado con evidencia de configuración real |
| **OBS-04** | **Este borrador**, umbrales A1–A3 e instrucciones de incidentes | Definir responsables/escalación, aprobar umbrales y demostrar funcionamiento de alertas de prueba |

**Regla de separación de funciones:** un revisor **diferente del autor** debe cotejar enlaces originales de las ejecuciones, SHA de commits, evidencia protegida, alcance de la autorización y limitaciones. Un test automatizado **no** firma la política ni sustituye ese juicio.

**Acta:** `docs/V92-ACTA-REVISION-INDEPENDIENTE-PENDIENTE.md` (plantilla, sin firmas).  
**Estado estructurado:** `docs/V92-PAQUETE-REVISION-OBSERVABILIDAD.json` (4 controles como `DRAFT_UNREVIEWED`, responsables `UNASSIGNED`).  
**Evidencia de brechas:** `docs/V91-AUDITORIA-INTEGRAL-32-CONTROLES-V67.md` y `docs/V91-MATRIZ-COBERTURA-V67.json`.

## 6. Requisitos de autorización del siguiente paso

Esta V92 **no** instala ni inicia almacenamiento de logs, no asigna responsables inventados, no modifica código de producción para activar observación, no crea reglas de alerta en terceros, no toca `main` ni publica. Las 32 verificaciones del catálogo V67 permanecen `PENDING`.

Para habilitar observabilidad productiva, primero definir propietario y presupuesto, obtener aprobación de privacidad, seleccionar proveedor y ambiente de ensayo y aprobar separadamente su conexión y retención. Para permitir despliegue además hacen falta controles técnicos no cubiertos en V92, revisión independiente completa y autorización explícita del usuario.

**Dictamen documental V92: PAQUETE PREPARADO PARA REVISIÓN; POLÍTICAS Y ALERTAS NO APROBADAS. PUBLICACIÓN: NO_GO.**
