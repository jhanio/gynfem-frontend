# GynFem frontend — reglas del repositorio

Este archivo se versiona. `next dev` gestiona **solo** el bloque entre los
marcadores `nextjs-agent-rules` (al final): lo actualiza cuando cambia la
versión de Next y conserva todo lo demás. Las reglas del proyecto van fuera de
los marcadores; nunca dentro, porque Next las borraría.

> **ADVERTENCIA — no crear `AGENTS.md`.** Si aparece un `AGENTS.md` **con** los
> marcadores `nextjs-agent-rules` (por ejemplo, copiado de otro proyecto o
> generado con `npx @next/codemod agents-md`), `next dev` mantiene el bloque
> **allí** y deja de actualizar el de este archivo, sin avisar: estas reglas
> siguen intactas, pero la guía de Next de este archivo queda desactualizada.
> Un `AGENTS.md` sin marcadores no cambia nada. Comprobado arrancando
> `next dev` con Next 16.3.6. `/AGENTS.md` está en `.gitignore` de forma
> permanente y `tests/integration/agent-rules.test.ts` falla si existe. Si
> aparece: bórralo y arranca `next dev` para que actualice este bloque.

## Siempre

- La interfaz habla con la **API real** desde la Fase 15. Ya no existe el modo
  simulado: nada de datos de ejemplo en `services/` ni banner «DATOS SIMULADOS».
- **Un solo punto hace peticiones**: `lib/api/client.ts` (navegador) y
  `lib/server/` (BFF). Ningún componente llama a `fetch`; todo pasa por
  `services/` (`tests/unit/phase15-guards.test.ts`).
- **Ningún rango, límite ni umbral clínico se codifica.** Salen de
  `GET /prediction/schema` en tiempo de ejecución. Los nombres de los campos
  clínicos solo aparecen en `lib/clinical-validation.ts` y `lib/field-labels.ts`,
  y esos archivos no contienen ningún número.
- **La sesión vive en cookies `httpOnly`** que fija el BFF. Nunca un token en
  `localStorage`, `sessionStorage` ni en JavaScript. Ningún dato clínico en la
  consola ni en almacenamiento del navegador.
- **Nunca reintentar una escritura** de forma automática. Solo las lecturas
  (`apiRead`) se reintentan; ante un resultado desconocido se manda a comprobar.
- La interfaz nunca decide el rol: viene de `GET /api/v1/me`. Lo que un rol no
  puede hacer no se muestra, pero quien autoriza es el backend.
- La advertencia clínica de la API aparece en **todo** resultado de predicción.
- Todo dato de prueba es **evidentemente ficticio**: nombres que dicen
  «Ficticia/Ficticio/Ejemplo/Sintetica», documentos imposibles y correos en
  `.test` o `.example`. El repositorio es público.
- Nunca pedir, escribir ni registrar contraseñas ni tokens: las comprobaciones
  con credenciales las ejecuta la persona responsable.
- Dependencias con versión exacta: nunca `latest`, `^` ni `~`.
- `main` solo cambia por pull request con CI en verde. Ninguna rama `v0/*` se
  fusiona directamente.
- Antes de dar algo por terminado: `npm run lint`, `npm run typecheck`,
  `npm run test:coverage` (mínimo 80 % en `services/` y `lib/`) y `npm run build`.
- Pruebas antes que implementación (RED → GREEN). Las pruebas no llaman a la
  API real: MSW con `onUnhandledFrame: "error"` (`tests/setup.ts`).

## Despliegue (Fase 14) — `docs/DEPLOYMENT.md`

- **No existe ninguna variable `NEXT_PUBLIC_`** (Fase 15). Next copiaría su
  valor en el JavaScript del navegador. Las tres variables son de **servidor**:
  `API_BASE_URL`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`; solo las leen
  `lib/server/env.ts` y `next.config.ts` (lo fija
  `tests/unit/deployment-config.test.ts`). Añadir otra exige decisión explícita.
- La clave secreta de Supabase, la URL de la base y cualquier `GYNFEM_*` del
  backend **nunca** entran en este repositorio ni en Vercel: viven en Render.
- Nunca escribir, pedir ni mostrar valores reales de variables: solo nombres.
  `.env.example` va sin valores.
- En Vercel, las variables van **solo en el ámbito Production**. Las vistas
  previas no apuntan a datos reales (su BFF responde 503 `not_configured`) y
  están protegidas con Standard Protection (Vercel Authentication).
- Las cabeceras de seguridad y la CSP se definen en `lib/security-headers.ts`
  (vía `next.config.ts`), no en `vercel.json`. `connect-src` es exactamente
  `'self'`: el navegador solo habla con su propio origen. Si algún día debe
  llamar a otro, entra por decisión explícita, nunca con comodín.
- El BFF (`lib/server/`) no es un proxy abierto: solo reenvía las rutas de
  `lib/server/allowed-routes.ts`, que `tests/contract/rbac.test.ts` compara con
  la matriz del backend. No registra nada: por él pasan datos clínicos.
- Las funciones de Vercel corren en `pdx1` (`vercel.json`), junto a Render.
- En la documentación se usa el **dominio de producción** de Vercel, nunca la
  URL única de un despliegue ni de una vista previa.
- Tras cada despliegue de producción: `npm run verify:deployment -- <dominio>`.
  Tras fusionar una rama, borrar sus despliegues de vista previa en Vercel.
- La base no admite borrado físico. Los datos sintéticos de una verificación
  se dan de **baja lógica** por la API y se anotan en `docs/DEPLOYMENT.md`;
  nunca se desactivan los triggers `*_forbid_delete`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
