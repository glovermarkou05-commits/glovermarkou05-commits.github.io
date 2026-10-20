# MG WEB STUDIO CLOUD — V39 | Auditoría inicial de solo lectura del STAGING

**Fecha de inspección:** 19 de octubre de 2026  
**Rama de control:** `feature/mg-digital-v5-web-services`  
**Entorno:** `MG WEB STUDIO CLOUD - STAGING` — proyecto aislado creado bajo autorización específica.  
**Estado de Supabase:** `ACTIVE_HEALTHY` · Región `sa-east-1` (São Paulo) · PostgreSQL 17  
**Dictamen:** **STAGING CREADO / APLICACIÓN NO INSTALADA / NO GO para SQL, despliegue y producción**.

## 1. Evidencia real de metadatos consultada

Esta etapa no se basa solamente en simulaciones. Se ejecutaron operaciones **de lectura** contra el proyecto de Supabase creado previamente:

| Fuente consultada | Resultado devuelto |
|---|---|
| Detalles del proyecto | `ACTIVE_HEALTHY`, São Paulo, motor PostgreSQL 17 |
| Tablas de `public` (solo metadatos) | **0** |
| Lista de migraciones registradas | **0** |
| Edge Functions desplegadas | **0** |
| Ramas de base de datos | **0** |
| Advisor de seguridad | **0** avisos devueltos |
| Advisor de rendimiento | **0** avisos devueltos |
| Catálogo de extensiones | Metadatos obtenidos; hay extensiones predeterminadas, pero no se activó ninguna adicional |

**Precisión importante:** `0` avisos de los asesores **NO significa que un sistema esté seguro**. Al no haber tablas de la aplicación en `public`, no existe aún una superficie de aplicación para demostrar RLS, permisos de escritura, aislamiento de organizaciones ni transacciones reales. No se inspeccionó el contenido de Auth, datos privados ni secretos.

Esta inspección tampoco certifica que todos los esquemas posibles estén vacíos: la consulta de tablas se delimitó al esquema `public`, y la lista de migraciones era la registrada por la plataforma.

## 2. Lo que sigue sin autorización ni pruebas

- No se han aplicado esquemas de `db/schema_core.review.sql`, V13, V20, V34–V36, ni migraciones de MG WEB STUDIO CLOUD.
- Identidades Auth/MFA, roles, políticas RLS, grants, funciones `SECURITY DEFINER`, CAS, idempotencia y outbox no han sido ensayados en PostgreSQL.
- No se ejecutó consulta SQL mediante `execute_sql` ni aplicación de migraciones con `apply_migration`.
- No se conectaron claves ni endpoints del proyecto a clientes o prototipos, ni se desplegaron Edge Functions.
- No se ejecutaron backups/restauración ni pruebas de concurrencia, errores y aislamiento.
- No se habilitaron mensajes, cobros, cron, IA de pago ni producción.
- No se modificaron otros proyectos, incluida su configuración o datos.

**Alcance exacto de la autorización recibida:** crear el proyecto Free en São Paulo y después inspeccionar sus metadatos **en solo lectura**. Esa autorización no incluye ejecutar SQL o desplegar servicios.

## 3. Plan recomendado para pasar a validación real

**Paso A — Preparar un cambio concreto y revisable en GitHub (sin SQL ejecutado).** Definir el conjunto mínimo inicial de esquemas y migraciones para STAGING, con comprobaciones de seguridad/RLS, control de estados V13/V20 y Home; excluir explícitamente el script histórico `db/v13-endurecimiento-rls-legado.review.sql`, identificado como portador de SQL activo pese a su etiqueta `review.sql`.

**Paso B — Definir backup/restore para datos exclusivamente sintéticos.** En el plan Free no deben suponerse backups automáticos. Acordar quién verifica los respaldos y qué cambios se revierten si una prueba falla.

**Paso C — Solicitar aprobación separada para SQL real en este proyecto exclusivo.** Solo después de aprobar el SQL específico y el procedimiento de reversión se podrá ejecutar una migración en STAGING y comprobar RLS, scopes y concurrencia. La creación de un proyecto no equivale a autorizar consultas SQL.

**Paso D — Aprobación independiente para backend/funciones de ensayo.** Implementar identidad real, atomicidad propuesta+auditoría+outbox y workers bajo límites de recursos, después del QA de base. No se publica ni se activan proveedores externos.

**Paso E — QA y decisión de producción independientes.** Probar sesiones, MFA, RLS real, comportamiento multiempresa, ausencia/duplicados Home, conversión de estados, backups y restauración, fallos combinados. Ningún `PASS` estático o asesor sin avisos reemplaza esas pruebas.

## 4. Archivos y privacidad

Se registró evidencia estructurada sin publicar el identificador real del proyecto ni URLs de conexión en el repositorio:

- `staging/v39-initial-readonly-inventory.review.json` — inventario de resultados reales, incertidumbres y permisos pendientes.
- `QA-STAGING-BASELINE-READONLY-V39.md` — este informe.

El identificador de proyecto puede consultarse en la interfaz privada de Supabase; no es necesario guardarlo en el repositorio público. Ningún token, clave de servicio o nombre de usuario fue copiado al informe.

**Restricciones conservadas:** `main` intacta, Lovable sin uso, cero SQL ejecutado, sin despliegues, datos sintéticos como única política, sin gasto adicional deliberado ni modificación de productos ajenos.

**Siguiente punto de decisión:** aprobar únicamente la preparación del paquete SQL ejecutable **para revisión en GitHub**, o bien revisar y aprobar un conjunto concreto de sentencias antes de probarlas en STAGING. Hasta entonces: **NO GO** para ejecución real.
