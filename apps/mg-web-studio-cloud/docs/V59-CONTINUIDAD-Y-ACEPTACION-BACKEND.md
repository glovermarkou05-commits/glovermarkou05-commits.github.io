# MG WEB STUDIO CLOUD — V59 | Continuidad y aceptación del backend

## Alcance y evidencia

Etapa documental: revisión de V53, V58 y del contrato de arquitectura V29 en la rama `feature/mg-digital-v5-web-services`. No acredita implementación, despliegue ni pruebas HTTP nuevas. No se ejecutó SQL ni se consultó el estado actual de STAGING.

El usuario decidió posponer la limpieza de disco y continuar con tareas independientes de recuperación. Evidencia aportada desde su PowerShell: PostgreSQL 17.11 disponible; Podman 6.1.4 instalado, máquina `podman-machine-default` WSL activa y motor accesible; cero imágenes y contenedores en el inventario enviado; C: con 2,6 GB libres. Esta evidencia corresponde al equipo Windows del usuario, no al entorno del agente. Supabase CLI y compatibilidad Docker API aún no verificadas.

El bloqueo de herramientas descrito en V58 ha cambiado: la recuperación local queda pausada por espacio disponible. No se descargaron imágenes ni se creó un dump. No existe evidencia de restauración y no se puede marcar RECOVERY_TESTED.

## Continuidad permitida

Revisar contratos, código y pruebas aisladas sin datos reales. Preparar validaciones de identidad, pertenencia y permisos antes de integrar escrituras. Toda ejecución SQL, migración o despliegue conserva el requisito de autorización específica. La pausa de recuperación no elimina su condición de salida para producción.

## Matriz de aceptación de identidad y ámbito

Todos los casos siguientes están PENDIENTES de ejecución HTTP real. V53 (56/56 según su informe) comprueba RLS con claims simulados; no sustituye esta matriz.

| ID | Caso | Resultado exigido |
|---|---|---|
| AUTH-01 | Sin credencial, token inválido o expirado | 401; ninguna escritura ni datos protegidos en respuesta. |
| AUTH-02 | actorId, rol, scope o MFA falsificados en el cuerpo | Rechazar campos no admitidos; nunca usarlos como autoridad. |
| AUTH-03 | Actor de empresa A solicita sitio o propuesta de B | 404 genérico conforme a V29; sin datos de B ni efectos laterales. |
| AUTH-04 | Sitio de la URL no pertenece a la organización seleccionada | Rechazo antes de operar; organización de la URL no establece pertenencia. |
| AUTH-05 | Editor asignado a un sitio intenta operar en otro | Rechazo; validar scope efectivo para cada solicitud. |
| AUTH-06 | Rol viewer intenta mutación | 403 una vez reconocido el ámbito; sin escrituras. |
| AUTH-07 | Operación SUPERADMIN sin MFA verificado | Denegar; un campo cliente MFA=true no autoriza. |
| AUTH-08 | Reintento idempotente tras retirar permiso | Revalidar permisos antes del replay; no devolver respuesta histórica protegida. |
| AUTH-09 | Misma clave con payload distinto | 409 IDEMPOTENCY_CONFLICT; ningún efecto duplicado. |
| AUTH-10 | Dos solicitudes con la misma revisión esperada | Solo una modificación confirmada; otra recibe conflicto. |
| AUTH-11 | Fallo en auditoría de negocio u outbox | Revertir la unidad transaccional completa; no confirmar cambios parciales. |
| AUTH-12 | Aplicar propuesta aprobada | Cambiar borrador según CAS; no publicar el sitio. |
| AUTH-13 | Error interno | Respuesta genérica con requestId; no exponer SQL, stack, tokens ni secretos. |
| AUTH-14 | Acceso de navegador a tablas privadas | Denegado; credencial service_role nunca llega al cliente. |

## Protocolo para obtener evidencia

1. Revisar el código servidor existente y elegir un endpoint acotado para la primera integración; no asumir que las rutas virtuales de V29 son endpoints activos.
2. Preparar identidades de prueba y dos organizaciones aisladas mediante un plan autorizado; no usar cuentas de clientes reales.
3. Para cada caso guardar método/ruta, código esperado y obtenido, requestId y comprobación de efectos laterales, sin Authorization, contraseñas ni cookies.
4. Distinguir tests unitarios con mocks, RLS en PostgreSQL y HTTP con Auth real en los informes. No sumar resultados de categorías distintas como evidencia end-to-end.
5. Definir y verificar la política de revocación de sesiones: el cierre de sesión en el cliente por sí solo no demuestra rechazo inmediato de un token ya emitido.

## Registro de etapas y pendientes

| Bloque | Estado |
|---|---|
| V46–V52 | Antecedentes registrados en V53; no reejecutados en V59. |
| V53 | 56/56 RLS según informe existente; no es prueba de login ni HTTP. |
| V54–V57 | Avances de ACL y trazabilidad documentados; defaults restantes y fuente canónica siguen pendientes. |
| V58 | Preparación revisada; recuperación real no realizada. |
| V59 | Continuidad y matriz de aceptación preparadas; ninguna prueba nueva ejecutada. |
| Recuperación local | Pausada por decisión del usuario; espacio C: 2,6 GB según salida aportada. |
| Backend/Auth real | Pendiente de inspección de implementación e integración; matriz preparada. |
| Rendimiento | EXPLAIN con cardinalidad representativa e índices pendientes. |
| Producción/publicación | NO GO hasta completar los controles y obtener autorización. |

La prueba de recuperación deberá conservar los criterios V58: restauración aislada, esquemas/grants/RLS/constraints/extensiones, concordancia de conteos, suite V53 en destino y medición RPO/RTO con retención y cifrado definidos.
