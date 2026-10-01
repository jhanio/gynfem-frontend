import { describe, expect, test } from "vitest"
import { buildContentSecurityPolicy, buildSecurityHeaders, publicOrigin } from "@/lib/security-headers"

const API = "https://gynfem-api.example.com"

const headerMap = (isDev = false) =>
  Object.fromEntries(buildSecurityHeaders(isDev).map(({ key, value }) => [key, value]))

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))

describe("publicOrigin (Fase 14, Decisión C)", () => {
  test("sin valor devuelve null: la CSP se queda en 'self'", () => {
    expect(publicOrigin("API_BASE_URL", undefined)).toBeNull()
    expect(publicOrigin("API_BASE_URL", "")).toBeNull()
  })

  test("acepta un origen https exacto", () => {
    expect(publicOrigin("API_BASE_URL", API)).toBe(API)
  })

  test("acepta http solo hacia localhost", () => {
    expect(publicOrigin("API_BASE_URL", "http://localhost:8000")).toBe("http://localhost:8000")
    expect(publicOrigin("API_BASE_URL", "http://127.0.0.1:8000")).toBe("http://127.0.0.1:8000")
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
    expect(() => publicOrigin("API_BASE_URL", value)).toThrowError(/API_BASE_URL/)
    try {
      publicOrigin("API_BASE_URL", value)
    } catch (error) {
      expect((error as Error).message).not.toContain(value)
    }
  })
})

describe("buildContentSecurityPolicy", () => {
  test("en producción no permite eval ni incrustar la app en marcos", () => {
    const csp = buildContentSecurityPolicy({ isDev: false })
    expect(csp).not.toContain("unsafe-eval")
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(directive(csp, "object-src")).toBe("object-src 'none'")
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'")
    expect(directive(csp, "form-action")).toBe("form-action 'self'")
    expect(directive(csp, "default-src")).toBe("default-src 'self'")
    expect(csp).toContain("upgrade-insecure-requests")
  })

  test("en desarrollo añade 'unsafe-eval', que React necesita para depurar", () => {
    const csp = buildContentSecurityPolicy({ isDev: true })
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'")
  })

  test("en desarrollo omite upgrade-insecure-requests: next dev sirve por http://localhost", () => {
    expect(buildContentSecurityPolicy({ isDev: true })).not.toContain("upgrade-insecure-requests")
  })

  test("connect-src es exactamente 'self': el navegador solo habla con su propio origen (BFF, Fase 15)", () => {
    const csp = buildContentSecurityPolicy({ isDev: false })
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'")
    expect(csp).not.toContain("*")
    expect(csp).not.toMatch(/https?:\/\//)
  })
})

describe("buildSecurityHeaders (Fase 14, Decisión 5)", () => {
  test("incluye todas las cabeceras de seguridad acordadas", () => {
    const headers = headerMap()
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

  test("la CSP no depende de ninguna variable de entorno", () => {
    expect(directive(headerMap()["Content-Security-Policy"], "connect-src")).toBe("connect-src 'self'")
  })
})
