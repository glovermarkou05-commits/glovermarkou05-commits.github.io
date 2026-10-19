# MG WEB STUDIO CLOUD — V28 | Casos límite y matriz técnica para futuro backend

**Fecha:** 19 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Resultado:** **PASS en simulación JavaScript; NO GO para staging, SQL, servicios de pago y producción**.

## 1. Revisión previa

Se revisaron `shared/mg-proposal-flow-v27.js`, `shared/mg-contracts-v20.js`, `shared/mg-tenant-security-v23.js`, `shared/mg-audit-trail-v24.js`, `tests/proposal-flow-v27.test.cjs` y la matriz conceptual V13. No existían entregables V28 en la rama antes de esta etapa.

**Hallazgo V28:** la idempotencia del simulador V27 estaba indexada solo por `operationId` y su firma incorporaba `sessionId`. Esto podía causar colisiones entre actores/empresas y rechazar reintentos legítimos después de renovar la sesión. Se corrigió **solo la simulación V27**: ahora la clave interna es `organizationId + actorUserId + operationId`, y la firma exige misma acción, empresa, sitio, propuesta, revisión, evento y contenido pertinente, pero no identifica al actor por una sesión de duración limitada. La autorización V23 se recalcula antes de devolver un recibo repetido. **No se ha implementado idempotencia transaccional real.**

## 2. Entregables

- `shared/mg-proposal-flow-v27.js` (actualización puntual y compatible): aislamiento del identificador de idempotencia por empresa y actor.
- `shared/mg-fixture-boundaries-v28.js`: analizador puro de integridad de datos ficticios, claves de pertenencia, Home canónica, relaciones empresa/sitio/propuesta, sesiones, membresías, scopes y consistencia de auditoría. **No autoriza acciones**.
- `staging/v28-backend-rls-matrix.review.json`: matriz con **30 escenarios futuros**, sin instrucciones SQL ejecutables, sin claves ni credenciales, todos con `evidenceStatus=NOT_EXECUTED`. Las banderas de SQL, despliegue, publicación, cobros e IA paga permanecen desactivadas.
- `tests/edge-cases-v28.test.cjs`: pruebas de datos inválidos, cambio de sesión, colisión de identificadores, revocación y manipulación de la matriz de preparación.
- `QA-CASOS-LIMITE-BACKEND-V28.md`: este informe.

## 3. Cobertura nueva

| Área | Casos representativos y resultado |
|---|---|
| Idempotencia entre empresas | La misma clave de operación en otra organización no bloquea la operación ficticia |
| Idempotencia entre actores | Dos SUPERADMIN simulados no colisionan por usar la misma clave |
| Reintento tras renovar sesión | Permitido si corresponde al mismo actor y datos de operación y conserva permisos vigentes |
| Revocación de una sesión nueva | Se vuelve a evaluar el permiso y se deniega el reintento |
| Integridad de directorio | Se detectan empresas, sitios, sesiones, personal, membresías y scopes duplicados o mal relacionados |
| Integridad de propuestas | Se detectan propuestas con referencias entre empresas, estados desconocidos, revisiones inválidas y Home ausente/duplicada |
| Auditoría | Se detecta cadena de prueba inconsistente y se mantiene bloqueo NO GO |
| Manifiesto de futuras pruebas | Rechaza 30 casos incompletos, evidencia falsificada, permisos de gasto, despliegue, SQL o publicación añadidos |

**Limitación:** la identidad de la sesión es un parámetro del arnés de pruebas, no identidad autenticada. Todos los controles son heurísticos de simulación.

## 4. Matriz documental de backend / RLS — 30 escenarios NO ejecutados

**Flujo y estados:** 9 escenarios de creación, envío, cambios, revisión, aprobación, rechazo, aplicación, Home y revisiones obsoletas.

**Autorización y scopes:** 5 escenarios de aislamiento entre empresas, EDITOR por sitio, revocación, MFA y manipulación de parámetros.

**PostgreSQL y políticas RLS:** 4 escenarios de políticas, privilegios, SECURITY DEFINER/search_path y remoción de reglas permisivas heredadas.

**Transacciones y auditoría:** 6 escenarios de CAS, idempotencia persistente, atomicidad propuesta + outbox + auditoría, contaminación del historial por actores de otro tenant, datos sensibles y auditoría fuerte.

**Recuperación y operación:** 2 escenarios de backups/reversión y autorización de gasto/despliegue.

**Compatibilidad y QA:** 4 escenarios de Home/estados SQL, clientes API mixtos, navegador multidispositivo, antiabuso y accesibilidad operativa.

Todas las pruebas anteriores **siguen pendientes**, y no hay entornos ni cuentas de prueba reales creadas en esta etapa.

## 5. QA efectivamente ejecutado

Se recuperaron los archivos desde GitHub y se ejecutaron las suites con un arnés JavaScript aislado que sustituye `fs`, `path` y `assert`. **No se ejecutó Node en el dispositivo del usuario**, ni SQL, PostgreSQL, navegador, HTTP, migraciones o servicios conectados.

| Suite | Comprobaciones correctas |
|---|---:|
| V20 contratos | 114/114 |
| V21 compatibilidad | 25/25 |
| V22 simulación migraciones | 20/20 |
| V23 permisos | 81/81 |
| V24 auditoría | 70/70 |
| V25 integración | 91/91 |
| V26 criterios técnicos | 91/91 |
| V26 CLI solo lectura | 11/11 |
| V27 siete transiciones (regresión tras corrección) | 213/213 |
| **V28 casos límite nuevos** | **105/105** |
| **Total V20–V28 verificado en esta sesión** | **821/821** |

**No se probó toda la historia del proyecto**; el total 821 corresponde únicamente a las diez suites indicadas.

## 6. Riesgos abiertos: no confundir PASS con autorización

1. **Inconsistencia SQL/API heredada:** los estados y la Home del SQL V13 aún requieren una migración coordinada, con reversión y prueba real; los alias V20 no migran los datos.
2. **IDOR y manipulación de auditoría:** los eventos de intentos rechazados V27 usan identificadores solicitados por el llamador. Un actor no autorizado podría atribuir intentos a un tenant objetivo si se implementa ingenuamente. El backend debe generar un *security audit* confiable y separado, verificar pertenencia real del recurso antes de asociar eventos al historial visible por un cliente, aplicar límites por identidad/IP y evitar que un tercero contamine la auditoría ajena.
3. **Idempotencia real:** clave indexada por tenant + usuario autenticado + clave de operación; huella del payload canonizado, expiración y retención, respuestas repetidas y concurrencia **dentro de una transacción**. La corrección V28 es solo un `Map` en memoria.
4. **Sin persistencia ni garantías criptográficas:** la cadena V24 usa FNV-1a (checksum débil), no firmas ni log inmutable. No existe auditoría transaccional duradera.
5. **Seguridad real:** pendiente backend de identidades, tokens verificados, MFA, RLS, GRANT, SECURITY DEFINER, revocación de sesiones, storage y pruebas Postgres multiempresa.
6. **Sin pruebas ACID, backup ni navegador:** los 30 escenarios están etiquetados `NOT_EXECUTED`, no hay base aislada autorizada, datos reales o pruebas de recuperación.
7. **V26 mantiene NO GO** y las 16 precondiciones V18 pendientes; ningún documento o resultado ficticio puede cambiarlas.

## 7. Próxima etapa sugerida

**V29 — Diseño de contratos de persistencia transaccional y seguridad de endpoints, solamente para revisión.** Preparar un esquema lógico de comandos/respuestas, límites de confianza, idempotencia y outbox, trazabilidad separada de errores de autorización, sin crear tablas ejecutables ni conectar servicios.

## 8. Repetición local opcional

```powershell
node apps/mg-web-studio-cloud/tests/edge-cases-v28.test.cjs
node apps/mg-web-studio-cloud/tests/proposal-flow-v27.test.cjs
node apps/mg-web-studio-cloud/staging/v26-preflight.cjs
```

El preflight V26 devuelve código 2 deliberadamente cuando el inventario está bien formado pero el dictamen sigue siendo NO GO. No se cambió el manifiesto V18.

**Restricciones conservadas:** no usar créditos Lovable, no ejecutar SQL, no tocar Supabase, no modificar `main`, no publicar, no activar IA paga, cobros o nuevos servicios, ni modificar otros proyectos.
