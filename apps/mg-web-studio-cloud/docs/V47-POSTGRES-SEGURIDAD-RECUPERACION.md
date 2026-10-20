# MG WEB STUDIO CLOUD — V47 | PostgreSQL, seguridad y recuperación

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** **V47 COMPLETADA COMO CONTROL ESTÁTICO; POSTGRESQL REAL Y DDL BLOQUEADOS**.

## Alcance

V47 añade y ejecuta una suite local para comprobar integridad del paquete V45/V46 y mantener las puertas de seguridad cerradas. No se conecta a Supabase/PostgreSQL, no ejecuta SQL, no crea copias, no registra migraciones y no publica.

V46 aparece en la rama; último commit: `8191ef98e7cc198f06f1d6a2e5e25518ccdf1390`. Su informe registra 72/72 comprobaciones estáticas. Eso no equivale a parser PostgreSQL, prueba real de RLS ni restauración. El SQL revisado sigue fijado al blob `135ff2c25d935d87e5c8e9e0f9189705cd40b411`.

## Cambios

- `tests/v47-postgres-recovery-gates.test.cjs`: pruebas con Node.js estándar y sin cliente de base de datos.
- Comprueba hash Git del SQL V45, recuento de 16 tablas/16 RLS/12 políticas, ausencia de instrucciones destructivas y cambios globales de privilegios.
- Comprueba manifiesto V46, autorizaciones cerradas y estado pendiente del respaldo/restauración/RPO/RTO.

## Puertas vigentes

| Control | Estado |
|---|---|
| Hash y contrato estático SQL V45 | Comprobado por la nueva suite local |
| V46 estática | 72/72 según informe existente |
| Parseo con PostgreSQL 17 | Pendiente; requiere ensayo aislado autorizado |
| Custodio, retención, RPO y RTO | Pendiente de aprobación |
| Backup o restauración real | No ejecutados |
| Instalar 16 tablas, migrar o probar RLS real | No autorizado |
| Backend, producción, pagos, Lovable | Fuera de alcance |

## Registro

- **V46 — Completada en GitHub:** revisión documental/read-only y 72/72 controles estáticos reportados; resultado **NO GO**.
- **V47 — Completada en la rama:** 8/8 pruebas locales con archivos exactos leídos de la rama; Node v24.19.0. Verifica hash Git, contrato estático V45 y NO GO de seguridad/recuperación. No es una prueba PostgreSQL.
- **Después:** aprobar recuperación (responsable, retención, RPO/RTO y destino) por separado. Luego solicitar autorización explícita para cualquier ensayo PostgreSQL. La instalación en Supabase STAGING requiere otra aprobación.

Comando reproducible: `node --test apps/mg-web-studio-cloud/tests/v47-postgres-recovery-gates.test.cjs` (Node v24.19.0; 8/8). Mantener NO GO hasta completar autorizaciones y pruebas reales.

**Sin SQL, migraciones, cambios Supabase, pagos ni despliegues en esta etapa.**
