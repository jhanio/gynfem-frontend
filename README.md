# gynfem-frontend

Interfaz de GynFem, herramienta de apoyo a la decisión clínica para consultorios
ginecológicos. El backend vive en el repositorio `gynfem-backend`.

- **Producción:** Vercel, desde `main`. Dominio y procedimiento completo en
  [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
- **Reglas del repositorio** (también para agentes): [`CLAUDE.md`](CLAUDE.md).

## Cómo funciona

La interfaz habla con la API real de GynFem (`gynfem-backend`, en Render) a
través de un **BFF**: los Route Handlers de `app/api/`, cuya lógica vive en
`lib/server/`. El navegador solo llama a su propio origen.

```text
Navegador ── /api/session, /api/wake, /api/v1/* ──► Vercel (BFF) ──► Supabase Auth
   (cookies httpOnly, sin tokens en JavaScript)            └────────► API en Render
```

- **Sesión.** Supabase Auth emite el token y el BFF lo guarda en dos cookies
  `httpOnly`, `Secure`, `SameSite=Strict`. El rol lo decide el backend
  (`GET /api/v1/me`), nunca la interfaz.
- **Capa de servicios.** `services/` es lo único que usan los componentes;
  `lib/api/client.ts` es el único punto que hace peticiones.
- **Rangos clínicos.** Ningún número está en el código: campos, unidades y
  rangos llegan de `GET /api/v1/prediction/schema`. Sin ese esquema no se
  puede evaluar.
- **Pantallas.** Médico: búsqueda de pacientes (no hay listado general),
  registro, ficha, edición, baja lógica, evaluación, corrección y resultado
  guardado, además de la evaluación rápida sin paciente. Administrador:
  usuarios.
- **Arranque en frío.** El backend (plan Free de Render) duerme tras 15 min
  sin tráfico y tarda hasta ~1 min en despertar: la interfaz lo anuncia como
  «Iniciando el servicio…», nunca como un error.
- Ningún dato real de pacientes entra al sistema hasta la Fase 17.

Decisiones, tiempos de espera y riesgos: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), Sección 11.

## Requisitos previos

- Node.js 24 (fijado en `package.json` → `engines`) y npm.
- Para desplegar: la cuenta de Vercel dueña del proyecto (plan Hobby, sin
  miembros: nadie más puede configurarlo ni revertir desde el panel) y acceso al
  repositorio de GitHub
  (`docs/DEPLOYMENT.md`, Sección 4).

## Ejecutar en local

```bash
npm ci
cp .env.example .env.local   # y rellena las tres variables (nunca se versiona)
npm run dev                  # http://localhost:3000
```

Con las variables apuntando a producción, la aplicación local usa la API y la
base reales: solo con las cuentas de verificación y datos sintéticos
(`docs/DEPLOYMENT.md`, Sección 12). Sin variables, la interfaz carga pero el
BFF responde 503 `not_configured`.

Las pruebas no necesitan variables ni red: MSW simula el BFF, la API y Supabase.

## Variables de entorno

Tres, todas **de servidor**: las lee solo el BFF. No existe ninguna variable
`NEXT_PUBLIC_`, así que ninguna llega al JavaScript del navegador.

| Variable | Para qué |
| --- | --- |
| `API_BASE_URL` | Origen de la API (Render) |
| `SUPABASE_URL` | Proyecto de Supabase (inicio, refresco y cierre de sesión) |
| `SUPABASE_PUBLISHABLE_KEY` | Clave publicable de Supabase (`sb_publishable_…`) |

Formato y justificación de cada una: `.env.example` y `docs/DEPLOYMENT.md`,
Sección 2. En Vercel se configuran **solo con el ámbito Production**. La clave
secreta de Supabase y la URL de la base **nunca** entran aquí ni en Vercel.

## Verificar

```bash
npm run lint
npm run typecheck
npm test               # o npm run test:coverage (mínimo 80 % en services/ y lib/)
npm run build
```

El workflow `.github/workflows/ci.yml` ejecuta los cuatro en cada pull request.

## Desplegar

Cada commit en `main` despliega a producción en Vercel. Las demás ramas generan
vistas previas protegidas con Vercel Authentication. Después de cada despliegue
de producción:

```bash
npm run verify:deployment -- https://<dominio-de-produccion>
```

Comprueba HTTPS, que producción sea pública sin login de Vercel, las cabeceras
de seguridad (con `connect-src 'self'`), que sin sesión el BFF responda 401,
que el paquete servido no tenga secretos y que los errores no muestren trazas. Tras fusionar una rama, borra sus vistas previas en Vercel.
Procedimiento completo: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Revertir

1. Vercel → *Deployments* → último despliegue bueno → *Instant Rollback*
   (inmediato, sin recompilar).
2. Revertir el commit en `main` con un pull request, para que el siguiente
   despliegue no vuelva a publicar el cambio.
3. Volver a ejecutar `npm run verify:deployment`.

Detalle en `docs/DEPLOYMENT.md`, Sección 9.

## Protocolo de ramas

- `main` está protegida por el ruleset "main": solo admite cambios por pull
  request, y el job de CI debe pasar.
- **Ninguna rama `v0/*` se fusiona directamente.** Lo que genera v0 entra por un
  PR de revisión propio (como el PR #2), con pruebas y autorrevisión.
- Todas las dependencias van con versión exacta: nunca `latest`, `^` ni `~`
  (lo comprueba `tests/unit/package-versions.test.ts`).
