# MG WEB STUDIO CLOUD — V82 | Paquete de preparación de 32 pruebas operativas V67

**Fecha:** 27 de octubre de 2026  
**Rama:** `feature/mg-digital-v5-web-services`  
**Ámbito:** plan de entrega a un operador para un laboratorio **independiente**, todavía no seleccionado ni autorizado.  
**Estado final:** V82 preparada y probada en GitHub; **ninguna** de las 32 pruebas operativas V67 se ha ejecutado. **NO_GO** para conexión, base de datos, restauración o producción.

## 1. Propósito

Evitar otra etapa de simulación genérica. V82 convierte el **catálogo original V67** en un paquete de instrucciones manuales, con criterio de aceptación, clase de evidencia, autorización principal requerida y espacio reservado para una referencia futura de evidencia **real**, que permanece vacío.

**Documentos de origen que no se alteran:**
- `server/security-acceptance-v67.cjs` — 32 verificaciones canónicas.
- `docs/V67-EVIDENCIAS-PENDIENTES.json` — 32 `PENDING`, `evidenceRef:null`.
- `docs/V67-MATRIZ-HTTP-OBSERVABILIDAD-RECUPERACION.md` — condiciones y resultados esperados originales.
- `server/pg-lab-authorization-v78.cjs` — seis clases de autorización distintas, todas pendientes.

**Archivos añadidos en V82:**
- `server/v67-operational-pack-v82.cjs`: fabrica una copia inmutable del inventario V67, preserva cada ID, descripción, resultado esperado y tipo de evidencia, y añade la instrucción concreta del operador. `auditOperationalPacketV82` rechaza adulteraciones, permisos falsificados y evidencias inventadas. Siempre devuelve `NO_GO`.
- `scripts/review-v67-readiness-v82.cjs`: resumen y manifiesto `--json` por consola, **sin operaciones de red, Docker, SQL, archivos personales ni API externa**.
- `tests/v67-operational-pack-v82.test.cjs`: 25 pruebas de integridad del catálogo, cobertura, preservación de pendientes y seguridad.
- `tests/review-v67-readiness-v82.test.cjs`: 6 pruebas de comportamiento del comando local.
- `.github/workflows/mg-web-studio-v82-operational-readiness.yml`: tests V82, tests originales V67 y regresiones V70–V81.
- Este informe de entrega.

**Importante:** el campo `requiredSeparateApproval` señala la aprobación *principal* de una tarea. **No reemplaza el conjunto de permisos necesarios**; por ejemplo, una prueba `AUTH` con `network` también necesita identidad de prueba y reglas de alcance, y una prueba de carga necesita límites y ventanas autorizadas.

## 2. Estado operativo confirmado antes de V82

Según la última captura de Windows facilitada por el usuario:
- **8 CPU**, RAM total **7.865 MiB**, RAM libre **740 MiB**.
- Volumen **C:** NVMe / NTFS con **18.106 MiB** libres.
- E: tarjeta USB/SD; **no** usar como disco principal de PostgreSQL.
- BAZAR-ONLINE: `supabase_db_bazar_online_4r_local_only` informado como **healthy**, no modificado.
- El laboratorio aislado de MG WEB STUDIO CLOUD **no existe**. El criterio V81 no se cumple: faltan recursos de RAM y la reserva conjunta en C:.

Estas cifras son **información aportada por el usuario en su última medición**, no datos medidos en GitHub. Un resultado anterior no garantiza que el contenedor siga saludable ahora; al iniciar una etapa operativa deberá volver a validarse.

**Acción recomendada:** no condicionar el desarrollo a Windows con 8 GB de RAM. Para pruebas reales seleccionar y aprobar **otro equipo o un laboratorio externo dedicado**, con tamaño y costos validados. No crear aún servidores, cuentas, bases ni volúmenes sin autorización separada.

## 3. Orden práctico de las 32 verificaciones

| Fase | Controles | Casos | Preparación/permiso indispensable |
| --- | --- | ---: | --- |
| **G0** Alcance y permisos | `OPS-01..02` | **2** | Aprobar interface/puerto/TLS/firewall del laboratorio. La revisión de cambios de producción es **posterior e independiente**; no se despliega nada en esta fase |
| **G1** Políticas y evidencias | `OBS-01..04` | **4** | Responsables designados; política de anonimización, retención, cifrado, accesos y alertas |
| **G2** Parser HTTP | `HTTP-01..14` | **14** | Ingress aislado con escucha y red específicamente autorizadas; sin conexión hacia sistemas ajenos |
| **G3** Límites de carga | `LOAD-01..03` | **3** | Aprobación explícita de ventanas, tasas y techo de recursos; detener al superar límites |
| **G4** Identidad y multiempresa | `AUTH-01..03` | **3** | Identidades creadas expresamente para ensayo, datos sintéticos, permisos por empresa/sitio y MFA de prueba |
| **G5** Datos y roles | `DATA-01..02` | **2** | PostgreSQL independiente con roles propios, autorización `database`/`sqlRead`, catálogo de consultas aprobadas |
| **G6** Recuperación | `REC-01..04` | **4** | Backup sanitizado, restauración a destino aislado y consentimiento diferenciado para esta operación |
| **TOTAL** | | **32** | **Todos PENDING** |

Los grupos son un mapa de dependencias, **no** órdenes que puedan ejecutarse automáticamente. G0 contiene una solicitud de autorización productiva que se examinará al final del proyecto; no es necesario ni apropiado adelantar esa autorización para poder revisar las demás fases de laboratorio. G1 puede iniciar su preparación documental fuera de línea, pero la verificación final de OBS requiere evidencias del laboratorio ya operativo.

El archivo `server/v67-operational-pack-v82.cjs` contiene instrucciones **específicas para cada ID**, no solo el nombre de la fase. Por ejemplo, HTTP-04 pide comprobar el conflicto `Transfer-Encoding`/`Content-Length`, LOAD-03 mide sockets/memoria/cola, AUTH-02 ensaya dos empresas ficticias y REC-02 contrasta estructuras y políticas entre origen autorizado y destino restaurado.

## 4. Qué debe registrar el operador cuando exista laboratorio

Para **cada uno de los 32 IDs**:

1. ID canónico y tipo de evidencia V67; fecha/hora con zona horaria; operador responsable y revisor **distinto**, siempre que sea posible.
2. Identificador y versión del **entorno aislado**, commit exacto, configuración relevante (sin secretos), autorización previa y alcance acordado.
3. Método aplicado, criterios esperados del V67, observación factual, resultado y restricciones encontradas.
4. Referencia a una evidencia protegida y sanitizada; el nombre puede seguir el patrón `evidence/v67/HTTP-01.json`, **solo cuando exista un archivo real**. No crear evidencias ficticias ni versionar tokens, IP personales, dumps con datos, credenciales ni PII.
5. Verificación separada de la evidencia por un responsable autorizado. Un `PASS` escrito en un JSON no equivale a aprobación independiente ni a un `GO`.

Los archivos potencialmente sensibles **deben quedar fuera del repositorio público**, con acceso, cifrado, retención y eliminación definidos. Las pruebas reales de seguridad HTTP y carga quedan limitadas a la infraestructura aprobada y jamás a endpoints ajenos o entornos productivos sin autorización específica.

## 5. Bloqueos por autorización

Las seis clases de V78 siguen `PENDING`: `database`, `network`, `sqlRead`, `tenantFixtures`, `restore`, `production`.

La V82 **no** da facultades de abrir un puerto, instalar PG17, ejecutar SQL, restaurar copias, revisar sistemas conectados o publicar. No se usaron créditos Lovable y no se accedió a Supabase real.

La decisión operacional continúa:

```text
MG WEB STUDIO CLOUD
Paquete documental V82: PREPARADO
Laboratorio real: NO SELECCIONADO / NO INSTALADO / NO AUTORIZADO
Control V67: 0 aprobados, 32 PENDING
Evidencias reales V67: 0 verificadas
Autorizaciones: 6 PENDING
Publicación: NO_GO
BAZAR-ONLINE: NO MODIFICAR
```

## 6. Comando local seguro para revisar el paquete

Dentro de `apps/mg-web-studio-cloud`, con Node.js instalado:

```powershell
node .\scripts\review-v67-readiness-v82.cjs --summary
```

Para ver el manifiesto V82 con detalle, en la consola (no lo confundas con evidencias reales):

```powershell
node .\scripts\review-v67-readiness-v82.cjs --json
```

Ambos comandos trabajan **exclusivamente con el catálogo incluido en el repositorio** y escriben un resumen en pantalla; no descargan nada ni conectan redes, Docker, PG, Supabase o un servidor.

## 7. Verificación automatizada

**CI definitivo de V82:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40521644372  
**Job:** `122250041796`; **Node:** `v22.23.3`  
**Commit probado:** `405ae79bea6a03b629f5e6f903a28a2bcb7c8b0e`  
**Resultado:** `completed / success`

| Bloque | Pruebas correctas |
| --- | ---: |
| Nuevas V82 | **31** |
| Contratos originales V67 (regresión adicional) | **25** |
| V81 | 46 |
| V80 | 51 |
| V79 | 26 |
| V78 | 45 |
| V77 | 38 |
| V76 | 47 |
| V75 | 38 |
| V74 | 39 |
| V73 | 34 |
| V72 | 28 |
| V71 | 44 |
| V70 | 92 |
| **TOTAL (incluyendo V67)** | **584/584** |

**Las 584 pruebas son automatizadas, sintéticas o de contrato; ninguna ejecutó las 32 pruebas reales V67.** El trabajo CI no se ejecutó en el PC Windows del usuario.

## 8. Próxima acción que desbloquea el proyecto

No conviene empezar una V83 de ensayos simulados sin resolver dependencias. Para proceder a verificaciones reales se requiere:

1. **Elegir una infraestructura de laboratorio distinta** de BAZAR-ONLINE, con recursos disponibles, titular responsable y límites de costos si es externa.
2. **Aprobar por separado** host, interfaz, puerto/red y datos ficticios; recién entonces preparar PG17 y una ruta de pruebas autorizada.
3. Comenzar por la revisión G1 de políticas y, una vez habilitado el entorno, G2 de parser HTTP; progresar hacia identidad/RLS y restauración **sin omitir los permisos de V78**.
4. Mantener **producción deshabilitada** hasta resultados operativos, recuperación probada, validación independiente y una autorización de publicación posterior.

**Conclusión:** V82 **completada como paquete de preparación y auditada por CI**; instalación y ensayos reales **NO_GO**. El cuello de botella ya no es la redacción del plan, sino seleccionar recursos de laboratorio aprobados para obtener las 32 evidencias reales.
