# MG WEB STUDIO CLOUD — V88 | JWT ES256 firmados, revocación y aislamiento multiempresa

**Fecha Ecuador:** 27/10/2026 (ejecución en GitHub Actions registrada en UTC el 28/10/2026)  
**Repositorio:** `glovermarkou05-commits/glovermarkou05-commits.github.io`  
**Rama:** `feature/mg-digital-v5-web-services`  
**Autorización del usuario:** «AUTORIZADO» para V88, limitada a JWT firmados de prueba, expiración, revocación y acceso entre dos empresas, sin usuarios reales, conexiones externas ni publicación.

## 1. Resultado realmente verificado

**Ejecución completada con éxito:** https://github.com/glovermarkou05-commits/glovermarkou05-commits.github.io/actions/runs/40633873753  
**Job:** `122636248588`  
**Commit ensayado:** `6b3f7f063c91db7231e9efc8992db0bad123bea7`  
**Estado:** `completed / success`.

| Bloque | Ejecutadas | Aprobadas | Fallos |
| --- | ---: | ---: | ---: |
| **V88 nueva matriz criptográfica y de autorizaciones** | 28 | 28 | 0 |
| **Regresión V71–V75 de autenticación y sesiones** | 183 | 183 | 0 |
| **Total en la ejecución V88** | **211** | **211** | **0** |

Las 28 pruebas V88 usaron firmas **ES256 reales** sobre claves P-256 creadas temporalmente mediante `node:crypto.generateKeyPairSync`, y la verificación real de las piezas `V71 → V72 → V73 → V74`, `auth-boundary.cjs`, `tenant-authorization.cjs` y el ensamblaje `V69` con la cadena `V63–V66` en memoria.

Los JWT, claves privadas, identificadores de sesión ni contraseñas no fueron registrados como logs, artefactos o archivos del repositorio; todos los valores de la simulación están dentro del proceso de test temporal. El proveedor JWKS devuelve una **respuesta sintética validada** y la lectura del estado de la sesión es un **mapa en memoria**: ni el origen HTTP declarado del emisor ni `auth.sessions` se contactan realmente.

## 2. Cobertura de seguridad observada

- **Firma criptográfica válida:** identidades ficticias A/B pueden acceder a la empresa y la sucursal a las que su membresía y alcance asignan permiso.
- **Separación multiempresa:** credencial de empresa A no abre empresa B ni viceversa; accesos fuera de empresa o a sucursal no asignada responden denegación segura.
- **Revocación:** una sesión que pasa a `revoked` es denegada al siguiente intento aun cuando el JWT siga firmado correctamente. Revocar membresía o retirar permiso de sucursal también retira acceso.
- **Expiración y tiempo:** `exp` vencido, `nbf` futuro y paso del reloj beyond expiración producen denegación antes de consultar organización o sucursales.
- **Firma y configuración:** alteración del payload sin volver a firmar, `alg:none`, issuer o audience incorrectos, session_id desconocido y sujeto/sesión incompatibles son rechazados.
- **Llaves:** rotación con invalidación explícita deja de confiar en la firma antigua y acepta una nueva con el identificador público correspondiente.
- **Privilegios:** insertar `role:SUPERADMIN`, `aal:aal2` y `user_metadata.role` dentro del JWT, o `role` en el cuerpo, no transforma un cliente visualizador en editor. La capacidad de editar sigue determinada por la membresía efectiva del servidor.
- **Proveedores:** fallo de JWKS, fallo de sesión, JWKS redireccionado, cabecera Authorization duplicada y ausencia de Authorization deniegan de forma cerrada.
- **Controles de regresión:** la suite existente V71–V75 suma otras 183 verificaciones correctas.

**No** se han ejecutado pruebas contra un proveedor de autenticación real, login real, MFA real, revocación de una sesión persistida en `auth.sessions`, operaciones SQL de autorización ni una petición HTTP de red en V88. La cadena HTTP es ensayada mediante eventos Node en memoria; V87 cubrió por separado tráfico HTTP real en `127.0.0.1` con proveedor sintético.

## 3. Defecto del primer intento y corrección

- Ejecución inicial `40633787602`: **26/28**. Dos comprobaciones de empresa B obtuvieron `404` porque la cuenta sintética de rol editor carecía del permiso de sucursal. La aplicación requirió correctamente ese permiso.
- Se añadió **exclusivamente** el alcance ficticio de la empresa B/sucursal B al test y se ajustó el contador esperado de consultas; no se modificaron los componentes de seguridad de producción, no se desactivó la política de permisos ni se añadieron excepciones para eludirla.
- Ejecución final `40633873753`: **28/28 V88 y 183/183 regresiones PASS**.

## 4. Archivos de la V88

- `tests/v88-signed-jwt-session-tenants.test.cjs` — 28 casos de integración criptográfica con dos empresas ficticias, dos sesiones y dos pares efímeros de claves ES256.
- `.github/workflows/mg-web-studio-v88-signed-jwt-session-tenants.yml` — workflow Ubuntu 24.04 de GitHub, rama de desarrollo, `contents:read`, checkout sin credenciales persistentes, y pruebas Node con `native-network-guard-v70.cjs`; no se inician servicios ni se abre un listener.
- `docs/V88-EVIDENCIA-JWT-FIRMADOS-REVOCACION-MULTIEMPRESA.md` — este informe.

**Sin cambios en:** `main`, sistema productivo, archivos de clientes, BAZAR-ONLINE, Supabase del usuario, Docker de Windows, base PostgreSQL real o claves de proveedor.

## 5. Estado formal del proyecto y siguiente paso

**V67: 32/32 controles formales PENDING; 0 aprobaciones independientes.** Las pruebas nuevas ayudan a demostrar algoritmos y composición de autorización, pero no verifican `AUTH-01`, `AUTH-02` y `AUTH-03` contra identidades de ensayo persistidas en un proveedor real y revisadas por separado. Especialmente, los valores falsos `aal2` se **ignoraron**, no constituyen una prueba positiva de MFA.

**V78:** no se autoriza por esta fase conectarse a una base o proveedor externo, emitir un token de usuario real, abrir red, restaurar respaldos ni publicar. Se conserva `NO_GO` de producción.

**Siguiente bloque aconsejado:** planificar un **ensayo de carga pequeña y estrictamente acotada** para límites de concurrencia y presupuesto `V66` sobre un único servidor `127.0.0.1` de GitHub Actions. Este bloque requerirá autorización **independiente y explícita** para `LOAD-01..03`, con límites de tasa, duración, memoria y sockets antes de ejecutarlo. Otra tarea futura independiente es restauración de una base ficticia PG17 en otro destino temporal, que también requiere consentimiento separado.

**Conclusión:** V88 completada como integración criptográfica real con proveedores sintéticos y regresión satisfactoria; protección del entorno conservada, `NO_GO` hasta pruebas de sistema, evidencias completas y autorización productiva expresa.
