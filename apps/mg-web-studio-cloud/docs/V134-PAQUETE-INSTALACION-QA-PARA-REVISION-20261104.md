# V134 — instalación privada QA preparada para revisión, NO aprobada

## Resultado de validación del candidato V134 (CI y QA)

[GitHub Actions #41941820306](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41941820306) **PASS** el 4 de noviembre de 2026 (zona Ecuador), PostgreSQL 17 aislado. La primera ejecución detectó un defecto importante: `current_setting(...,true)` devolvía `NULL` cuando faltaban las aprobaciones; una comparación con `<>` no bloqueaba el `IF`. Se corrigió **antes de ejecutar cualquier cambio real**, usando `IS DISTINCT FROM` tanto en instalación como en rollback.

La ejecución final confirma explícitamente:

- `QA_MISSING_AND_WRONG_PROJECT_GUARDS_PASS`
- `QA_ROLE_NULL_PASSWORD_AND_FORCE_RLS_PASS`
- `QA_ROLLBACK_FILTERED_OWNER_RLS_DENIED_PASS`
- `QA_ROLLBACK_MISSING_APPROVAL_GUARD_PASS`
- `QA_ROLLBACK_PRESERVES_NONEMPTY_DATA_PASS`
- `QA_ROLLBACK_EMPTY_ONLY_REMOVES_ALL_PASS`

**Archivos congelados para revisión (Git blob SHA):**

- Instalación: `137526ce0ff22017414e142e7bbfba3123f4ca02`
- Rollback: `723957f2f94e91ac02c4e01850832fa3cf453be6`

La comprobación directa posterior al proyecto **QA auténtico** reportó **0 usuarios / 0 sesiones / 0 factores MFA / 0 desafíos MFA / 0 nuevos roles / 0 esquemas privados** y **0 avisos vigentes** en Supabase Security Advisor. No se autorizó ni ejecutó el SQL candidato en esa base.

**Precaución:** el bloqueo operacional por GUC es una defensa de proceso, no una prueba criptográfica del proyecto de destino. No sustituye verificar el ID del proyecto y la conexión en el panel y en el instrumento ejecutor. La instalación real y la habilitación de credenciales son dos intervenciones distintas; hasta la aprobación específica siguen pendientes.

---


**Fecha:** 4 de noviembre de 2026. **Proyecto autorizado para análisis:** MG WEB STUDIO AUTH QA (`tbfhiqkivsoeuudlpkgi`).

**Estado actual: `REVIEW_ONLY, NOT_INSTALLED`.** El usuario autorizó continuar desarrollo; no se presume de ello una aprobación de un SQL privilegiado con credenciales nuevas, cambios RLS o despliegue público. El PR #7 permanece DRAFT, V67 formal 0/32, producción NO_GO.

## Inventario verificado por lectura real

- Proyecto: `ACTIVE_HEALTHY`; DB PostgreSQL 17.11.
- Auth: 0 usuarios / 0 sesiones, tras limpieza V132.
- Esquemas `mg_qa_mfa_challenges` y `mg_qa_mfa_receipts`: ausentes; migraciones Supabase: 0.
- El flujo V133 no está instalado en QA. El hecho de que el contenedor PG17 haya aprobado 9 pruebas NO sustituye un test de Supabase real.

## Archivos propuestos

- [Instalación para revisar](../proposals/V134-QA-REVIEW-INSTALL-NO-SECRETS.sql). Crea dos esquemas privados, dos tablas, tres roles con `LOGIN PASSWORD NULL`, `FORCE RLS`, permisos por columna y políticas limitadas. **No incluye passwords, ni grants a `service_role`, ni cambios a `auth.sessions`.**
- [Rollback restringido para revisar](../proposals/V134-QA-REVIEW-ROLLBACK-EMPTY-ONLY.sql). Se niega a borrar datos, carece de `CASCADE`, requiere políticas de lectura para el administrador porque `FORCE RLS` también afecta a un propietario no superusuario.
- [Inventario de solo lectura](../qa/v134-qa-postinstall-readonly.sql).
- [Comparativo de laboratorio V133 aprobado](V133-PIPELINE-MFA-Y-ROLES-PRIVADOS-PG17-20261104.md).

## Controles para una futura intervención autorizada

1. Confirmar **URL exacta y proyecto** en Dashboard y con la administración de Supabase. La DB suele llamarse `postgres` tanto en QA como en producción: el nombre **no basta**.
2. Revisión de backup, retención de recibos/anti-replay, plan de recuperación y de exposición Data API: esquemas privados **fuera** de la lista de expuestos.
3. Firma de la revisión técnica del SQL, del diff, los permisos y el rollback; aprobación del propietario **sobre estos archivos exactos SHA** y con la referencia de proyecto.
4. La instalación está bloqueada con `current_setting('mg.qa_target_project_ref')` y `mg.qa_install_approved`. Estas variables son un **control operacional del operador, NO una prueba criptográfica de identidad de proyecto**; antes de ejecutarlas hay que verificar el host Supabase QA por fuera de SQL.
5. El paquete SQL contiene `CREATE ROLE ... LOGIN PASSWORD NULL`: las cuentas de backend quedan bloqueadas. Para activarlas posteriormente, usar un `psql` seguro, cifrado y con `\password nombre_rol` interactivamente; nunca registrar ni enviar las contraseñas por chat, GitHub, logs ni SQL Editor. Los tres secretos deben ser distintos y almacenados en un gestor de secretos del backend.
6. Evaluar `sslmode=verify-full` con cadena CA válida, roles con mínimos privilegios, límite de conexiones y ausencia de endpoints públicos; evitar el acceso al cluster sin TLS.
7. Tras instalación, comprobar RLS, funciones/roles/policies y trazas sin secretos. No crear usuario MFA ni ejecutar flujos reales hasta tener el servicio backend aislado operando correctamente.
8. Rollback de emergencia solo si no hay registros ni dependencias inesperadas y la retención está expresamente revisada. Si hay una fila, **no borrar**; preservar evidencia y preparar restauración.
9. Documentar el resultado con SHA de archivo y runbook, sin considerar CI como aprobación formal V67.

**Riesgos pendientes:** carrera Auth–COMMIT, interrupción entre `mfa.verify` y recibo DB, autenticación real AAL2, gestión de secretos, autorización empresarial por recurso, respaldo/retención y revisión formal.

### Próximo punto de aprobación

Cuando el archivo candidato y su rollback estén comprobados en PostgreSQL desechable, solicitar autorización **específica de instalación SQL en el proyecto QA exacto** y aprovisionamiento de credenciales aparte. Ni el permiso general de avanzar ni el resultado V132 permiten ejecutar directamente cambios privilegiados.
