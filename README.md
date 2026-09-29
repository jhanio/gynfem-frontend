# gynfem-frontend

Interfaz de GynFem, herramienta de apoyo a la decisión clínica para consultorios
ginecológicos (Fase 13). El backend vive en el repositorio `gynfem-backend`.

## Modo simulado

La aplicación **no está conectada a ningún backend**. Todo lo que muestra sale de
`services/clinical.ts`: pacientes, usuarios, rangos clínicos y un cálculo de
riesgo de ejemplo que **no es el modelo real**. El banner "DATOS SIMULADOS" es
obligatorio mientras sea así (lo protege una prueba).

- El rol se deduce del correo (`resolveSimulatedRole`): si contiene "admin" es
  Administrador. **Solo vale en modo simulado.** En la Fase 15 el rol vendrá de
  `GET /api/v1/me` y esa función se elimina.
- Los rangos clínicos están escritos a mano. En la Fase 15 saldrán de
  `GET /api/v1/prediction/schema` (`gynfem-backend/docs/API_SPEC.md`, Sección 2.4).
- Las evaluaciones no se guardan en ninguna ficha.
- Ningún dato real de pacientes entra al sistema hasta la Fase 17.

## Ejecutar

Requiere Node.js 24.

```bash
npm ci
npm run dev            # http://localhost:3000
```

Credenciales de prueba: cualquier contraseña no vacía. `admin@gynfem.test` entra
como Administrador; cualquier otro correo, como Médico.

## Verificar

```bash
npm run lint
npm run typecheck
npm test               # o npm run test:coverage (mínimo 80 % en services/ y lib/)
npm run build
```

El workflow `.github/workflows/ci.yml` ejecuta los cuatro en cada pull request.

## Protocolo de ramas

- `main` está protegida por el ruleset "main": solo admite cambios por pull
  request, y el job de CI debe pasar.
- **Ninguna rama `v0/*` se fusiona directamente.** Lo que genera v0 entra por un
  PR de revisión propio (como el PR #2), con pruebas y autorrevisión.
- Todas las dependencias van con versión exacta: nunca `latest`, `^` ni `~`
  (lo comprueba `tests/unit/package-versions.test.ts`).
