# MG WEB STUDIO CLOUD — V103 | Laboratorio Supabase Auth QA creado

**Fecha:** 2026-11-02 (Ecuador).  
**Resultado:** `CREATED_AND_VERIFIED` — exclusivamente proyecto nuevo y vacío a nivel de datos de aplicación.  
**Autorización:** el usuario aprobó expresamente utilizar la organización `glovermarkou05-commits` para consultar costo y crear `MG WEB STUDIO AUTH QA` en `sa-east-1` **solo si US$0**.

## 1. Cotización y confirmación de costos

La API Supabase `get_cost(type=project)`, bajo la organización aprobada, devolvió:
- `amount: 0`
- `recurrence: monthly`
- `type: project`

El proveedor requirió una confirmación formal **incluso para US$0**. Se validó exclusivamente `amount=0, recurrence=monthly, type=project` y se utilizó el identificador de confirmación devuelto **sin publicarlo en GitHub**. **No se aceptaron cargos no nulos**.

## 2. Estado comprobado después de creación

| Propiedad | Valor verificado |
| --- | --- |
| Nombre del laboratorio | `MG WEB STUDIO AUTH QA` |
| Organización | `glovermarkou05-commits` |
| Plan de la organización | `free` / `tier_free` |
| Región del laboratorio | `sa-east-1` |
| Estado de creación | `ACTIVE_HEALTHY` |
| Motor observado | PostgreSQL 17, versión `17.11.0.011` |
| Inventario previo | 7 proyectos: 1 activo y 6 inactivos |
| Inventario posterior | 8 proyectos: 2 activos y 6 inactivos |
| Proyecto anterior `MG WEB STUDIO CLOUD - STAGING` | Continúa `INACTIVE` |
| Costo informado por el proveedor para el nuevo proyecto | **US$0/mes** |
| Credenciales / OTP / JWT añadidos a GitHub | **Ninguno** |
| Consulta de tablas / ejecución SQL / migraciones | **No realizadas** |
| Usuarios reales o ficticios de Auth creados por esta operación | **Ninguno** |
| Funciones Edge / integraciones / RLS nuevas | **No realizadas** |

**Seguridad de inventario:** para no publicar referencias y direcciones de infraestructura, el ID del nuevo proyecto se conserva únicamente en la consola de Supabase y en la respuesta al usuario, **no en el repositorio GitHub**.

## 3. Lo que sigue bloqueado

1. **G103-C: validación de lectura real de Auth.** No está autorizada por la creación. Requiere revisión de permisos efectivos y plan acotado de consultas de solo lectura antes de acceder.
2. **G103-D: MFA de usuarios sintéticos.** No crear cuentas ni ejecutar challenge/verify sin aprobación diferenciada, revisión de privacidad y limpieza.
3. **Replay distribuido:** V102 usa un WeakMap de un proceso, no constituye consumo atómico entre workers/instancias; no publicar.
4. **Revisión independiente:** [Issue #8](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/issues/8) todavía sin aprobación formal humana. No convertir evidencia sintética en PASS V67.
5. **Publicación y otras aplicaciones:** no fusionar PR #7, no habilitar producción, no conectar FINZY, MG CLUB+, BAZAR-ONLINE, Ventry ni la web comercial.

## 4. Evidencia ya reutilizable

- V94B: 56/56 pgTAP en dos PG17 de datos ficticios y restauración aprobada en laboratorio.
- V102: [100/100 pruebas offline](https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/41471990965).
- V95–V101: expedientes de seguridad y trazabilidad en PR #7.
- Coste/estado: comprobación contemporánea de API de Supabase, **sin exponer confirmaciones de cobro ni tokens**.

**Dictamen:** laboratorio físico creado y activo, autorizado exclusivamente para su creación inicial a **US$0/mes**. **V67 sigue en 32 PENDING / 0 PASS**, producción `NO_GO` y PR #7 en borrador.
