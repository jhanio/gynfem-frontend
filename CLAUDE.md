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

- Toda la interfaz está en **modo simulado** hasta la Fase 15: los datos salen
  de `services/clinical.ts`. El banner «DATOS SIMULADOS» es obligatorio.
- Todo dato simulado es **evidentemente ficticio**: documentos de ceros,
  nombres que dicen «Ficticia/Ficticio/Ejemplo» y correos en `.test`
  (`tests/unit/simulated-data.test.ts`). El despliegue es público.
- La interfaz nunca decide el rol por su cuenta. `resolveSimulatedRole` existe
  solo en modo simulado y desaparece en la Fase 15 (`GET /api/v1/me`).
- Dependencias con versión exacta: nunca `latest`, `^` ni `~`.
- `main` solo cambia por pull request con CI en verde. Ninguna rama `v0/*` se
  fusiona directamente.
- Antes de dar algo por terminado: `npm run lint`, `npm run typecheck`,
  `npm run test:coverage` (mínimo 80 % en `services/` y `lib/`) y `npm run build`.
- Pruebas antes que implementación (RED → GREEN).

## Despliegue (Fase 14) — `docs/DEPLOYMENT.md`

- **Nada secreto con prefijo `NEXT_PUBLIC_`.** Next copia esas variables en el
  JavaScript del navegador. Solo existen tres públicas:
  `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (lo fija
  `tests/unit/deployment-config.test.ts`). Añadir otra exige decisión explícita.
- La clave secreta de Supabase, la URL de la base y cualquier `GYNFEM_*` del
  backend **nunca** entran en este repositorio ni en Vercel: viven en Render.
- Nunca escribir, pedir ni mostrar valores reales de variables: solo nombres.
  `.env.example` va sin valores.
- En Vercel, las variables van **solo en el ámbito Production**. Las vistas
  previas no apuntan a datos reales y están protegidas con Standard
  Protection (Vercel Authentication).
- Las cabeceras de seguridad y la CSP se definen en `lib/security-headers.ts`
  (vía `next.config.ts`), no en `vercel.json`. Un origen nuevo que llame el
  navegador (Fase 15) entra en `connect-src` por variable, nunca con comodín.
- En CORS del backend y en la documentación se usa el **dominio de
  producción** de Vercel, nunca la URL única de un despliegue ni de una vista
  previa.
- Tras cada despliegue de producción: `npm run verify:deployment -- <dominio>`
  (y `--connect` con los orígenes esperados). Tras fusionar una rama, borrar
  sus despliegues de vista previa en Vercel.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
