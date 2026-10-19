# MG WEB STUDIO CLOUD — V37 | QA de preparación para staging aislado

**Fecha:** 19 de octubre de 2026  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Decisión:** **PASS de documentos y simulación; NOT_AUTHORIZED / NO GO** para staging, SQL y producción.

## 1. Alcance

Consolidar en una solicitud de autorización legible para el propietario los bloqueos V18, V33 y V36. V37 **no crea otro sistema de backend ni simula que haya un entorno real**. Distingue controles **anteriores** a la aprobación de pruebas que solo pueden hacerse **después** de obtener permiso y configurar un ambiente segregado.

Se inspeccionaron en GitHub:
- `staging/v18-manifest.review.json` (16 controles `pending`, autorización `granted:false`).
- `staging/v33-master-roadmap.review.json` (G01 pendiente, producción requiere autorización separada).
- `staging/v36-coordinated-changes.review.json` (ocho fases bloqueadas, migraciones sin ejecutar).
- `db/v13-endurecimiento-rls-legado.review.sql` (sentencias SQL activas históricas, material en cuarentena documental).

No se alteraron archivos históricos, datos, bases de datos, prototipos funcionales o proyectos ajenos.

## 2. Entregables

| Archivo | Descripción |
|---|---|
| `staging/v37-authorization-packet.review.json` | Solicitud no aprobada con nueve preguntas abiertas, cinco precondiciones, once pruebas técnicas posteriores, siete riesgos y alcance de acciones expresamente bloqueadas |
| `staging/v37-authorization-preflight.cjs` | Lector estático de los manifiestos fuente que rechaza permisos falsos, riesgo oculto, datos reales, presupuestos supuestos, pruebas inventadas y opciones de ejecución habilitadas |
| `tests/staging-authorization-v37.test.cjs` | Suite de casos correctos, alteraciones deliberadas de seguridad y confirmación de NO GO |
| `SOLICITUD-STAGING-AISLADO-V37.md` | Resumen comprensible para decidir autorización en el futuro, sin incluir credenciales ni crear servicios |
| `QA-AUTORIZACION-STAGING-V37.md` | Este informe |

## 3. Clasificación de los controles V18

**5 condiciones previas para decidir el alcance:** autorización humana, presupuesto, proveedor/región, especificación de un proyecto aislado y política de datos ficticios. No se han cumplido ni aceptado.

**11 comprobaciones posteriores a una autorización futura:** secretos, aislamiento multiempresa, MFA, RLS PostgreSQL, compatibilidad SQL/API, Home, rollback, backup/restore, observabilidad, QA real y aprobación final de salida. Siguen sin ejecutarse.

Esta separación **no reduce la exigencia** de los 16 controles: aclara su orden para evitar exigir una prueba real sin autorización para crear el entorno.

## 4. Qué pasó en la revisión estática

El verificador confirmó:
- Rama exclusiva, proyecto correcto y solicitud G01 **sin autorización**.
- Ningún proveedor, cuenta, región, plan ni presupuesto seleccionado.
- Datos ficticios, sin exportación de clientes ni claves en GitHub.
- Lectura/revisión GitHub como única acción permitida; sin crear recursos ni conectar base de datos.
- Rechazo al alterar cualquiera de las banderas: SQL, backend, correos, cron, cobros, IA de pago, publicación, `main` u otros proyectos.
- Negación de evidencias inventadas y aprobación falsa en V18/V33/V36/V37.
- Permanencia del riesgo `db/v13-endurecimiento-rls-legado.review.sql` con SQL activo.
- El resultado **nunca autoriza** staging ni producción, aunque el documento esté íntegro.

Los contadores de revisiones no son resultados de PostgreSQL. El estado `NOT_AUTHORIZED` es deliberado.

## 5. Suites ejecutadas realmente en esta etapa

Se recuperaron los archivos **guardados en GitHub** y las suites se evaluaron en un arnés de JavaScript con sustitutos de `fs`, `path`, `assert` y `process`. No se ejecutó Node en el PC del usuario, SQL, Supabase, navegador, solicitudes a proveedores, worker, correo ni despliegue.

| Suite ejecutada en esta sesión | Comprobaciones correctas |
|---|---:|
| **V37 — Autorización y alteraciones adversas nuevas** | **195/195** |
| V36 — Paquete coordinado y seguridad del SQL histórico | 174/174 |
| V33 — Plan maestro y criterios de salida | 146/146 |
| V26 — Preparación técnica | 91/91 |
| V26 — CLI de preflight NO GO | 11/11 |
| **Total comprobado esta sesión** | **617/617** |

Estas pruebas son estáticas y simuladas, **no** pruebas reales de seguridad o infraestructura.

### Reproducción local opcional

```powershell
node apps/mg-web-studio-cloud/tests/staging-authorization-v37.test.cjs
node apps/mg-web-studio-cloud/staging/v37-authorization-preflight.cjs
node apps/mg-web-studio-cloud/tests/coordinated-review-v36.test.cjs
```

Para el CLI V37, el código de salida **2** significa inventario válido pero `NOT_AUTHORIZED`; **1** significa documento inconsistente o faltante. Ninguno autoriza crear staging.

## 6. Decisión pendiente, próximos pasos y límites

**G01 continúa pendiente de decisión humana.** Para plantear una autorización limitada deben definirse responsable, proveedor/cuenta, región, presupuesto máximo con controles de gastos, política de datos ficticios, aislamiento, permisos específicos y recuperación. Se conserva la separación entre:
1. Autorizar **crear un staging aislado**.
2. Autorizar **conectar una base de datos y ejecutar SQL concreto**.
3. Autorizar **desplegar servicios** en ese staging.
4. Autorizar **publicar en producción**.

Una autorización para la primera acción **no implica ninguna de las otras tres**.

**Recomendación:** no continuar aumentando simuladores como sustituto de trabajo real. El siguiente paso relevante es resolver el paquete de decisión de staging y después ejecutar únicamente tareas explícitamente autorizadas. Mientras no exista permiso, solo está autorizado seguir haciendo revisiones estáticas de GitHub, sin costo.

**Restricciones respetadas:** `main` intacta; sin modificar Supabase ni otros productos; sin SQL, Lovable, servicios pagos, email, cobros, publicación o recursos creados.
