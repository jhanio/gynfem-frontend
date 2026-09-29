# DEPLOYMENT — Despliegue del frontend en Vercel

- **Alcance:** cómo está desplegado el frontend, cómo se reproduce la
  configuración, cómo se verifica cada despliegue y cómo se revierte.
- **Fecha:** 2026-09-28 — Fase 14, PR #4.
- **Relación con el backend:** la API vive en Render
  (`gynfem-backend/docs/DEPLOYMENT.md`, Sección 7). En esta fase el frontend
  **no** la llama todavía: publica la interfaz con datos simulados. La
  conexión real llega en la Fase 15.

---

## 1. Estado

| | Valor |
| --- | --- |
| Plataforma | Vercel, plan **Hobby** |
| Dueño y acceso | La cuenta Hobby **personal** del responsable del proyecto (su identificador aparece en las URLs de despliegue). Hobby no admite miembros: **solo esa cuenta** puede cambiar variables y protección, ver las vistas previas y revertir (Sección 9). Traspasarlo exige transferir el proyecto a otra cuenta o pasar a un plan de equipo |
| Dominio de producción | **`https://gynfem-frontend.vercel.app`** (Settings → Domains) |
| Rama de producción | `main`: cada commit en `main` despliega a producción |
| Otras ramas | Generan despliegues de **vista previa**, protegidos (Sección 5) |
| Configuración versionada | `vercel.json` (framework y comandos), `next.config.ts` + `lib/security-headers.ts` (cabeceras), `package.json` → `engines.node` (Node 24) |
| Datos | Solo simulados y evidentemente ficticios (`services/clinical.ts`) |

**Dominio de producción ≠ URL de despliegue.** Vercel da a cada despliegue una
URL única (`<proyecto>-<hash>-<cuenta>.vercel.app`) y además un dominio de
producción estable (*Settings → Domains*). Solo el **dominio de producción**
es público (Sección 5), y es el único que se usa en CORS, en la documentación
y para compartir.

## 2. Variables de entorno

Se configuran en *Settings → Environment Variables*, **solo con el ámbito
Production** (sin Preview ni Development). La plantilla comentada es
`.env.example`; en local se copia a `.env.local`, que nunca se versiona.

| Variable | Pública | Para qué | Formato | Por qué es seguro exponerla |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Sí | Origen de la API. Hoy solo entra en `connect-src` de la CSP; la app la usa en la Fase 15 | `https://<servicio>.onrender.com`, sin ruta ni barra final | Ya es pública en la documentación del backend y visible en cualquier petición de red |
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Autenticación desde el navegador (Fase 15) y `connect-src` | `https://<project-ref>.supabase.co`, sin barra final | Identifica el proyecto pero no da acceso a nada |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave de Supabase Auth para el navegador (Fase 15) | `sb_publishable_…` | Está diseñada para el navegador: RLS impide que llegue a las tablas (`gynfem-backend/docs/SECURITY.md`) |

**De dónde sale cada valor:**

- `NEXT_PUBLIC_API_BASE_URL`: la URL pública del servicio `gynfem-api` en Render
  (Render → `gynfem-api` → cabecera del servicio). Hoy es
  `https://gynfem-api.onrender.com` (`gynfem-backend/docs/DEPLOYMENT.md`, Sección 1).
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase → *Project Settings → Data API* (o
  *API*) → *Project URL*.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase → *Project Settings → API
  Keys* → la clave **publicable** (`sb_publishable_…`), nunca la secreta.

**Reglas (las fija `tests/unit/deployment-config.test.ts`, que recorre todo el
código fuente: `app/`, `components/`, `lib/`, `services/`, `scripts/` y
`next.config.ts`):**

- Toda variable `NEXT_PUBLIC_` se **copia literalmente** en el JavaScript que
  descarga el navegador **al compilar**. Cambiar un valor exige volver a
  desplegar (*Deployments → … → Redeploy*).
- **Nunca** en Vercel ni en este repositorio: la clave secreta de Supabase
  (`sb_secret_…` o `service_role`), la URL de la base de datos ni ninguna
  variable `GYNFEM_*` del backend. Viven solo en Render.
- Solo existen esas tres variables públicas. Añadir otra exige una decisión
  explícita y actualizar la prueba.
- `next.config.ts` valida al compilar que las dos URL sean orígenes exactos
  (https, host en minúsculas, sin ruta, barra final, credenciales ni
  comodines). Si no lo son, **la compilación falla** y el error nombra la
  variable sin mostrar su valor. Vercel mantiene entonces el despliegue
  anterior.

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
img-src 'self' data: blob:; font-src 'self'; connect-src 'self' <API> <SUPABASE>;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
upgrade-insecure-requests
```

- `<API>` y `<SUPABASE>` salen de las variables de la Sección 2 al compilar.
  En las vistas previas no existen, y `connect-src` se queda en `'self'`.
- **Por qué `'unsafe-inline'` en `script-src`:** Next inserta en línea sus
  scripts de arranque. La página es estática y no puede llevar un *nonce*,
  porque los nonces obligan a renderizar en cada petición. La alternativa con
  hashes (SRI) es experimental en Next 16. Se mitiga porque la app no inyecta
  HTML (`dangerouslySetInnerHTML`) y React escapa el contenido. **Se revisa en
  la Fase 15**, antes de que haya tokens de sesión en el navegador.
- En `next dev` se añade `'unsafe-eval'`, que React necesita para depurar, y
  se omite `upgrade-insecure-requests`, porque `next dev` sirve por
  `http://localhost`. Nunca en producción. `next start` en local sí la envía;
  si un navegador (Safari) fuerza https contra localhost, verifica con Chrome.
- **Fase 15:** un origen nuevo que llame el navegador entra en `connect-src`
  mediante variable, nunca con comodín. Las llamadas `fetch` a Render y a
  Supabase Auth ya quedan cubiertas. Si se usa Supabase Realtime hará falta
  `wss://<project-ref>.supabase.co` en `connect-src`, y si se sirven imágenes
  desde Supabase Storage, su origen en `img-src`.

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
   dirección de la API ni la de Supabase, y su CSP solo permite `'self'`.
3. **CORS del backend con un solo origen**: el dominio de producción
   (Sección 8). Aunque una vista previa quedara expuesta, el navegador no
   podría llamar a la API.
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
npm run verify:deployment -- https://gynfem-frontend.vercel.app --connect https://gynfem-api.onrender.com,https://<project-ref>.supabase.co
```

`<project-ref>` es el de `NEXT_PUBLIC_SUPABASE_URL` (Sección 2). Si no lo
tienes a mano, ejecuta el guion sin `--connect`: muestra el `connect-src` real
para compararlo.

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
| CSP connect-src exacto | Solo con `--connect`: `connect-src 'self'` más exactamente esos orígenes |
| banner DATOS SIMULADOS / la raíz sirve el login | El HTML inicial es el login simulado |
| ninguna pantalla clínica sin sesión | El HTML inicial no contiene ninguna pantalla clínica |
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
consola, recorrer el login simulado → Pacientes → ficha → evaluación, y
revisar el ancho de tableta (768 px y 1024 px) **redimensionando la ventana**,
nunca con un `iframe`, porque la app no se deja incrustar (Sección 3). En una
vista previa, la consola mostrará además que la CSP bloquea la barra de
herramientas de Vercel (`vercel.live`). Es esperado y no es un fallo de la app.

## 7. Qué ve un visitante sin sesión

- La única ruta es `/` (más la 404). `next build` lo confirma: `○ /` y
  `○ /_not-found`, ambas estáticas.
- Un visitante ve **solo** la pantalla de inicio de sesión con el banner
  «DATOS SIMULADOS». Las pantallas clínicas son estado de React **sin URL
  propia**: no se llega a ellas escribiendo una dirección.
- **Riesgo aceptado hasta la Fase 15:** el login simulado acepta cualquier
  correo con cualquier contraseña. Cualquiera puede «entrar» y ver pantallas
  clínicas, siempre con datos evidentemente ficticios
  (`tests/unit/simulated-data.test.ts`). Lo que protege hoy no es la sesión,
  sino que no hay datos reales ni API conectada. La autenticación real llega
  en la Fase 15.
- Aunque no tengan URL, el **código** de todas las pantallas viaja en el
  JavaScript que descarga cualquier visitante, como en toda aplicación de
  página única. Por eso la seguridad de la Fase 15 no puede depender de ocultar
  pantallas: los datos solo los debe servir la API tras verificar la sesión.

## 8. CORS en Render (una vez, tras el primer despliegue verificado)

El backend solo acepta peticiones del navegador desde los orígenes de
`GYNFEM_CORS_ORIGINS`. Hasta la Fase 14 vale `https://gynfem-frontend.invalid`,
que cierra CORS (`gynfem-backend/docs/DEPLOYMENT.md`, Sección 7.3).

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
| Login simulado sin autenticación real | Aceptado hasta la Fase 15 (Sección 7) |
| `'unsafe-inline'` en `script-src` | Aceptado; revisar nonces o SRI en la Fase 15 |
| Vistas previas huérfanas tras fusionar | Mitigado por la protección; su borrado es manual (Sección 5) |
| La versión de Next queda visible en el cliente (`window.next.version`) | Aceptado. Lo publica el propio Next en su código de arranque y no se puede quitar sin parchearlo. Sí se eliminan `X-Powered-By` y la versión en `Server` (Decisión 6) |
| Una sola persona controla Vercel | Aceptado en Hobby (Sección 1). Configuración, vistas previas e *Instant Rollback* dependen de la cuenta dueña; revertir en `main` no |
| Hobby es para uso personal y no comercial | Revisar antes de uso clínico real (Fase 17): puede exigir un plan de pago |
| `next dev` reescribe parte de `CLAUDE.md` | Solo el bloque entre los marcadores `nextjs-agent-rules`; conserva el resto, también con saltos de línea CRLF. Comprobado arrancando `next dev` de verdad con Next 16.3.6, y lo vigila `tests/integration/agent-rules.test.ts` (dos arranques reales). Las reglas del proyecto van fuera de los marcadores. No debe existir `AGENTS.md` (está en `.gitignore` de forma permanente): si existe **con** los marcadores, Next mantiene el bloque allí y deja de actualizar el de `CLAUDE.md` sin avisar; un `AGENTS.md` **sin** marcadores no cambia nada. En ningún caso se tocan las reglas de fuera del bloque. Detalle en la advertencia de `CLAUDE.md` |
