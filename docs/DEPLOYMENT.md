# DEPLOYMENT — Despliegue del frontend en Vercel

- **Alcance:** cómo está desplegado el frontend, cómo se reproduce la
  configuración, cómo se verifica cada despliegue y cómo se revierte.
- **Fecha:** 2026-09-28 — Fase 14, PR #4. Actualizado en la Fase 15
  (integración con la API), PR #6.
- **Relación con el backend:** la API vive en Render
  (`gynfem-backend/docs/DEPLOYMENT.md`, Sección 7). Desde la Fase 15 el
  frontend la usa a través de un BFF en Vercel (Sección 11).

---

## 1. Estado

| | Valor |
| --- | --- |
| Plataforma | Vercel, plan **Hobby** |
| Dueño y acceso | La cuenta Hobby **personal** del responsable del proyecto (su identificador aparece en las URLs de despliegue). Hobby no admite miembros: **solo esa cuenta** puede cambiar variables y protección, ver las vistas previas y revertir (Sección 9). Traspasarlo exige transferir el proyecto a otra cuenta o pasar a un plan de equipo |
| Dominio de producción | **`https://gynfem-frontend.vercel.app`** (Settings → Domains) |
| Rama de producción | `main`: cada commit en `main` despliega a producción |
| Otras ramas | Generan despliegues de **vista previa**, protegidos (Sección 5) |
| Configuración versionada | `vercel.json` (framework, comandos y región de las funciones), `next.config.ts` + `lib/security-headers.ts` (cabeceras), `package.json` → `engines.node` (Node 24) |
| Funciones | Route Handlers del BFF (`app/api/`), región **`pdx1`**, Fluid Compute activo (Sección 11.3) |
| Datos | Los de la API real. Ningún dato real de pacientes hasta la Fase 17: solo datos sintéticos de verificación (Sección 12) |

**Dominio de producción ≠ URL de despliegue.** Vercel da a cada despliegue una
URL única (`<proyecto>-<hash>-<cuenta>.vercel.app`) y además un dominio de
producción estable (*Settings → Domains*). Solo el **dominio de producción**
es público (Sección 5), y es el único que se usa en CORS, en la documentación
y para compartir.

## 2. Variables de entorno

Se configuran en *Settings → Environment Variables*, **solo con el ámbito
Production** (sin Preview ni Development). La plantilla comentada es
`.env.example`; en local se copia a `.env.local`, que nunca se versiona.

Desde la Fase 15 las tres son **de servidor**: las lee solo el BFF
(`lib/server/env.ts`). **No existe ninguna variable `NEXT_PUBLIC_`**, así que
ninguna se copia en el JavaScript del navegador.

| Variable | Para qué | Formato |
| --- | --- | --- |
| `API_BASE_URL` | Origen de la API al que reenvía el BFF | `https://<servicio>.onrender.com`, sin ruta ni barra final |
| `SUPABASE_URL` | Supabase Auth: iniciar, refrescar y cerrar la sesión desde el BFF | `https://<project-ref>.supabase.co`, sin barra final |
| `SUPABASE_PUBLISHABLE_KEY` | Clave de Supabase Auth | `sb_publishable_…`. Es la clave **publicable**: RLS impide que llegue a las tablas (`gynfem-backend/docs/SECURITY.md`) |

**Migración desde la Fase 14 (una vez).** En Vercel → *Settings → Environment
Variables*, ámbito Production: crear `API_BASE_URL`, `SUPABASE_URL` y
`SUPABASE_PUBLISHABLE_KEY` con los mismos valores que tenían
`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, y **borrar las tres antiguas**. Después,
*Redeploy*.

**De dónde sale cada valor:**

- `API_BASE_URL`: la URL pública del servicio `gynfem-api` en Render. Hoy es
  `https://gynfem-api.onrender.com` (`gynfem-backend/docs/DEPLOYMENT.md`, Sección 1).
- `SUPABASE_URL`: Supabase → *Project Settings → Data API* (o *API*) →
  *Project URL*.
- `SUPABASE_PUBLISHABLE_KEY`: Supabase → *Project Settings → API Keys* → la
  clave **publicable** (`sb_publishable_…`), nunca la secreta.

**Reglas (las fija `tests/unit/deployment-config.test.ts`, que recorre todo el
código fuente):**

- **Nunca** en Vercel ni en este repositorio: la clave secreta de Supabase
  (`sb_secret_…` o `service_role`), la URL de la base de datos ni ninguna
  variable `GYNFEM_*` del backend. Viven solo en Render.
- Solo existen esas tres variables y solo se leen en `lib/server/env.ts` y
  `next.config.ts`. Añadir otra, o una `NEXT_PUBLIC_`, exige una decisión
  explícita y actualizar la prueba.
- `next.config.ts` valida al compilar que las dos URL sean orígenes exactos
  (https, host en minúsculas, sin ruta, barra final, credenciales ni
  comodines). Si no lo son, **la compilación falla** y el error nombra la
  variable sin mostrar su valor. Vercel mantiene entonces el despliegue
  anterior.
- Sin variables (una vista previa), la aplicación compila y carga, pero el BFF
  responde 503 `not_configured` a todo: no puede llegar a la API.

## 3. Cabeceras de seguridad

Se definen en `lib/security-headers.ts` y `next.config.ts` las aplica a todas
las rutas. Así funcionan igual con `next start` en local que en Vercel, y una
prueba impide que se pierdan (`tests/unit/security-headers.test.ts`).

| Cabecera | Valor | Motivo |
| --- | --- | --- |
| `Content-Security-Policy` | Ver abajo | Limita de dónde se cargan y a dónde se conectan los recursos |
| `X-Frame-Options` | `DENY` | Impide incrustar la app en marcos (*clickjacking*), también en navegadores sin `frame-ancestors` |
| `X-Content-Type-Options` | `nosniff` | El navegador no adivina el tipo de contenido |
| `Referrer-Policy` | `no-referrer` | Nunca se envía la URL de origen. CORS usa `Origin`, así que no afecta a la API |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` | La app no usa ninguna de esas capacidades |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Solo HTTPS durante dos años. Sin `preload`: no aplica a `*.vercel.app` |
| `Cross-Origin-Opener-Policy` | `same-origin` | Aísla la ventana de otras pestañas |
| `X-Robots-Tag` | `noindex, nofollow` | Una herramienta clínica no aparece en buscadores |

**Comprobado en vivo (Fase 14, vista previa):** un `iframe` del mismo origen con
la app a 1024 px quedó bloqueado, con un documento de error inaccesible, mientras
que un `iframe` de control con `srcdoc` sí era accesible. `X-Frame-Options: DENY`
y `frame-ancestors 'none'` impiden incrustar la app incluso desde su propio
origen. En consecuencia, las comprobaciones de ancho de pantalla se hacen
redimensionando la ventana, nunca con un marco.

Además, `poweredByHeader: false` quita `X-Powered-By: Next.js`, y
`productionBrowserSourceMaps: false` evita publicar el código fuente.

**Política de seguridad de contenido (CSP), en producción:**

```text
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self'; connect-src 'self';
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
upgrade-insecure-requests
```

- **`connect-src 'self'` (Fase 15).** El navegador solo llama a su propio
  origen: a Render y a Supabase los llama el servidor (BFF). La CSP ya no
  depende de ninguna variable, y es la misma en producción y en vistas previas.
- **Por qué `'unsafe-inline'` en `script-src`:** Next inserta en línea sus
  scripts de arranque. La página es estática y no puede llevar un *nonce*,
  porque los nonces obligan a renderizar en cada petición. La alternativa con
  hashes (SRI) es experimental en Next 16. Se mitiga porque la app no inyecta
  HTML (`dangerouslySetInnerHTML`; lo vigila `tests/unit/phase15-guards.test.ts`)
  y React escapa el contenido. **Revisado en la Fase 15:** se mantiene, pero
  el riesgo que justificaba revisarlo —un token de sesión al alcance de un
  script inyectado— ya no existe: el token vive en cookies `httpOnly`.
- En `next dev` se añade `'unsafe-eval'`, que React necesita para depurar, y
  se omite `upgrade-insecure-requests`, porque `next dev` sirve por
  `http://localhost`. Nunca en producción. `next start` en local sí la envía;
  si un navegador (Safari) fuerza https contra localhost, verifica con Chrome.

## 4. Configurar el proyecto en Vercel (una vez)

**Requisitos:** la cuenta dueña del proyecto (Sección 1) y que la GitHub App de
Vercel tenga acceso al repositorio `gynfem-frontend` (GitHub → *Settings →
Applications → Vercel → Repository access*).

El proyecto ya existe y está conectado a `main`. Para reproducirlo desde cero:
*Add New → Project*, importar el repositorio de GitHub y aceptar el
framework detectado. Los nombres de los menús pueden variar ligeramente entre
versiones del panel.

1. **Settings → Build and Deployment.** Framework: Next.js. Los comandos de
   instalación (`npm ci`) y de compilación (`npm run build`) vienen de
   `vercel.json`, y la versión de Node (24.x) de `package.json` → `engines`.
   El panel los muestra como definidos por el proyecto; no se cambian ahí.
2. **Settings → Environment Variables.** Crear las tres variables de la
   Sección 2 marcando **solo Production**. Se pegan los valores directamente
   en el panel.
   **Settings → Functions.** Fluid Compute activo y, tras el primer despliegue
   de la Fase 15, *Function Region* = `pdx1` (lo fija `vercel.json`; Sección 11.3).
3. **Settings → Deployment Protection.** «Standard Protection» con **Vercel
   Authentication** activado. Sin *Protection Bypass for Automation*, sin
   *Shareable Links* y sin excepciones.
4. **Deployment Retention:** en Hobby viene activa por defecto y **no se puede
   configurar a mano** (comprobado en la Fase 14). Por eso el borrado de las
   vistas previas tras fusionar es manual (Sección 5, punto 4). En un plan de
   pago: *Settings → Security → Deployment Retention*, vistas previas al mínimo.
5. **Settings → Git.** Rama de producción: `main`.
6. **Deployments → Redeploy** del último despliegue de producción, para que
   compile con las variables.

## 5. Vistas previas (política)

**Riesgo.** Cada rama genera un despliegue con una URL que puede adivinar
cualquiera que vea el repositorio. En un sistema clínico, una vista previa
pública con datos reales o con acceso a la API sería una fuga.

**Política:**

1. **Standard Protection con Vercel Authentication.** Según la documentación
   de Vercel, protege **todos los despliegues salvo los dominios de
   producción**: vistas previas, URLs de rama y la URL única de cada
   despliegue, incluso de los de producción. Solo entra una cuenta de Vercel
   con acceso al proyecto. En Hobby no hay protección con contraseña; «All
   Deployments» también bloquearía producción, que debe ser pública.
2. **Variables solo en Production.** Una vista previa se compila sin la
   dirección de la API ni la de Supabase: su BFF responde 503
   `not_configured` y no puede llegar a ningún dato.
3. **CORS del backend con un solo origen**: el dominio de producción
   (Sección 8). Desde la Fase 15 el navegador ya no llama a la API (lo hace
   el BFF, de servidor a servidor), así que CORS no interviene; se mantiene
   cerrado a un solo origen como defensa adicional.
4. **Tras fusionar una rama**, borrar sus despliegues de vista previa:
   *Deployments* → filtrar por la rama → *Delete* en cada uno. Que el panel
   diga «No Active Branches» solo significa que ya no hay alias de rama: los
   despliegues siguen existiendo con su URL única hasta que se borran o los
   elimina la política de retención.

**Comprobación:** abrir la URL de una vista previa en una ventana de
incógnito. Debe pedir iniciar sesión en Vercel.

## 6. Verificación posterior al despliegue

Repetible y de solo lectura, tras cada despliegue de producción.

**Antes de ejecutarla, espera a que el despliegue figure como completado**
(Vercel → *Deployments*: estado *Ready*, marcado como *Current* en producción).
Mientras se construye, el dominio sigue sirviendo el despliegue anterior, y el
guion mediría ese. Si un resultado no cuadra con un cambio recién hecho,
comprueba primero la hora a la que terminó el despliegue antes de tocar ninguna
configuración.

```bash
npm run verify:deployment -- https://gynfem-frontend.vercel.app
```

El guion (`scripts/verify-deployment.ts`, con la lógica probada en
`lib/deployment-checks.ts`) termina con código 1 si falla cualquier
comprobación:

| Comprobación | Qué exige |
| --- | --- |
| se sirve por HTTPS | La URL verificada es `https` |
| HTTP redirige a HTTPS | `http://` responde 301/308 hacia `https://` del mismo host |
| **dominio de producción público (sin login de Vercel)** | `GET /` responde 200 sin redirigir a `vercel.com`/`sso-api`, sin 401/403, sin cookie `_vercel_jwt` y sin la página de Vercel Authentication. Es el requisito central de la fase: producción es pública |
| cabecera X-Frame-Options … X-Robots-Tag | Cada cabecera de la Sección 3 con su valor exacto |
| sin X-Powered-By / Server sin versión | No se anuncian el framework ni versiones |
| CSP presente, `default-src 'self'`, `base-uri 'self'`, sin comodines, sin `'unsafe-eval'`, `frame-ancestors 'none'`, `object-src 'none'` | La política de la Sección 3 |
| CSP connect-src exacto | Exactamente `connect-src 'self'`: el navegador no llama a ningún otro origen |
| sin banner de datos simulados | El modo simulado ya no existe (Fase 15) |
| ninguna pantalla clínica sin sesión | El HTML inicial no contiene ninguna pantalla clínica |
| `/api/session` y `/api/v1/prediction/schema` sin sesión | 401 `not_authenticated` con el formato uniforme, `Cache-Control: no-store` y sin fijar cookies. Con `--local` y sin variables se admite 503 `not_configured` |
| paquete servido sin secretos | Ni el HTML inicial (con la carga RSC en línea) ni ningún script de `/_next/static` que referencie contiene `sb_secret_`, `service_role`, `postgres(ql)://`, variables `GYNFEM_*` ni JWT con rol distinto de `anon`. Los hallazgos se muestran recortados |
| sin mapas de código publicados | Ningún `.js.map` responde 200 |
| ruta inexistente responde 404 / errores sin trazas ni rutas internas | La 404 no contiene `node_modules`, rutas de disco, rutas de compilación de Vercel ni líneas de traza |

**En local** (antes de publicar una rama), contra `npm run build && npm run start`:

```bash
npm run verify:deployment -- http://localhost:3000 --local
```

`--local` omite las comprobaciones que exigen HTTPS y Vercel.

Las cabeceras exigidas están escritas en `lib/deployment-checks.ts`, no se
leen del generador: si una cabecera desaparece de `lib/security-headers.ts`, el
guion sigue exigiéndola. Una prueba comprueba que ambas listas coinciden.

**Además, a mano en el navegador:** que no haya violaciones de la CSP en la
consola, recorrer el guion de la Sección 12 con las cuentas de verificación, y
revisar el ancho de tableta (768 px y 1024 px) **redimensionando la ventana**,
nunca con un `iframe`, porque la app no se deja incrustar (Sección 3). En una
vista previa, la consola mostrará además que la CSP bloquea la barra de
herramientas de Vercel (`vercel.live`). Es esperado y no es un fallo de la app.

## 7. Qué ve un visitante sin sesión

- Las rutas son `/` (estática), la 404 y las del BFF (`/api/session`,
  `/api/wake`, `/api/v1/*`), dinámicas.
- Un visitante ve **solo** la pantalla de inicio de sesión. Las pantallas
  clínicas son estado de React **sin URL propia**.
- Sin cookies de sesión, `/api/session` y `/api/v1/*` responden 401. La única
  ruta del BFF que responde sin sesión es `/api/wake`, que solo consulta
  `/health` del backend (pública, sin datos).
- El **código** de todas las pantallas viaja en el JavaScript que descarga
  cualquier visitante, como en toda aplicación de página única. Por eso
  ocultar pantallas no es una barrera: los datos solo los sirve la API tras
  verificar el token y el rol en cada petición.

## 8. CORS en Render (una vez, tras el primer despliegue verificado)

El backend solo acepta peticiones del navegador desde los orígenes de
`GYNFEM_CORS_ORIGINS`. Hasta la Fase 14 vale `https://gynfem-frontend.invalid`,
que cierra CORS (`gynfem-backend/docs/DEPLOYMENT.md`, Sección 7.3).

> **Fase 15:** el navegador ya no llama a la API; lo hace el BFF de servidor
> a servidor, donde CORS no aplica. `GYNFEM_CORS_ORIGINS` se queda como está.

1. **Cuándo:** con el dominio de producción ya verificado (Sección 6) y antes
   de empezar la Fase 15.
2. **Qué:** en Render → servicio `gynfem-api` → *Environment*, cambiar
   `GYNFEM_CORS_ORIGINS` por **exactamente** el dominio de producción:
   `https://gynfem-frontend.vercel.app`, con `https://`, en minúsculas y **sin barra
   final**. Un solo origen: ni vistas previas, ni la URL única de un
   despliegue, ni comodines (el backend los rechaza al arrancar). Guardar con
   la opción que **también despliega**: con «Save only» el valor queda en el
   panel, pero el servicio sigue con el anterior.
3. **Esperar:** Render → `gynfem-api` → *Events* debe mostrar un despliegue
   **posterior al cambio** con estado *Deploy live*. Si aparece *Deploy failed*,
   el valor no pasó la validación del backend y Render mantiene la versión
   anterior: en *Logs*, `Configuración inválida` nombra la variable y el
   motivo (espacios, barra final, mayúsculas, comillas).
4. **Comprobar**, con tres orígenes:

   ```bash
   API=https://gynfem-api.onrender.com
   for ORIGIN in https://gynfem-frontend.vercel.app https://gynfem-frontend.invalid https://<url-de-una-vista-previa>.vercel.app; do
     echo "== $ORIGIN"
     curl -s -D - -o /dev/null -X OPTIONS "$API/api/v1/health" -H "Origin: $ORIGIN" -H "Access-Control-Request-Method: GET" | grep -iE "^HTTP|^access-control-allow-origin"
   done
   ```

   | `Origin` | Resultado correcto |
   | --- | --- |
   | `https://gynfem-frontend.vercel.app` (producción) | `200` y `access-control-allow-origin: https://gynfem-frontend.vercel.app` |
   | `https://gynfem-frontend.invalid` (**control negativo**: el valor anterior) | `400 Disallowed CORS origin`. **Si responde 200, el cambio no se aplicó:** el servicio sigue con la configuración antigua, aunque el panel muestre la nueva. Vuelve al paso 3 |
   | Una vista previa | `400 Disallowed CORS origin` |

   En el plan Free de Render, la primera petición puede tardar alrededor de un
   minuto mientras el servicio arranca.

## 9. Revertir

El paso 1 solo lo puede hacer la cuenta dueña del proyecto en Vercel
(Sección 1). Si no está disponible, queda únicamente el paso 2: revertir en
`main`, lo que redespliega en unos minutos.

1. **Inmediato:** en Vercel → *Deployments*, elegir el último despliegue de
   producción bueno → *Instant Rollback*, o *Promote to Production* si el panel
   lo muestra así. La reversión es inmediata y no recompila.
2. **Después:** revertir el commit en `main` con un pull request
   (`git revert <commit>`). Sin ese paso, el siguiente commit en `main` vuelve a
   desplegar el cambio malo.
3. Ejecutar la verificación (Sección 6) sobre el dominio de producción.
4. Si el cambio tocó variables de entorno: restaurar su valor en Vercel y
   volver a desplegar, porque las variables se fijan al compilar.

## 10. Riesgos abiertos

| Riesgo | Estado |
| --- | --- |
| Login simulado sin autenticación real | **Cerrado en la Fase 15**: autenticación real con Supabase Auth y RBAC del backend |
| `'unsafe-inline'` en `script-src` | Aceptado. Revisado en la Fase 15: el token ya no es legible por JavaScript (Sección 3) |
| Datos clínicos y contraseña en tránsito por las funciones de Vercel | Aceptado con el BFF (Sección 11.1). No se guardan ni se registran (`tests/unit/phase15-guards.test.ts` prohíbe `console.*`). Revisar antes de datos reales (Fase 17) |
| **Contraseña temporal sin cambio obligatorio** (deuda de seguridad) | **Abierto; a cerrar antes de la Fase 18.** El administrador fija la contraseña al crear la cuenta y el usuario no está obligado a cambiarla ni tiene pantalla para hacerlo. `gynfem-backend/docs/SECURITY.md` §2.3 («Riesgos residuales») asigna ese cambio al frontend (`updateUser`). Quedó fuera de la Fase 15 |
| Dos pestañas refrescan la sesión a la vez | Aceptado. Supabase rota el *refresh token*; si una pestaña pierde la carrera, pide reingresar sin perder lo escrito |
| Vistas previas huérfanas tras fusionar | Mitigado por la protección; su borrado es manual (Sección 5) |
| La versión de Next queda visible en el cliente (`window.next.version`) | Aceptado. Lo publica el propio Next en su código de arranque y no se puede quitar sin parchearlo. Sí se eliminan `X-Powered-By` y la versión en `Server` (Decisión 6) |
| Una sola persona controla Vercel | Aceptado en Hobby (Sección 1). Configuración, vistas previas e *Instant Rollback* dependen de la cuenta dueña; revertir en `main` no |
| Hobby es para uso personal y no comercial | Revisar antes de uso clínico real (Fase 17): puede exigir un plan de pago |
| `next dev` reescribe parte de `CLAUDE.md` | Solo el bloque entre los marcadores `nextjs-agent-rules`; conserva el resto, también con saltos de línea CRLF. Comprobado arrancando `next dev` de verdad con Next 16.3.6, y lo vigila `tests/integration/agent-rules.test.ts` (dos arranques reales). Las reglas del proyecto van fuera de los marcadores. No debe existir `AGENTS.md` (está en `.gitignore` de forma permanente): si existe **con** los marcadores, Next mantiene el bloque allí y deja de actualizar el de `CLAUDE.md` sin avisar; un `AGENTS.md` **sin** marcadores no cambia nada. En ningún caso se tocan las reglas de fuera del bloque. Detalle en la advertencia de `CLAUDE.md` |

## 11. Integración con la API (Fase 15)

### 11.1 Sesión: BFF con cookies httpOnly

El navegador solo habla con su propio origen. Los Route Handlers de `app/api/`
(lógica en `lib/server/`) reenvían a Supabase Auth y a la API de Render.

| Ruta del BFF | Qué hace |
| --- | --- |
| `POST /api/session` | Inicia sesión en Supabase Auth, pregunta el rol a `GET /me` y fija las cookies |
| `GET /api/session` | Restaura la sesión al recargar: `{id, role, email}` |
| `DELETE /api/session` | Revoca la sesión en Supabase y borra las cookies |
| `GET /api/wake` | Despierta el backend (`/health`), sin credenciales |
| `/api/v1/*` | Reenvía a la API **solo** las rutas de `lib/server/allowed-routes.ts` |

- **Cookies:** `__Host-gf_at` (token de acceso, caduca con él) y `__Host-gf_rt`
  (refresco, de sesión: se pierde al cerrar el navegador). Ambas `HttpOnly`,
  `Secure`, `SameSite=Strict`, `Path=/`. En `http://localhost` se llaman
  `gf_at` y `gf_rt`, sin `Secure`.
- **Por qué no en memoria ni en `localStorage`:** un token legible por
  JavaScript queda al alcance de cualquier script inyectado, y la CSP mantiene
  `'unsafe-inline'`. Con cookies `httpOnly` no hay token que robar, y la sesión
  sobrevive a recargar la página.
- **CSRF:** `SameSite=Strict`, más `Origin` igual al host y la cabecera
  `X-GynFem-Request` en toda escritura (`lib/server/csrf.ts`).
- **Refresco:** lo hace el BFF **antes** de reenviar, cuando al token le
  quedan menos de 60 s. Ninguna petición se repite por un token caducado.
- **Supabase:** tres llamadas REST con `fetch` y 10 s de límite, sin
  `supabase-js` (reintenta por su cuenta con esperas que no se pueden acotar).
- **401:** el BFF borra las cookies y la interfaz pide reingresar **encima**
  de la pantalla actual, que conserva lo escrito. Si reingresa otro usuario,
  se descarta.
- **403:** «No tienes permiso para esta operación», sin decir si el recurso
  existe.

### 11.2 Tiempos de espera y reintentos

Anclados a las latencias medidas en `gynfem-backend/docs/DEPLOYMENT.md` §7.8 y
§7.10 (arranque en frío de hasta 53.1 s, ≈0.9 s por transacción, escrituras
clínicas de 1–3 s).

| Petición | BFF → Render | Navegador → BFF | `maxDuration` | Ancla |
| --- | --- | --- | --- | --- |
| Despertar (`/api/wake`) | 70 s | 75 s | 90 s | 53.1 s × 1.3 |
| Lectura | 15 s | 20 s | 60 s | Peor caso del backend antes de su propio 503: 5 s + 5 s + 5 s |
| Escritura | 30 s | 35 s | 60 s | El doble de ese peor caso |

- **Arranque en frío.** Al abrir la aplicación se llama a `/api/wake` mientras
  el usuario escribe sus credenciales. Si tarda más de 2 s se muestra
  «Iniciando el servicio. Puede tardar hasta un minuto…» como estado, nunca
  como error. Tras 14 min sin respuestas (Render suspende a los 15), toda
  petición despierta primero.
- **Lecturas** (GET, la búsqueda de pacientes y `/predict`): dos reintentos, a
  1 s y 3 s, ante fallo de red, espera agotada, 502, 503 o 504.
- **Escrituras: nunca se reintentan solas.** Ante un 503 no se guardó nada: se
  conservan los valores y el reintento es manual. Ante un fallo de red o una
  espera agotada el resultado es desconocido: se dice y se manda a comprobarlo.
- **Esquema de predicción:** caché en memoria de 10 min. Sin esquema, el
  formulario no existe: no se evalúa sin rangos. Un 422 en un campo que la
  interfaz dio por válido invalida la caché.
- Cada petición lleva un `X-Request-ID` aleatorio, que se muestra como
  «Código de referencia» en los errores para buscarlo en los logs de Render.

### 11.3 Región de las funciones: `pdx1`

Render está en Oregon y las funciones de Vercel nacieron en `iad1`
(Washington, D. C.): cada petición cruzaba el país dos veces. `vercel.json`
fija `"regions": ["pdx1"]` (Portland, Oregon), la región de Vercel junto a
Render. El plan Hobby admite una sola región. Supabase sigue en São Paulo: ese
salto lo hace el backend, no el BFF, salvo al iniciar o refrescar la sesión.

Se aplica sola con el primer despliegue de la rama. **Comprobación:** Vercel →
*Settings → Functions → Function Region* debe mostrar `pdx1`, y en el
despliegue, *Resources → Functions*, la región `pdx1`.

**Límite de duración.** El plan Hobby admite 300 s por función con Fluid
Compute (documentación de Vercel, 2026-08-24), activo en este proyecto
(confirmado en el panel por el responsable). El despertar usa como mucho 90 s.

### 11.4 Requisito para la Fase 16

**Historial, reportes y métricas deben excluir a las pacientes dadas de baja**
(`deleted_at IS NOT NULL`) y sus mediciones y predicciones. La base de
producción contiene pacientes sintéticas de verificación dadas de baja
(Sección 12.3): si un reporte las contara, mezclaría datos de prueba con datos
reales.

## 12. Verificación extremo a extremo contra producción

Con credenciales: la ejecuta la persona responsable, con las dos cuentas de
verificación (rol médico y rol administrador). Nunca con datos reales.

### 12.1 Datos sintéticos

| Dato | Valor | Por qué es inequívocamente ficticio |
| --- | --- | --- |
| Tipo y número de documento | `PASAPORTE` · `FICTICIOF15A` | Un DNI son 8 dígitos y cualquier combinación puede pertenecer a alguien. Este número son letras que dicen «ficticio»: ningún pasaporte se numera así, y el backend lo acepta (4–20 caracteres alfanuméricos) |
| Nombres y apellidos | `Paciente Ficticia` · `Sintetica Fquince` | Lo declaran en el propio texto. El backend no admite dígitos en un nombre |
| Usuario de prueba | `usuario.sintetico.f15@gynfem.test` | `.test` es un dominio reservado (RFC 2606) |

### 12.2 Limpieza: baja lógica, nunca borrado físico

La base prohíbe el borrado físico con los triggers `*_forbid_delete`, y **no
se desactivan**. Tras cada verificación:

- **Pacientes sintéticas:** baja lógica con `DELETE /patients/{id}` desde la
  propia interfaz («Dar de baja»). Dejan de aparecer en búsquedas y consultas;
  sus mediciones y predicciones se conservan, inaccesibles por la API.
- **Usuario sintético:** desactivado desde la interfaz. Ni su perfil ni su
  cuenta de Supabase se borran.
- **`audit_log`:** intacto. Sus filas de prueba se identifican por el actor
  (las cuentas de verificación) y la ventana horaria de la tabla siguiente.
- El borrado físico con triggers desactivados queda **descartado**, salvo
  aprobación explícita en una fase posterior.

### 12.3 Registro de datos sintéticos en producción

Una fila por verificación. Los identificadores son UUID opacos.

| Fecha (UTC) | Ventana horaria | Actor | Pacientes sintéticas (id) | Usuario sintético (id) | Estado |
| --- | --- | --- | --- | --- | --- |
| _pendiente: se rellena al ejecutar la verificación de la Fase 15_ | | | | | |
