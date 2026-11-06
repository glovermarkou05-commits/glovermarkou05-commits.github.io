# V115 — Adaptador SQL mínimo para consumo único MFA (sin despliegue)

**Fecha de trabajo:** 2 de noviembre de 2026 (Ecuador). GitHub Actions informa horas UTC del 3 de noviembre.  
**Destino previsto:** MG WEB STUDIO AUTH QA; ningún acceso real implementado.  
**Estado:** `ADAPTER_OFFLINE_QA_PASS` — **no conectado a PostgreSQL ni Supabase, no aprobado para producción**.

## Implementación

`server/v115-insert-only-pg-adapter.cjs` implementa el contrato `consumeEventAtomically` de V109 mediante una **conexión PostgreSQL inyectada**. No importa `pg`, no obtiene contraseñas, no llama a Supabase, no genera SQL dinámico, no crea tablas ni ejecuta migraciones.

La conexión debe venir de un backend ya auditado que actúe con identidad `mg_auth_ledger_writer`. El adaptador exige que `SELECT current_user` devuelva ese rol antes de iniciar la operación. No intenta `SET ROLE`, no concede derechos y no habilita una cuenta de LOGIN: el rol `NOLOGIN` de V111 **todavía necesita un diseño de principal backend y autorización DBA**. Una consulta a `current_user` no sustituye una auditoría de credenciales del servidor.

El flujo es `BEGIN`, `INSERT` parametrizado con las tres columnas admitidas de V111 y `COMMIT`. No usa `SELECT` sobre tabla, `ON CONFLICT` o `RETURNING` y, por tanto, no necesita nuevos permisos sobre las filas del ledger. Si el índice único detecta duplicado, PostgreSQL genera **SQLSTATE 23505** y el adaptador deniega tras rollback.

**Seguridad del commit:**

- Se devuelve `committed:true` y `inserted:true` **exclusivamente cuando un comando `INSERT` confirmó una fila y el `COMMIT` fue reconocido**.
- Si la conexión se corta después de enviar `COMMIT`, el resultado se trata como **incierto**. Se devuelve rechazo, **no se reintenta automáticamente** y la conexión se descarta de la reserva para impedir reutilización de transacciones de estado desconocido.
- Si falla `BEGIN` o `INSERT`, se intenta `ROLLBACK`. Si el rollback no se confirma, se descarta también esa conexión.
- Una solicitud cancelada antes de confirmar el consumo se revierte cuando es posible.
- Se valida el hash hexadecimal, la retención y una ventana de verificación fija de **300 segundos**, que corresponde al contrato predeterminado de V109. Si alguien cambia la ventana de V109, el adaptador debe revisarse: la interpretación actual de `consumeUntilSec` presupone `verifiedAtSec + 310`.
- Un `COMMIT` reconocido **solo consume el evento MFA**; todavía no realiza la operación comercial.

## Validación CI

`tests/v115-insert-only-pg-adapter.test.cjs` y workflow
`.github/workflows/mg-web-studio-v115-insert-only-pg-adapter-offline.yml`:

**[GitHub Actions #41580831575](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41580831575): 22 PASS, 0 FAIL**, red bloqueada.

Cobertura: contrato parametrizado, conexión sin permisos, sesión de base con rol incorrecto, claves inválidas, vencimiento, cancelación, SQLSTATE 23505, excepción DB, resultado de inserción distinto de una fila, confirmación COMMIT perdida o malformada, inicio incierto, rollback fallido, cierre de conexión, y conexión con el contrato V109 sin elevar `productionAuthorized`.

Estas son **pruebas con objeto de conexión inyectado**, no una conexión real `pg` a Supabase. Las pruebas PG17 reales de V110/V111 demuestran la unicidad y el acceso restringido de la propuesta SQL, pero **no certifican este adaptador ejecutándose allí**.

## Riesgos y puertas restantes

1. **Fuente de sesión autoritativa**: falta conexión segura con estado vigente/revocación `auth.sessions`, sin habilitar permisos de acceso directo a clientes.
2. **Rol backend operativo**: V111 define un rol `NOLOGIN`; todavía no existe un principal de backend auditado ni pool seguro con permisos mínimos.
3. **Atomicidad empresarial**: si se confirma el consumo y luego falla una publicación, facturación o membresía, hace falta una **transacción de negocio conjunta** o un proceso idempotente recuperable. V115 no lo resuelve.
4. **Reloj y ventana**: la vigencia de V109 y del SQL debe gestionarse conjuntamente; no permitir cambios divergentes en ventana MFA ni claves HMAC compartidas por workers.
5. **Data API**: propietario desactivó autoexposición de tablas en UI y confirmó guardar; revalidar la configuración persistida antes de instalar SQL. Revisar aparte seis ACL por defecto de `public`, sin modificarlas por inercia.
6. **Revisión independiente**: PR #7 debe recibir una evaluación humana independiente y un dictamen DBA sobre propuestas V110/V111/V112 antes de cualquier instalación.
7. **Autorización limitada**: el propietario todavía no ha autorizado expresamente la creación de objetos SQL en Supabase QA. No inferir aprobación de mensajes generales como «avancemos».

**Decisión V115:** CI offline aprobado, integración real y DDL **NO ejecutados**; PR #7 draft y producción **NO_GO**. **V67: 32 PENDING / 0 PASS**.
