# MG WEB STUDIO CLOUD — V87 | Tráfico HTTP real en 127.0.0.1

**Fecha de ejecución:** 28/10/2026 UTC (27/10/2026 en Ecuador)  
**Repositorio y rama:** `glovermarkou05-commits/glovermarkou05-commits.github.io` → `feature/mg-digital-v5-web-services`  
**Autorización:** usuario aprobó V87 para iniciar **un servidor HTTP temporal solo en 127.0.0.1 de un ejecutor GitHub Actions** y ejecutar pruebas de parser/seguridad HTTP sin carga intensiva, SQL, restauraciones ni publicación.

## 1. Ejecución y evidencia real

- **Workflow completado:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40633105863
- **Job:** `122633815719`.
- **Conclusión final:** `completed / success`.
- **Compromiso ejecutado:** `724cc2f22526595ff3c1fc74ea8daa17b0dc2949`.
- **Código real bajo prueba:** `server/http-site-gate-v63.cjs`, `server/node-http-transport-v64.cjs`, `server/http-server-blueprint-v65.cjs`, `server/request-budget-v66.cjs` y `server/unbound-tenant-stack-v69.cjs`, integrados con `http.createServer` para este ensayo controlado. **No se probó un servidor diferente de demostración.**
- **Listener:** exclusivamente IPv4 `127.0.0.1` y puerto efímero asignado por el sistema, sin listener público; confirmado `server.address().address === "127.0.0.1"`.
- **Entradas:** 21 peticiones/tramas reales HTTP/1.1 desde sockets locales Node; nunca desde Internet.
- **Controles adicionales de integridad del runner:** **10/10 PASS**.
- **Resultado de las 21 tramas:** **21/21 resultados coincidieron con las expectativas**, sin errores.
- **Cierre:** `V87 CLEANUP: loopback listener closed; no persistent services`.

## 2. Matriz de tramas reales observadas

| Caso real | Señal/entrada del ensayo | HTTP observado / cierre | Límite de la evidencia |
| --- | --- | --- | --- |
| HTTP-01 | GET válido, autorización sintética | **200** | No prueba JWT real |
| HTTP-01B | GET sin Authorization | **401** | Se comprobó ausencia de llamada al verificador |
| HTTP-02 | Authorization duplicado, distinta capitalización | **400** | Rechazo antes de autenticar |
| HTTP-03 | Content-Length repetido | **400** | Rechazo del parser |
| HTTP-04 | Transfer-Encoding y Content-Length simultáneos | **400** | Rechazo del parser |
| HTTP-05A | Nombre de cabecera inválido | **400** | Rechazo del parser |
| HTTP-05B | Byte de control en cabecera | **400** | Rechazo del parser |
| HTTP-06 | Cabecera mayor al límite | **431** | Probado Node, **no** proxy real |
| HTTP-07A | Host ausente | **400** | Node con `requireHostHeader=true` |
| HTTP-07B | Host duplicado | **400** | Node/V64 |
| HTTP-08A | Ruta con query no permitido | **404** | Sin consulta al repositorio |
| HTTP-08B | Ruta con barra codificada | **404** | Sin consulta al repositorio |
| HTTP-08C | Request-target absoluto | **404** | No equivale a prueba de proxy real |
| HTTP-08D | Fragmento en request-target | **404** | Sin consulta al repositorio |
| HTTP-09 | GET con longitud de cuerpo 1 y contenido | **400** | Sin autenticar |
| HTTP-10 | Cabeceras incompletas desde un solo peer | **Cierre sin respuesta** | Un caso temporal (~5 s), sin carga ni prueba de fugas de recursos |
| HTTP-11 | Expect: 100-continue en ruta prohibida | **417** | Rechazo de expectativa |
| HTTP-12A | Upgrade: websocket | **Cierre sin respuesta** | Sin WebSocket |
| HTTP-12B | CONNECT | **Cierre sin respuesta** | Sin túnel |
| HTTP-13 | Método/request-line malformado | **400** | Respuesta sanitizada del parser |
| HTTP-14-PARTIAL | Cabeceras de encaminamiento y rol falsificadas | **200** | El resultado responde al token sintético permitido; solo se comprobó que las cabeceras no bloquearon ni alteraron esta respuesta. **No se ensayó un proxy inverso de confianza ni se acreditó un control proxy end-to-end** |

En los casos señalados como `unhandled`, los contadores internos confirmaron que ni el verificador ni la consulta sintética recibieron la petición. Las respuestas analizadas no incluyeron el token ficticio, el identificador de actor ni trazas internas. El informe publicado presenta estados y etiquetas sanitizados, no paquetes completos.

## 3. Configuración e interpretación del ensayo

**Comportamiento real HTTP:** el servidor fue creado con el blueprint V65 y pasó las solicitudes al transporte V64, la compuerta V63, el presupuesto V66 y la composición V69. Se ejercitó el **parser HTTP/1.1 real de Node** mediante TCP loopback.

**Autenticación y datos:** se inyectó un verificador sintético que reconoce un único token inerte, y un proveedor de respuestas de consulta en memoria con identificadores UUID ficticios. No se usaron firmas JWT reales, credenciales del usuario, PostgreSQL ni políticas RLS de base de datos. Los tests V86 de PostgreSQL real se mantienen como evidencia *independiente*, no integrada con estos endpoints.

**Proxy y TLS:** no hubo Nginx, TLS, proxy inverso, firewall de producción ni tráfico externo. Los casos HTTP-06, HTTP-07 y HTTP-14 necesitan más evidencia para cumplir sus criterios canónicos V67 a nivel proxy; HTTP-14 es explícitamente parcial.

**Límites de tiempo/carga:** se efectuaron 21 sondas pequeñas y secuenciales, con **solo una** solicitud de cabeceras incompletas, que terminó por el timeout configurado. No se hicieron pruebas de saturación, límites masivos por IP ni medición de memoria bajo estrés (LOAD-01..03 permanecen pendientes).

**Privacidad:** se usaron únicamente datos sintéticos y respuestas públicas; no se registraron cabeceras ni cuerpos completos de entrada, direcciones de cliente, tokens ni rutas sensibles en el resumen.

## 4. Alcance del trabajo y protección de proyectos

- **No** se desplegó ni publicó la web, ni se modificó `main`.
- **No** se ejecutaron consultas SQL, migraciones, restore o contenedores en V87.
- **No** se accedió a Supabase, BAZAR-ONLINE ni Docker de la laptop.
- La ejecución no prueba autenticación real, MFA, revocación, políticas de operación, respaldo ni recuperación.

## 5. Intentos y depuración (sin ocultar fallos)

- `40632843852`: detección previa de nombres de test de cobertura `HTTP-05A`; el servidor no llegó a arrancar.
- `40632883279`, `40632940850`, `40632998882`, `40633045518`: el servidor escuchó solo en loopback y se cerró. Se aisló un defecto **del lector de resultados del laboratorio**, que trataba la respuesta HTTP chunked como JSON sin decodificar. Algunos intentos solo tenían mensajes de error demasiado genéricos; se refinaron los diagnósticos sanitizados.
- `40633105863`: lector corregido para interpretar codificación por segmentos (chunked), **21/21 tramas aprobadas y 10/10 tests de política**.

Ningún intento fallido habilitó permisos adicionales ni se interpretó como paso V67 aprobado.

## 6. Estado formal V67 y siguientes permisos

**V67:** 32 controles operativos **PENDING / 0 con verificación independiente**, aunque V87 proporciona evidencia técnica real parcial o sustancial para HTTP-01..14. La matriz canónica `docs/V67-EVIDENCIAS-PENDIENTES.json` no fue adulterada ni se marcaron PASS formales sin revisor.

**Aprobaciones limitadas V85/V86/V87:** GitHub-hosted runner efímero, arranque temporal PG17, fixtures SQL sintéticos y listener loopback de V87 según cada etapa. Estas decisiones no son autorización genérica a ejecutar cargas, probar un proxy público, emitir credenciales reales, restaurar backups o desplegar.

**Siguiente bloque recomendado:** preparar un entorno de identidad de ensayo con JWT firmados sintéticos, verificar los controles de caducidad/revocación y permisos de acceso, o bien obtener la autorización independiente necesaria para un **pequeño ensayo de límites de solicitudes** estrictamente acotado. Para certificar V67 de extremo a extremo, deberán revisarse también proxy/TLS, controles humanos y recuperación; permanece `NO_GO` productivo.

**Conclusión:** V87 ejecutada realmente sobre el parser HTTP del proyecto, sin red externa, datos privados ni backend real; 21 tramas correctas, evidencias explícitas y cierre de listener verificado.
