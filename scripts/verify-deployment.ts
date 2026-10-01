// Verificación posterior al despliegue (docs/DEPLOYMENT.md, Sección 6).
//
//   npm run verify:deployment -- https://<dominio-de-produccion>
//   npm run verify:deployment -- http://localhost:3000 --local
//
// --local: contra `next start`; omite las comprobaciones que exigen HTTPS y Vercel.
// Desde la Fase 15 connect-src debe ser exactamente 'self' (el navegador solo
// habla con su propio origen), así que ya no hay orígenes que pasar.
// Termina con código 1 si alguna comprobación falla. Solo lee: no envía datos.

import {
  type Check,
  checkContentSecurityPolicy,
  checkSecurityHeaders,
  checkAnonymousContent,
  checkAnonymousSession,
  extractScriptUrls,
  findBundleSecrets,
  findTraceLeaks,
  isVercelLoginWall,
} from "../lib/deployment-checks.ts"

const USAGE = "Uso: npm run verify:deployment -- <url> [--local]"

function parseArgs(argv: string[]) {
  const [target, ...rest] = argv
  if (!target) throw new Error(USAGE)
  const base = new URL(target)
  if (base.pathname !== "/" || base.search) throw new Error("La URL debe ser solo el origen, sin ruta.")
  return { base: base.origin, isLocal: rest.includes("--local") }
}

async function verifyHttps(base: string): Promise<Check[]> {
  const url = new URL(base)
  const checks: Check[] = [{ name: "se sirve por HTTPS", ok: url.protocol === "https:", detail: url.protocol }]
  const http = await fetch(`http://${url.host}/`, { redirect: "manual" })
  const location = http.headers.get("location") ?? ""
  checks.push({
    name: "HTTP redirige a HTTPS",
    ok: [301, 308].includes(http.status) && location.startsWith(`https://${url.host}/`),
    detail: `${http.status} → ${location || "sin Location"}`,
  })
  return checks
}

async function verifyPublicDomain(base: string): Promise<{ checks: Check[]; html: string; headers: Headers }> {
  const response = await fetch(`${base}/`, { redirect: "manual" })
  const html = await response.text()
  const wall = isVercelLoginWall(response.status, response.headers, html)
  return {
    html,
    headers: response.headers,
    checks: [
      { name: "dominio de producción público (sin login de Vercel)", ok: !wall && response.status === 200, detail: `${response.status}${wall ? ", muro de Vercel Authentication" : ", acceso anónimo"}` },
    ],
  }
}

async function verifyBundle(base: string, html: string): Promise<Check[]> {
  const scripts = extractScriptUrls(html, base)
  // El HTML inicial también cuenta: lleva en línea la carga RSC y los scripts de arranque.
  const findings: string[] = findBundleSecrets(html).map((f) => `HTML inicial: ${f}`)
  const exposedMaps: string[] = []
  for (const script of scripts) {
    findings.push(...findBundleSecrets(await (await fetch(script)).text()).map((f) => `${new URL(script).pathname}: ${f}`))
    const map = await fetch(`${script}.map`, { redirect: "manual" })
    if (map.status === 200) exposedMaps.push(new URL(script).pathname)
  }
  return [
    { name: "paquete servido sin secretos", ok: scripts.length > 0 && findings.length === 0, detail: scripts.length === 0 ? "no se encontraron scripts" : findings.length === 0 ? `HTML inicial y ${scripts.length} scripts revisados` : findings.join("; ") },
    { name: "sin mapas de código publicados", ok: exposedMaps.length === 0, detail: exposedMaps.length === 0 ? `${scripts.length} .map responden distinto de 200` : exposedMaps.join(", ") },
  ]
}

async function verifyNotFound(base: string): Promise<Check[]> {
  const path = `/ruta-inexistente-${crypto.randomUUID()}`
  const response = await fetch(`${base}${path}`, { redirect: "manual" })
  const leaks = findTraceLeaks(await response.text())
  return [
    { name: "ruta inexistente responde 404", ok: response.status === 404, detail: String(response.status) },
    { name: "errores sin trazas ni rutas internas", ok: leaks.length === 0, detail: leaks.length === 0 ? "ninguna" : leaks.join(", ") },
  ]
}

// Solo lecturas, sin credenciales: lo que ve un visitante sin sesión.
async function verifyAnonymousSession(base: string, isLocal: boolean): Promise<Check[]> {
  const checks: Check[] = []
  for (const path of ["/api/session", "/api/v1/prediction/schema"]) {
    const response = await fetch(`${base}${path}`, { redirect: "manual" })
    checks.push(...checkAnonymousSession(path, response.status, response.headers, await response.text(), isLocal))
  }
  return checks
}

async function main() {
  const { base, isLocal } = parseArgs(process.argv.slice(2))
  const checks: Check[] = []
  if (!isLocal) checks.push(...(await verifyHttps(base)))
  const root = await verifyPublicDomain(base)
  if (!isLocal) checks.push(...root.checks)
  checks.push(...checkSecurityHeaders(root.headers))
  checks.push(...checkContentSecurityPolicy(root.headers.get("Content-Security-Policy"), []))
  checks.push(...checkAnonymousContent(root.html))
  checks.push(...(await verifyAnonymousSession(base, isLocal)))
  checks.push(...(await verifyBundle(base, root.html)))
  checks.push(...(await verifyNotFound(base)))

  process.stdout.write(`Verificación de ${base}${isLocal ? " (local)" : ""}\n\n`)
  for (const c of checks) process.stdout.write(`${c.ok ? "OK  " : "FALLA"} ${c.name} — ${c.detail}\n`)
  const failed = checks.filter((c) => !c.ok).length
  process.stdout.write(`\n${checks.length - failed}/${checks.length} comprobaciones correctas\n`)
  process.exitCode = failed === 0 ? 0 : 1
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
