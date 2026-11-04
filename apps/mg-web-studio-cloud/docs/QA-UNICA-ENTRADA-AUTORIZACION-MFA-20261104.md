# MG Web Studio — única puerta de entrada a Supabase QA
**Paquete de revisión y autorización — 4 de noviembre de 2026, Ecuador**

**Objetivo:** completar la integración MFA real de MG Web Studio **sin más series de pruebas ficticias**. Este documento NO es un permiso, script listo para desplegar, firma de seguridad ni garantía de publicación. El [PR #7](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/pull/7) sigue en borrador. El dictamen de un revisor independiente (sin cuenta GitHub si lo prefiere) y la autorización concreta del dueño continúan pendientes.

## V132 — alternativa oficial en código para evitar el bloqueo RLS, sin cambios en QA

**Evidencias:** [V132 getClaims/getUser 12/12 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41849141865) · [V132→V130/V125/V119 PostgreSQL 17 32/32 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41849141097). [Informe técnico V132](V132-ALTERNATIVA-OFICIAL-AUTH-SIN-RLS-20261104.md).

Supabase recomienda `auth.getUser(jwt)` para una consulta actualizada al servidor Auth cuando importa detectar fin de sesión; `getClaims` solo verifica firma/vencimiento. **V132 pide ambas comprobaciones para cada operación sensible, liga sujeto y `session_id` al JWT firmado y rechaza errores de red, sesión ajena o respuesta revocada.** Un token `aal1` puede iniciar el desafío MFA; V127 todavía exige `aal2` firmado al confirmar.

**Decisión de diseño propuesta para QA:** sustituir la dependencia V122 de consulta directa a `auth.sessions` por V132. **No se requieren ni recomiendan nuevos GRANT, RLS policies, BYPASSRLS o `SECURITY DEFINER` sobre Auth administrado** para esta ruta. El componente antiguo V122 queda solo para análisis/CI; no desplegarlo como lector del esquema Auth.

**Límite crítico:** se han utilizado dobles de `getUser` y `getClaims`; el comportamiento con sesión realmente revocada **no se ha verificado en Supabase QA**. Entre la última respuesta Auth y `COMMIT` persiste una carrera. Por ello **el bloqueo P0 de acceso SQL queda mitigado a nivel de código, pero no se declara aprobado ni cerrado en QA**. Continúan requeridos dictamen DBA/Seguridad y autorización específica del propietario para una sola prueba real.

---

## Actualización V131 — esquemas QA separados sin ejecución SQL

Revisé y corregí la diferencia entre **roles QA** y **tablas del laboratorio** que todavía permanecía en V126/V128. Ahora el código usa consultas fijas destinadas a `mg_qa_mfa_receipts` y `mg_qa_mfa_challenges` solo cuando ambos roles de recibos son QA (y el journal tiene su rol QA); cualquier mezcla de roles se rechaza desde el constructor, antes de consultar o escribir. **No hay elección de esquema desde el cliente**.

**Resultado CI:** [30/30 integración PostgreSQL 17](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41841586814) + [27/27 configuración/journal](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41841586997), **57/57 PASS**. [Diseño SQL QA para revisión, sin autorización de ejecución](../proposals/V131-QA-PRIVADO-INSTALACION-REVISION-NO-EJECUTAR.md).

La revisión independiente debe incluir [la adenda de V131](REVISION-EXTERNA-DBA-SEGURIDAD-V130-20261104.md), el diff de código `f2b940c` y la corrección de prueba `06c61d5`. El documento V131 no es una migración, no define GRANT/policies definitivos y **nunca debe pegarse en SQL Editor sin aprobación DBA y del propietario**. Estado: preparación técnica con CI aprobado, permisos reales y rollback de QA **pendientes**.

---

## Solicitud de revisión independiente — paquete para entregar

**Versión de código congelada:** [`65fae5d236656fd578f13cfe6b9aac4ea7953b7b`](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/commit/65fae5d236656fd578f13cfe6b9aac4ea7953b7b). El resto de cambios documentales no reescribe esa evidencia; si se altera el código, el revisor deberá examinar el diff.

- [Expediente independiente DBA/Seguridad, controles A1–A6, B1–B5 y C1–C5](REVISION-EXTERNA-DBA-SEGURIDAD-V130-20261104.md).
- [Plantilla de dictamen externo SIN FIRMAR](DICTAMEN-EXTERNO-EN-BLANCO-V130-20261104.md).
- La persona revisora puede evaluar y firmar sin cuenta GitHub. **No se ha designado revisor, no hay dictamen ni aprobación**; solicitar revisión **no autoriza** instalar SQL o crear cuentas de prueba.

---

## Actualización V130 — V127 conectado a V126 en CI, Auth real pendiente

**Fecha:** 4 de noviembre de 2026. [Informe V130 y 30/30 PASS](V130-UNION-PRIVADA-MFA-RECIBO-PERSISTENTE-20261104.md).

Se corrigió a nivel de composición de backend el enlace que faltaba: **V127 → callback privado → V126 escritura de recibo duradero → lectura V125 → negocio ficticio V119**. La suite de PostgreSQL 17 descartable terminó [30/30 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41788585706), incluidos cinco casos nuevos de recibo, JWT inválido, rol equivocado, idempotencia y revocación. El escritor no se expone al navegador.

**Corrección de estado:** el bloqueo `BRIDGE_PERSIST` pasa de **abierto** a **parcialmente resuelto en código/CI**. En esta prueba las respuestas de `mfa.challenge/verify`, claims `aal2` y journal son simuladas; **no** acredita flujo real de Supabase Auth ni ejecución autorizada en QA. Sigue pendiente la revisión independiente, instalación de roles y respaldo/rollback real, ventana de carrera sesión–COMMIT y conservación de evidencias.

**Prioridad ahora:** revisión DBA/Seguridad del paquete completo para solicitar autorización específica de una sola intervención en QA. Evitar nuevas pruebas repetitivas de laboratorio.

---

## Actualización de revisión V129 — roles configurables y rollback protegido de laboratorio

**Fecha:** 4 de noviembre de 2026, Ecuador. No hay autorización para QA ni producción.

Los bloqueos del inventario inicial de esta página se han **reducido solo en código y ensayo desechable**:

- **Roles privados:** V122/V126/V128 aceptan, además de los roles CI, **nombres QA expresamente permitidos por código del servidor**, no nombres aportados por usuario. Antes de SELECT/INSERT cada conexión verifica su identidad física. Regresión confirmada: **81/81 pruebas PASS** entre V122, V126 y V128 (incluidas 9 nuevas comprobaciones contra roles privilegiados/alias arbitrarios). [V128 + mapeo 26/26](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41781887321), [V126 25/25](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41781887348) y [V122 18/18 + 12/12](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41781887179). **Los roles QA todavía no existen ni tienen grants autorizados.**
- **Rollback:** [contrato V129 de reversión de laboratorio](../proposals/v129-full-rollback-disposable-review-only.sql) abarca ledger, recibos MFA, journal y seis roles de **fixture**. [Ejecución CI verificada](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41782552742): (a) aborta si hay eventos persistidos; (b) aborta ante tabla extraña; (c) aborta cuando existe una vista de otro esquema que depende de la tabla; (d) revierte de forma completa los tres esquemas, tres tablas y seis roles **solamente si no hay evidencia ni dependencias**, conservando `auth` y `public`. El SQL **se niega a ejecutarse fuera de `qa_ledger` PG17**. No es un script aplicable a Supabase QA; deberá adaptarse a roles/tablas reales, respaldos y política de retención y recibir firma DBA/propietario.
- **El problema pendiente de mayor prioridad no es otra prueba sintética:** falta implementar/validar el flujo integrado contra **Auth real de Supabase QA**, conectar `persistVerifiedReceipt`, fijar el modelo de retención y obtener revisión externa/SQL aprobado antes de instalar cualquier objeto.

**Decisión vigente:** los dos bloqueos están **parcialmente resueltos a nivel de preparación**, no cerrados en QA. `V67=0/32 PASS`; `V95=69%` estimado / `31%` pendiente; PR #7 en borrador; producción `NO_GO`.

---

## Estado real contrastado en modo solo lectura

| Elemento | Resultado |
| --- | --- |
| Proyecto | `MG WEB STUDIO AUTH QA`, `tbfhiqkivsoeuudlpkgi` |
| PostgreSQL | `17.11.0.011`; `ACTIVE_HEALTHY` |
| Cuentas, sesiones, factores, desafíos Auth | `0 / 0 / 0 / 0` |
| Esquemas de ledger/journal de V110/V126/V128 | **No existen** |
| Roles CI de estas fases y escritor ledger | **No existen** |
| Advisor de seguridad Supabase | Sin avisos en la lectura; **no certifica** seguridad |
| Data API | Evidencia visual previa: `public` y `graphql_public` expuestos, autoexposición OFF (volver a comprobar antes de SQL) |
| Cambios realizados a QA en esta revisión | **Ninguno — solo SELECT** |

La ausencia de usuarios y objetos significa que **no se puede probar MFA real** sin crear un usuario TOTP autorizado y añadir componentes mínimos. Tampoco se debe reejecutar V107, que ya obtuvo PASS con limpieza confirmada.

## Qué está listo (y no debe repetirse)

- V127: puente para APIs oficiales `mfa.listFactors / challenge / verify` con registro privado de referencia y comprobación de JWT `aal2`. [18/18 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41775511115), **sin conexión real**.
- V128: journal privado con `claimPending` atómico, roles no administradores en PG17 temporal, y adaptador `auth.getClaims` con controles de `iss/aud/aal/exp`. [17/17 PASS](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41777740170), sin tokens reales.
- V125/V126: identidad MFA durable y prevención de doble consumo en laboratorio. El recorrido de negocio real y la revocación linealizable **no están certificados**.
- Matriz V95: **69% de cobertura técnica estimada / 31% pendiente**, sin reasignar etiquetas ni presentar este indicador como preparación de producción.
- V67: **0/32 controles formalmente aprobados**; producción **NO_GO**.

## Evaluación técnica previa — bloqueos concretos encontrados

1. **Nombres de roles de CI en código.** V122 espera `mg_v122_ci_auth_reader`, V126 `mg_v126_ci_issuer` y `mg_v126_ci_reader`, y V128 `mg_v128_ci_journal`. Son roles de un contenedor temporal, no identidades listas para QA. Un DBA debe aprobar principals privados nuevos, permisos exactos, mecanismo de inyección segura y tests de separación antes de instalar.
2. **El rollback V112 es incompleto para el paquete nuevo.** Revierte solo el ledger V110/V111; no contiene el journal V128 ni el almacén V126 ni el ciclo de vida de una cuenta TOTP. Se necesita un rollback único que **falle cerrado ante filas, objetos o dependencias inesperadas** y nunca borre datos ajenos.
3. **Falta conexión de los adaptadores.** `persistVerifiedReceipt` de V127 es una dependencia inyectada, **no** una escritura real al almacén V126. `getClaims` está validado contra un doble de pruebas, **no** ante un token firmado del proyecto. Las APIs reales deben usarse desde un Auth client ligado al usuario con sesión válida.
4. **Las transacciones no son globalmente atómicas.** Supabase `mfa.verify` y el journal/ledger están en servicios distintos; caída entre la verificación y el registro = resultado incierto. La política segura es fallar cerrado, no repetir el mismo desafío, pedir un MFA nuevo y recuperar mediante reconciliación auditada. Una revocación entre el último SELECT `auth.sessions` y `COMMIT` sigue siendo una carrera.
5. **Faltan retención y seguridad operacional.** Definir acceso, duración y limpieza de recibos, trazas sanitizadas, respaldo cifrado, alerta de abuso, límites de intentos, cierre de sesiones y responsable.
6. **Falta un revisor externo identificable.** Pasar CI no equivale a firmar V67. No es obligatorio abrir una segunda cuenta GitHub; puede revisar el expediente y firmar offline.

## Paquete único QA — alcance propuesto, NO autorizado todavía

**Punto de entrada:** permitir solo **un** cambio supervisado, limitado al proyecto `tbfhiqkivsoeuudlpkgi`, cuando exista dictamen DBA/Seguridad y aprobación separada del propietario.

| Orden | Qué se haría con autorización | Condición de aborto |
| --- | --- | --- |
| A. Revisar | Revisar DDL/grants de esquema privado, roles backend no-admin, SSL, API exposición, scripts y backup; confirmar que el esquema y roles siguen ausentes | Revisor no firma o aparece cualquier objeto incompatible |
| B. Instalar en QA | Implementar únicamente journal, almacén de recibos y permisos mínimos aprobados, sin tocar Auth existente ni `public`/Data API | Roles con BYPASSRLS/SELECT de secretos, default grants inesperados |
| C. Verificación Auth | Crear un usuario de prueba temporal explícitamente autorizado, completar un TOTP nuevo mediante API oficial, obtener JWT `aal2` verificado por `getClaims` y comprobar `auth.sessions` desde backend privado | Token distinto de sujeto/sesión, MFA dudoso, falta de TLS |
| D. Operación controlada | Una sola operación **ficticia y reversible** con doble consumo rechazado y revocación de sesión; registrar logs sin datos sensibles | Cualquier escritura inesperada, carrera o error de integridad |
| E. Limpieza y dictamen | Confirmar eliminación del usuario temporal, ausencia de sesiones/secretos residuales y rollback seguro o conservación auditada del ensayo según la aprobación | Filas ajenas, dependencia desconocida, backup no comprobado |

**Fuera de alcance:** producción, cobros, datos reales de clientes, Lovable, despliegue web, fusión del PR #7, activar API pública, cambiar políticas Auth, crear usuarios permanentes o ampliar permisos a `anon`/`authenticated`.

## Preflight reproducible — consultas que solo LEE el revisor

Estas consultas no deben cambiar nada. Deben revisarse las respuestas **el mismo día de una eventual ejecución**:

```sql
SELECT current_database() AS db, current_setting('server_version') AS version;
SELECT (SELECT count(*) FROM auth.users) AS users,
       (SELECT count(*) FROM auth.sessions) AS sessions,
       (SELECT count(*) FROM auth.mfa_factors) AS factors,
       (SELECT count(*) FROM auth.mfa_challenges) AS challenges;
SELECT nspname FROM pg_namespace
WHERE nspname IN ('mg_auth_ledger','mg_v126_fictional','mg_v128_fictional');
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
WHERE rolname IN ('mg_auth_ledger_writer','mg_v118_ci_backend',
                  'mg_v122_ci_auth_reader','mg_v126_ci_issuer',
                  'mg_v126_ci_reader','mg_v128_ci_journal');
```

La revisión de Data API exige además confirmar que el nuevo esquema privado **no** esté en `db-schemas`, que `anon/authenticated` no tengan `USAGE`, que no aparezca un `SECURITY DEFINER` expuesto, y que ninguna llave secreta llegue al navegador.

## Firmas y autorización pendientes (ninguna presumida)

| Firma / control | Estado |
| --- | --- |
| Revisor independiente humano | **PENDIENTE / SIN DESIGNAR** |
| DBA/Seguridad | **PENDIENTE** |
| Revisión de roles, SSL y RLS de QA | **PENDIENTE** |
| Plan de rollback unificado aprobado | **PENDIENTE** |
| Consentimiento explícito para **ese** DDL, usuario y ensayo QA | **NO OTORGADO** |
| Aprobación formal V67 | **0/32 PENDING** |
| GO de producción | **NO_GO** |

**Criterio de salida para pedir permiso QA:** un revisor externo confirma alcance técnico y rollback sobre archivos SHA conocidos, luego el propietario aprueba una sola intervención en la referencia QA exacta. Hasta entonces, **solo código, análisis y consultas read-only**.

> **Nota:** la barra `69%` no aumentará hasta que alguien reevalúe los controles V95 con evidencia aplicable y firme cambios de estado. No representa un calendario ni la proporción que falta para publicar.
