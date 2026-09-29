# gynfem-frontend

Interfaz de GynFem, herramienta de apoyo a la decisión clínica para consultorios
ginecológicos. El backend vive en el repositorio `gynfem-backend`.

- **Producción:** Vercel, desde `main`. Dominio y procedimiento completo en
  [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
- **Reglas del repositorio** (también para agentes): [`CLAUDE.md`](CLAUDE.md).

## Modo simulado

La aplicación **no está conectada a ningún backend**. Todo lo que muestra sale de
`services/clinical.ts`: pacientes, usuarios, rangos clínicos y un cálculo de
riesgo de ejemplo que **no es el modelo real**. El banner "DATOS SIMULADOS" es
obligatorio mientras sea así (lo protege una prueba).

- Todos los datos son **evidentemente ficticios**, porque el despliegue es
  público: documentos de ceros, nombres que dicen «Ficticia» o «Ejemplo» y
  correos en el dominio reservado `.test` (`tests/unit/simulated-data.test.ts`).
- El rol se deduce del correo (`resolveSimulatedRole`): si contiene "admin" es
  Administrador. **Solo vale en modo simulado.** En la Fase 15 el rol vendrá de
  `GET /api/v1/me` y esa función se elimina.
- Los rangos clínicos están escritos a mano. En la Fase 15 saldrán de
  `GET /api/v1/prediction/schema` (`gynfem-backend/docs/API_SPEC.md`, Sección 2.4).
- Las evaluaciones no se guardan en ninguna ficha.
- Ningún dato real de pacientes entra al sistema hasta la Fase 17.

## Requisitos previos

- Node.js 24 (fijado en `package.json` → `engines`) y npm.
- Para desplegar: la cuenta de Vercel dueña del proyecto (plan Hobby, sin
  miembros: nadie más puede configurarlo ni revertir desde el panel) y acceso al
  repositorio de GitHub
  (`docs/DEPLOYMENT.md`, Sección 4).

## Ejecutar en local

```bash
npm ci
npm run dev            # http://localhost:3000
```

Credenciales de prueba: cualquier contraseña no vacía. `admin@gynfem.test` entra
como Administrador; cualquier otro correo, como Médico.

En esta fase no hace falta ninguna variable de entorno. Para probar la política
de seguridad de contenido con orígenes reales, copia `.env.example` a
`.env.local` (nunca se versiona) y rellénalo.

## Variables de entorno

Solo existen tres, todas **públicas**: el navegador las recibe copiadas en el
JavaScript. Ninguna clave secreta puede llevar el prefijo `NEXT_PUBLIC_`.

| Variable | Para qué |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Origen de la API (Render) |
| `NEXT_PUBLIC_SUPABASE_URL` | Proyecto de Supabase (autenticación, Fase 15) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable de Supabase (`sb_publishable_…`) |

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
npm run verify:deployment -- https://<dominio-de-produccion> --connect <origen-api>,<origen-supabase>
```

Comprueba HTTPS, que producción sea pública sin login de Vercel, las cabeceras
de seguridad, que el paquete servido no tenga secretos y que los errores no
muestren trazas. Tras fusionar una rama, borra sus vistas previas en Vercel.
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
