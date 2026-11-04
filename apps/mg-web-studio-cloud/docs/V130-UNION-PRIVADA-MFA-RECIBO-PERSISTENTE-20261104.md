# MG Web Studio Cloud — V130: cierre del enlace privado MFA → recibo persistente

**Fecha:** 4 de noviembre de 2026 (Ecuador). **Ámbito:** PR #7, rama de revisión, **sin despliegue**.

**Ejecución final:** [GitHub Actions #41788585706](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41788585706), job `126436366265`, **30/30 PASS, 0 FAIL** sobre PostgreSQL 17 efímero.

## Bloqueo atendido

Antes de V130, el bridge V127 validaba una respuesta de `mfa.verify` y sus claims `aal2`, pero `persistVerifiedReceipt` era un callback sin conexión con el almacén V126. Esto impedía demostrar un flujo continuo.

**Implementación:** `server/v130-private-verified-mfa-composition.cjs` crea internamente:
1. Un bridge `createV127NativeMfaBridge` con su callback de persistencia **encapsulado**; no exporta `persistVerifiedReceipt` como método público.
2. Un store V126 lector con cuenta PostgreSQL de **solo lectura** de recibos.
3. Por cada recibo que V127 entrega **después** de `mfa.verify`, verificación JWT inyectada (`aal2`, sujeto, sesión, exp) y lectura de sesión primaria, un registro V126 bajo una cuenta **emisora separada** que valida físicamente el rol y exige ID de recibo estable, sujeto y sesión vinculados, timestamps recientes e inmutabilidad.
4. Lectura posterior de evento V125 y su uso por V119 para una operación de negocio **ficticia, transaccional e idempotente**, no una operación real.

**Principio clave:** el código V130 no acepta un recibo del navegador; el escritor solo existe dentro de la composición y recibe el objeto construido por V127 después de la verificación. Aun así, la fiabilidad de los adaptadores `auth`, `readActiveSession`, `verifySignedJwt` y el journal depende de **su configuración y autorización en el backend real**.

## Evidencia reproducible

El workflow V126 existente se extendió para ejecutar 5 pruebas nuevas de V130, además de sus 25 anteriores. Resultado final **30/30 PASS**:

| Control nuevo | Resultado |
| --- | --- |
| Desafío y verificación simulados con persistencia real en PostgreSQL 17 privado, evento de lectura recuperable | PASS |
| JWT `aal1` bloquea persistencia y la referencia ya reclamada no puede usarse otra vez | PASS |
| Cuenta de escritura con rol físico incorrecto deniega tras verificación simulada | PASS |
| Recibo persistido alimenta V125/V119: una sola operación ficticia y rechazo de replay | PASS |
| Sesión revocada después de desafío bloquea persistencia y operación | PASS |

La **primera ejecución** [#41788460765](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41788460765) terminó con fallo de **sintaxis en la nueva prueba antes de ejecutar los escenarios**. Se corrigió únicamente la agrupación de dos expresiones `async` de los fixtures; el componente de seguridad no fue modificado. [Segundo run aprobado #41788585706](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41788585706): **30/30 PASS**.

## Requisitos que NO cierra V130

- **Sin Auth real conectado.** Los métodos `mfa.listFactors`, `challenge`, `verify`, la validación del JWT y el journal en la nueva prueba V130 son sustitutos de laboratorio. El store V126 sí ejecuta sentencias sobre PostgreSQL 17 temporal.
- **No se ha desplegado un endpoint de aplicación.** No existe prueba de integración con la ruta real, navegador ni operaciones empresariales auténticas.
- **Sin atomicidad entre servicios.** Si Supabase Auth verifica un OTP y la escritura del recibo falla, no existe transacción conjunta. Se aplica fail-closed y un desafío nuevo; revisar recuperación y conciliación de resultados inciertos antes de QA.
- **Sin revocación linealizable garantizada.** Sigue existiendo una ventana entre el último SELECT de `auth.sessions` y COMMIT.
- **Falta revisión independiente de seguridad/DBA** de roles, TLS, credenciales, RLS, schemas, retención, recuperación y rollback **real de QA**. Los nombres de roles QA propuestos no están instalados.
- **No ejecutar código CI-only ni scripts V129 en Supabase QA.** V129 es un contrato de rollback para una base desechable `qa_ledger`.
- **No repetir V107**: la prueba TOTP QA real histórica ya fue completada y limpiada; el siguiente ensayo autorizado debe centrarse exclusivamente en el nuevo flujo de integración.

## Decisión

**Bloqueo `BRIDGE_PERSIST`: `PARTIAL_INTEGRATED_IN_LAB`.** Cerrado el enlace de código con escritura duradera real en **PG17 CI**, pero **no en Supabase Auth/QA**.

**Estado:** V95 **69% cobertura técnica estimada / 31% pendiente** hasta reclasificación respaldada; V67 **0/32 controles con PASS formal**; PR #7 abierto, en borrador, no fusionado; **producción NO_GO**.

**Próxima puerta concreta:** revisión independiente del expediente unificado, autorización **específica** del propietario de una única intervención en proyecto QA `tbfhiqkivsoeuudlpkgi` con roles/DDL/rollback aprobados, usuario TOTP temporal y limpieza. Sin esas aprobaciones, solo consultas de lectura y código de revisión.
