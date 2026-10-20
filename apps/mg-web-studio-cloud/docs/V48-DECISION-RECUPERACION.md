# MG WEB STUDIO CLOUD — V48 | Decisión de recuperación

**Fecha:** 20 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Estado:** **PAQUETE PREPARADO; POLÍTICA PENDIENTE DE DECISIONES DEL RESPONSABLE**.

## Propósito

V48 prepara el registro formal de recuperación para el STAGING aislado. No modifica la estrategia ya propuesta en V46: reconstrucción del entorno vacío usando solo datos sintéticos al inicio. La propuesta no se considera aprobación para crear copias, restaurar datos, ejecutar SQL o cambiar Supabase.

## Propuesta técnica para revisión

- Mantener exclusivamente datos sintéticos hasta que exista una política de respaldo aprobada.
- Antes de conservar información valiosa, definir custodio, cifrado, retención, RPO, RTO y cobertura de los componentes administrados.
- Ensayar la restauración en un destino aislado autorizado; no asumir que un dump lógico incluye datos de Auth, Storage ni archivos binarios.
- Un fallo antes de `COMMIT` podría revertir una transacción; esto todavía requiere prueba PostgreSQL. Después de `COMMIT`, no se presume rollback automático.
- No eliminar proyectos, usar `DROP CASCADE`, modificar otros proyectos ni habilitar servicios pagos como parte de esta propuesta.

## Decisiones por completar

| Decisión | Valor registrado | Requisito |
|---|---|---|
| Responsable/custodio | Pendiente | Identificar a una persona responsable de crear y custodiar los respaldos |
| Retención | Pendiente | Definir días y eliminación segura |
| RPO | Pendiente | Máxima pérdida de datos aceptable, expresada en horas |
| RTO | Pendiente | Tiempo objetivo para recuperar el servicio, expresado en horas |
| Destino aislado | Pendiente | Identificar proyecto/entorno separado y confirmar que no contiene datos reales |
| Cifrado y acceso | Pendiente | Definir custodia de la clave y accesos autorizados |

Los valores continúan vacíos en `staging/v48-recovery-policy.review.json`; no los sustituyo por supuestos. El estado de todas las aprobaciones operativas se mantiene en falso.

## Puertas independientes

1. Aprobar los valores de política y el destino.
2. Autorizar específicamente la creación y verificación del respaldo.
3. Autorizar una prueba de restauración en el destino aislado.
4. Autorizar por separado la validación PostgreSQL 17 del SQL V45. La aprobación de recuperación no autoriza DDL.
5. Autorizar la instalación V45 en Supabase STAGING como decisión posterior e independiente.

## Registro de avance

- **V46:** paquete de preinstalación, 72/72 verificaciones estáticas reportadas; NO GO.
- **V47:** 8/8 pruebas locales de integridad; sin ejecución PostgreSQL; NO GO.
- **V48:** plantilla de decisión y pruebas de bloqueo preparadas. La política no puede marcarse aprobada hasta completar los campos y obtener aprobación explícita.
- **Siguiente:** completar las decisiones pendientes; entonces preparar el ensayo autorizado sin mezclarlo con la instalación de V45.

**En V48 no se ejecuta SQL, migraciones, backups, restauraciones, operaciones Supabase, pagos ni despliegues.**
