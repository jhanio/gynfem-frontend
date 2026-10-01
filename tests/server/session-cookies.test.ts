// @vitest-environment node
import { describe, expect, test } from "vitest"
import { clearedSessionCookies, readSessionCookies, secondsToExpiry, sessionCookies } from "@/lib/server/session-cookies"
import { csrfRejection } from "@/lib/server/csrf"
import { bffRequest, fakeJwt } from "./helpers"

const httpsRequest = bffRequest("GET", "/api/session")
const localRequest = new Request("http://localhost:3000/api/session", { headers: { host: "localhost:3000" } })
const tokens = { accessToken: "token-de-acceso", refreshToken: "token-de-refresco", expiresIn: 3600 }

describe("cookies de sesión (decisión de sesión: BFF con httpOnly)", () => {
  test("en https usan el prefijo __Host- y son HttpOnly, Secure, SameSite=Strict y Path=/", () => {
    const [access, refresh] = sessionCookies(httpsRequest, tokens)
    expect(access).toMatch(/^__Host-gf_at=token-de-acceso;/)
    expect(refresh).toMatch(/^__Host-gf_rt=token-de-refresco;/)
    for (const cookie of [access, refresh]) {
      const attributes = cookie.split("; ").slice(1)
      expect(attributes).toEqual(expect.arrayContaining(["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]))
      expect(cookie).not.toMatch(/Domain=/i)
    }
  })

  test("la de acceso caduca con el token; la de refresco es de sesión (muere al cerrar el navegador)", () => {
    const [access, refresh] = sessionCookies(httpsRequest, tokens)
    expect(access).toContain("Max-Age=3600")
    expect(refresh).not.toMatch(/Max-Age|Expires/i)
  })

  test("detrás del proxy de Vercel, x-forwarded-proto https cuenta como https", () => {
    const proxied = new Request("http://interno/api/session", { headers: { "x-forwarded-proto": "https" } })
    expect(sessionCookies(proxied, tokens)[0]).toMatch(/^__Host-gf_at=/)
  })

  test("en http://localhost siguen siendo HttpOnly y SameSite=Strict, sin Secure ni prefijo", () => {
    const [access, refresh] = sessionCookies(localRequest, tokens)
    expect(access).toMatch(/^gf_at=token-de-acceso;/)
    expect(refresh).toMatch(/^gf_rt=token-de-refresco;/)
    for (const cookie of [access, refresh]) {
      expect(cookie).toContain("HttpOnly")
      expect(cookie).toContain("SameSite=Strict")
      expect(cookie).not.toContain("Secure")
    }
  })

  test("readSessionCookies lee ambas cookies de la petición", () => {
    const request = bffRequest("GET", "/api/session", { cookies: { "__Host-gf_at": "a.b.c", "__Host-gf_rt": "r", otra: "x" } })
    expect(readSessionCookies(request)).toEqual({ accessToken: "a.b.c", refreshToken: "r" })
  })

  test("sin cookies devuelve ambos nulos", () => {
    expect(readSessionCookies(httpsRequest)).toEqual({ accessToken: null, refreshToken: null })
  })

  test("clearedSessionCookies vacía ambas con Max-Age=0 y las mismas banderas", () => {
    const cleared = clearedSessionCookies(httpsRequest)
    expect(cleared).toHaveLength(2)
    for (const cookie of cleared) {
      expect(cookie).toMatch(/^__Host-gf_(at|rt)=;/)
      expect(cookie).toContain("Max-Age=0")
      expect(cookie).toContain("HttpOnly")
    }
  })
})

describe("secondsToExpiry", () => {
  test("lee exp del token sin verificarlo", () => {
    const seconds = secondsToExpiry(fakeJwt(600))
    expect(seconds).toBeGreaterThan(590)
    expect(seconds).toBeLessThanOrEqual(600)
  })

  test.each(["", "no-es-un-jwt", "a.b.c", "a.e30.c"])("un token ilegible o sin exp (%s) cuenta como caducado", (token) => {
    expect(secondsToExpiry(token)).toBe(0)
  })
})

describe("csrfRejection", () => {
  test("GET no exige nada", () => {
    expect(csrfRejection(bffRequest("GET", "/api/session", { origin: null, csrf: false }))).toBe(false)
  })

  test("una escritura con Origin propio y la cabecera pasa", () => {
    expect(csrfRejection(bffRequest("POST", "/api/session"))).toBe(false)
  })

  test.each([
    ["Origin ajeno", { origin: "https://atacante.example" }],
    ["sin Origin", { origin: null }],
    ["Origin ilegible", { origin: "null" }],
    ["sin la cabecera propia", { csrf: false }],
  ])("una escritura con %s se rechaza", (_name, options) => {
    expect(csrfRejection(bffRequest("POST", "/api/session", options))).toBe(true)
  })

  test("detrás de un proxy compara con x-forwarded-host", () => {
    const request = new Request("http://interno/api/session", { method: "DELETE", headers: { host: "interno", "x-forwarded-host": "gynfem-frontend.example", origin: "https://gynfem-frontend.example", "x-gynfem-request": "1" } })
    expect(csrfRejection(request)).toBe(false)
  })
})
