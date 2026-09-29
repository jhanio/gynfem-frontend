import { describe, expect, test } from "vitest"
import {
  checkContentSecurityPolicy,
  checkSecurityHeaders,
  checkSimulatedContent,
  decodeJwtRole,
  extractScriptUrls,
  findBundleSecrets,
  findTraceLeaks,
  isVercelLoginWall,
} from "@/lib/deployment-checks"
import { buildSecurityHeaders } from "@/lib/security-headers"

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
const jwt = (payload: object) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.firma-ficticia`
const headersFrom = (entries: Record<string, string>) => new Headers(entries)
const goodHeaders = () =>
  headersFrom(Object.fromEntries(buildSecurityHeaders({ NEXT_PUBLIC_API_BASE_URL: "https://api.example.com" }, false).map((h) => [h.key, h.value])))

describe("decodeJwtRole", () => {
  test("lee el rol de un JWT", () => {
    expect(decodeJwtRole(jwt({ role: "anon" }))).toBe("anon")
  })

  test("devuelve null si no es un JWT legible", () => {
    expect(decodeJwtRole("eyJno.eyJvalido.x")).toBeNull()
  })
})

describe("findBundleSecrets", () => {
  test("un paquete limpio no tiene hallazgos, aunque lleve la clave publicable", () => {
    expect(findBundleSecrets('const k="sb_publishable_ficticia";fetch("/x")')).toEqual([])
  })

  test.each([
    ["clave secreta de Supabase", 'x="sb_secret_ficticia123"'],
    ["service_role en claro", 'role:"service_role"'],
    ["URL de base de datos", '"postgresql://u:p@h/db"'],
    ["URL de base de datos corta", '"postgres://u:p@h/db"'],
    ["variable del backend", "GYNFEM_DATABASE_URL"],
  ])("detecta %s", (_caso, source) => {
    expect(findBundleSecrets(source)).not.toEqual([])
  })

  test("detecta un JWT con rol distinto de anon y acepta uno anon", () => {
    expect(findBundleSecrets(`k="${jwt({ role: "service_role" })}"`)).toHaveLength(1)
    expect(findBundleSecrets(`k="${jwt({ role: "anon" })}"`)).toEqual([])
  })

  test("el hallazgo no reproduce el secreto completo", () => {
    const [finding] = findBundleSecrets('x="sb_secret_ficticia123456"')
    expect(finding).not.toContain("ficticia123456")
  })
})

describe("checkSecurityHeaders", () => {
  test("las cabeceras generadas por la app pasan todas", () => {
    expect(checkSecurityHeaders(goodHeaders()).filter((c) => !c.ok)).toEqual([])
  })

  test("falla si falta una cabecera o si aparece X-Powered-By", () => {
    const headers = goodHeaders()
    headers.delete("X-Frame-Options")
    headers.set("X-Powered-By", "Next.js")
    const failed = checkSecurityHeaders(headers).filter((c) => !c.ok).map((c) => c.name)
    expect(failed).toContain("cabecera X-Frame-Options")
    expect(failed).toContain("sin X-Powered-By")
  })

  test("falla si Server anuncia una versión", () => {
    const headers = goodHeaders()
    headers.set("Server", "nginx/1.25.3")
    expect(checkSecurityHeaders(headers).find((c) => c.name === "Server sin versión")?.ok).toBe(false)
  })
})

describe("checkContentSecurityPolicy", () => {
  const csp = (connect: string) => `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src ${connect}; frame-ancestors 'none'; object-src 'none'`

  test("con orígenes esperados exige connect-src exacto", () => {
    expect(checkContentSecurityPolicy(csp("'self' https://a.example.com"), ["https://a.example.com"]).every((c) => c.ok)).toBe(true)
    expect(checkContentSecurityPolicy(csp("'self'"), ["https://a.example.com"]).some((c) => !c.ok)).toBe(true)
  })

  test("rechaza comodines, eval y la ausencia de frame-ancestors", () => {
    expect(checkContentSecurityPolicy(csp("'self' https://*.example.com"), undefined).some((c) => !c.ok)).toBe(true)
    expect(checkContentSecurityPolicy("default-src 'self'; script-src 'self' 'unsafe-eval'", undefined).some((c) => !c.ok)).toBe(true)
  })

  test("sin cabecera, falla", () => {
    expect(checkContentSecurityPolicy(null, undefined).some((c) => !c.ok)).toBe(true)
  })
})

describe("isVercelLoginWall", () => {
  test("una respuesta 200 normal no es el muro de login", () => {
    expect(isVercelLoginWall(200, new Headers(), "<html>DATOS SIMULADOS</html>")).toBe(false)
  })

  test.each([
    ["401", 401, new Headers(), ""],
    ["redirección a vercel.com", 307, new Headers({ location: "https://vercel.com/sso-api?url=x" }), ""],
    ["cookie de sesión de Vercel", 200, new Headers({ "set-cookie": "_vercel_jwt=abc; Path=/" }), ""],
    ["página de autenticación", 200, new Headers(), "<title>Authentication Required</title> Vercel Authentication"],
  ])("detecta %s", (_caso, status, headers, body) => {
    expect(isVercelLoginWall(status, headers, body)).toBe(true)
  })
})

describe("checkSimulatedContent", () => {
  test("acepta el login simulado y rechaza pantallas clínicas en el HTML inicial", () => {
    expect(checkSimulatedContent("<div>DATOS SIMULADOS</div><h1>Iniciar sesión</h1>").every((c) => c.ok)).toBe(true)
    expect(checkSimulatedContent("<div>DATOS SIMULADOS</div><h1>Iniciar sesión</h1><h2>Buscar paciente</h2>").some((c) => !c.ok)).toBe(true)
    expect(checkSimulatedContent("<h1>Iniciar sesión</h1>").some((c) => !c.ok)).toBe(true)
  })
})

describe("findTraceLeaks", () => {
  test("una página 404 limpia no tiene hallazgos", () => {
    expect(findTraceLeaks("<h1>404</h1><h2>This page could not be found.</h2>")).toEqual([])
  })

  test.each([
    ["node_modules", "at x (/var/task/node_modules/next/dist/a.js:1:1)"],
    ["ruta de Windows", "C:\\Users\\alguien\\app\\page.tsx"],
    ["ruta de compilación de Vercel", "/vercel/path0/app/page.tsx"],
    ["línea de traza", "Error: x\n    at render (file.js:10:5)"],
    ["webpack-internal", "webpack-internal:///./app/page.tsx"],
  ])("detecta %s", (_caso, body) => {
    expect(findTraceLeaks(body)).not.toEqual([])
  })
})

describe("extractScriptUrls", () => {
  test("extrae los scripts propios de /_next/static y descarta los externos", () => {
    const html = '<script src="/_next/static/chunks/a.js" async></script><script src="https://externo.example.com/x.js"></script><script src="/_next/static/chunks/b.js"></script>'
    expect(extractScriptUrls(html, "https://app.example.com")).toEqual([
      "https://app.example.com/_next/static/chunks/a.js",
      "https://app.example.com/_next/static/chunks/b.js",
    ])
  })
})
