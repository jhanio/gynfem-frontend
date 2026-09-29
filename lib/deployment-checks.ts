// Comprobaciones puras del guion de verificación posterior al despliegue
// (scripts/verify-deployment.ts, docs/DEPLOYMENT.md, Sección 6). Sin red: el
// guion descarga y estas funciones deciden.

export type Check = { name: string; ok: boolean; detail: string }

const check = (name: string, ok: boolean, detail: string): Check => ({ name, ok, detail })

// Valores exactos que exige la verificación, escritos aquí a propósito y no
// importados de lib/security-headers.ts: si alguien quitara una cabecera del
// generador, la verificación la seguiría exigiendo. Una prueba comprueba que
// ambas listas coinciden. La CSP se revisa aparte porque su connect-src depende
// de las variables de cada entorno.
export const REQUIRED_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
]

const SECRET_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["clave secreta de Supabase (sb_secret_)", /sb_secret_[A-Za-z0-9_-]*/g],
  ["service_role en claro", /service_role/g],
  ["URL de base de datos", /postgres(?:ql)?:\/\/[^\s"'`]*/g],
  ["variable del backend", /GYNFEM_[A-Z_]+/g],
]
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g

// Un hallazgo nunca reproduce el valor completo: solo sus primeros caracteres.
const redact = (value: string) => `${value.slice(0, 10)}…`

export function decodeJwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { role?: unknown }
    return typeof payload.role === "string" ? payload.role : null
  } catch {
    return null
  }
}

export function findBundleSecrets(source: string): string[] {
  const findings: string[] = []
  for (const [label, pattern] of SECRET_PATTERNS) {
    for (const match of source.matchAll(pattern)) findings.push(`${label}: ${redact(match[0])}`)
  }
  for (const match of source.matchAll(JWT_PATTERN)) {
    const role = decodeJwtRole(match[0])
    if (role !== null && role !== "anon") findings.push(`JWT con rol «${role}»: ${redact(match[0])}`)
  }
  return findings
}

export function checkSecurityHeaders(headers: Headers): Check[] {
  const checks = REQUIRED_HEADERS.map(({ key, value }) => {
    const actual = headers.get(key)
    return check(`cabecera ${key}`, actual === value, actual === null ? "ausente" : actual)
  })
  const poweredBy = headers.get("X-Powered-By")
  checks.push(check("sin X-Powered-By", poweredBy === null, poweredBy ?? "ausente"))
  const server = headers.get("Server")
  checks.push(check("Server sin versión", server === null || !/\d/.test(server), server ?? "ausente"))
  return checks
}

export function checkContentSecurityPolicy(csp: string | null, expectedConnectOrigins: readonly string[] | undefined): Check[] {
  if (csp === null) return [check("CSP presente", false, "ausente")]
  const directives = new Map(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => [d.split(/\s+/)[0], d]))
  const connect = directives.get("connect-src") ?? "connect-src ausente"
  const checks = [
    check("CSP presente", true, csp),
    check("CSP default-src 'self'", directives.get("default-src") === "default-src 'self'", directives.get("default-src") ?? "ausente"),
    check("CSP base-uri 'self'", directives.get("base-uri") === "base-uri 'self'", directives.get("base-uri") ?? "ausente"),
    check("CSP sin comodines", !csp.includes("*"), csp.includes("*") ? "contiene *" : "sin *"),
    check("CSP sin 'unsafe-eval'", !csp.includes("'unsafe-eval'"), directives.get("script-src") ?? "script-src ausente"),
    check("CSP frame-ancestors 'none'", directives.get("frame-ancestors") === "frame-ancestors 'none'", directives.get("frame-ancestors") ?? "ausente"),
    check("CSP object-src 'none'", directives.get("object-src") === "object-src 'none'", directives.get("object-src") ?? "ausente"),
  ]
  if (expectedConnectOrigins !== undefined) {
    const expected = ["connect-src 'self'", ...expectedConnectOrigins].join(" ")
    checks.push(check("CSP connect-src exacto", connect === expected, connect))
  }
  return checks
}

// Standard Protection responde con 401, redirige a vercel.com/sso-api o deja
// la cookie _vercel_jwt. El dominio de producción no debe hacer nada de eso.
export function isVercelLoginWall(status: number, headers: Headers, body: string): boolean {
  if (status === 401 || status === 403) return true
  const location = headers.get("location") ?? ""
  if (status >= 300 && status < 400 && /vercel\.com|_vercel_sso|sso-api/.test(location)) return true
  if (/_vercel_jwt|_vercel_sso_nonce/.test(headers.get("set-cookie") ?? "")) return true
  return /Vercel Authentication|Authentication Required/i.test(body)
}

// El HTML inicial es el login simulado. Ninguna pantalla clínica se sirve sin sesión.
const CLINICAL_SCREEN_MARKERS = ["Buscar paciente", "Administración de usuarios", "Evaluación de riesgo", "Ficha de paciente"]

export function checkSimulatedContent(html: string): Check[] {
  const leaked = CLINICAL_SCREEN_MARKERS.filter((marker) => html.includes(marker))
  return [
    check("banner DATOS SIMULADOS", html.includes("DATOS SIMULADOS"), html.includes("DATOS SIMULADOS") ? "presente" : "ausente"),
    check("la raíz sirve el login", html.includes("Iniciar sesión"), html.includes("Iniciar sesión") ? "presente" : "ausente"),
    check("ninguna pantalla clínica sin sesión", leaked.length === 0, leaked.length === 0 ? "ninguna" : leaked.join(", ")),
  ]
}

const TRACE_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["node_modules", /node_modules/],
  ["ruta de Windows", /[A-Za-z]:\\[\w.-]/],
  ["ruta de compilación de Vercel", /\/vercel\/path\d/],
  ["línea de traza", /\n\s+at\s+\S+.*:\d+:\d+/],
  ["webpack-internal", /webpack-internal:/],
]

export function findTraceLeaks(body: string): string[] {
  return TRACE_PATTERNS.filter(([, pattern]) => pattern.test(body)).map(([label]) => label)
}

export function extractScriptUrls(html: string, base: string): string[] {
  const urls = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => new URL(m[1], base))
  return urls.filter((url) => url.origin === new URL(base).origin && url.pathname.startsWith("/_next/static/")).map((url) => url.href)
}
