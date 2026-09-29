import { describe, expect, test } from "vitest"
import { buildContentSecurityPolicy, buildSecurityHeaders, publicOrigin } from "@/lib/security-headers"

const API = "https://gynfem-api.example.com"
const SUPABASE = "https://proyecto-ficticio.supabase.co"
const PRODUCTION_ENV = { NEXT_PUBLIC_API_BASE_URL: API, NEXT_PUBLIC_SUPABASE_URL: SUPABASE }

const headerMap = (env: Record<string, string | undefined>, isDev = false) =>
  Object.fromEntries(buildSecurityHeaders(env, isDev).map(({ key, value }) => [key, value]))

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))

describe("publicOrigin (Fase 14, Decisión C)", () => {
  test("sin valor devuelve null: la CSP se queda en 'self'", () => {
    expect(publicOrigin("NEXT_PUBLIC_API_BASE_URL", undefined)).toBeNull()
    expect(publicOrigin("NEXT_PUBLIC_API_BASE_URL", "")).toBeNull()
  })

  test("acepta un origen https exacto", () => {
    expect(publicOrigin("NEXT_PUBLIC_API_BASE_URL", API)).toBe(API)
  })

  test("acepta http solo hacia localhost", () => {
    expect(publicOrigin("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000")).toBe("http://localhost:8000")
    expect(publicOrigin("NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:8000")).toBe("http://127.0.0.1:8000")
  })

  test.each([
    ["http fuera de localhost", "http://gynfem-api.example.com"],
    ["barra final", `${API}/`],
    ["ruta", `${API}/api/v1`],
    ["query", `${API}?x=1`],
    ["credenciales", "https://usuario:clave@gynfem-api.example.com"],
    ["comodín", "https://*.example.com"],
    ["host en mayúsculas", "https://GYNFEM-API.example.com"],
    ["texto que no es URL", "no-es-una-url"],
    ["esquema no web", "ftp://gynfem-api.example.com"],
  ])("rechaza %s y nombra la variable sin mostrar su valor", (_caso, value) => {
    expect(() => publicOrigin("NEXT_PUBLIC_API_BASE_URL", value)).toThrowError(/NEXT_PUBLIC_API_BASE_URL/)
    try {
      publicOrigin("NEXT_PUBLIC_API_BASE_URL", value)
    } catch (error) {
      expect((error as Error).message).not.toContain(value)
    }
  })
})

describe("buildContentSecurityPolicy", () => {
  test("en producción no permite eval ni incrustar la app en marcos", () => {
    const csp = buildContentSecurityPolicy({ connectOrigins: [], isDev: false })
    expect(csp).not.toContain("unsafe-eval")
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(directive(csp, "object-src")).toBe("object-src 'none'")
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'")
    expect(directive(csp, "form-action")).toBe("form-action 'self'")
    expect(directive(csp, "default-src")).toBe("default-src 'self'")
    expect(csp).toContain("upgrade-insecure-requests")
  })

  test("en desarrollo añade 'unsafe-eval', que React necesita para depurar", () => {
    const csp = buildContentSecurityPolicy({ connectOrigins: [], isDev: true })
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'")
  })

  test("en desarrollo omite upgrade-insecure-requests: next dev sirve por http://localhost", () => {
    expect(buildContentSecurityPolicy({ connectOrigins: [], isDev: true })).not.toContain("upgrade-insecure-requests")
  })

  test("connect-src contiene exactamente 'self' y los orígenes dados, sin comodines", () => {
    const csp = buildContentSecurityPolicy({ connectOrigins: [API, SUPABASE], isDev: false })
    expect(directive(csp, "connect-src")).toBe(`connect-src 'self' ${API} ${SUPABASE}`)
    expect(csp).not.toContain("*")
  })
})

describe("buildSecurityHeaders (Fase 14, Decisión 5)", () => {
  test("incluye todas las cabeceras de seguridad acordadas", () => {
    const headers = headerMap(PRODUCTION_ENV)
    expect(headers).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
      "Cross-Origin-Opener-Policy": "same-origin",
      "X-Robots-Tag": "noindex, nofollow",
    })
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()")
    expect(headers["Content-Security-Policy"]).toBeDefined()
  })

  test("con las variables de producción, connect-src permite la API y Supabase", () => {
    const csp = headerMap(PRODUCTION_ENV)["Content-Security-Policy"]
    expect(directive(csp, "connect-src")).toBe(`connect-src 'self' ${API} ${SUPABASE}`)
  })

  test("sin variables (vista previa), connect-src solo permite el propio origen", () => {
    const csp = headerMap({})["Content-Security-Policy"]
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'")
  })

  test("una variable mal formada detiene la compilación", () => {
    expect(() => buildSecurityHeaders({ NEXT_PUBLIC_SUPABASE_URL: `${SUPABASE}/` }, false)).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})
