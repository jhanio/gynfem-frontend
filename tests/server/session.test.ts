// @vitest-environment node
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { currentSession, login, logout } from "@/lib/server/session-handlers"
import { server } from "../msw/server"
import { ACCESS_COOKIE, API, PUBLISHABLE_KEY, REFRESH_COOKIE, SUPABASE, USER_ID, bffRequest, fakeJwt, stubServerEnv, supabaseSession } from "./helpers"

beforeEach(() => stubServerEnv())
afterEach(() => vi.unstubAllEnvs())

const credentials = { email: "medica.ficticia@gynfem.test", password: "contrasena-ficticia" }
const meOk = () => http.get(`${API}/api/v1/me`, () => HttpResponse.json({ id: USER_ID, role: "medico" }))
const setCookies = (response: Response) => response.headers.getSetCookie()

describe("POST /api/session (inicio de sesión)", () => {
  test("con credenciales válidas responde id, rol y correo, y fija las dos cookies httpOnly", async () => {
    const access = fakeJwt(3600)
    let supabaseBody: unknown
    let apiKey: string | null = null
    let authorization: string | null = null
    server.use(
      http.post(`${SUPABASE}/auth/v1/token`, async ({ request }) => {
        expect(new URL(request.url).searchParams.get("grant_type")).toBe("password")
        apiKey = request.headers.get("apikey")
        supabaseBody = await request.json()
        return HttpResponse.json(supabaseSession(access, "refresco-1"))
      }),
      http.get(`${API}/api/v1/me`, ({ request }) => {
        authorization = request.headers.get("authorization")
        return HttpResponse.json({ id: USER_ID, role: "medico" })
      }),
    )
    const response = await login(bffRequest("POST", "/api/session", { body: credentials }))
    expect(response.status).toBe(200)
    expect(supabaseBody).toMatchObject(credentials)
    expect(apiKey).toBe(PUBLISHABLE_KEY)
    expect(authorization).toBe(`Bearer ${access}`)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ id: USER_ID, role: "medico", email: "medica.ficticia@gynfem.test" })
    const cookies = setCookies(response)
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toContain(`${ACCESS_COOKIE}=${access}`)
    expect(cookies[1]).toContain(`${REFRESH_COOKIE}=refresco-1`)
    for (const cookie of cookies) expect(cookie).toContain("HttpOnly")
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  test("el cuerpo de la respuesta nunca lleva un token", async () => {
    const access = fakeJwt(3600)
    server.use(http.post(`${SUPABASE}/auth/v1/token`, () => HttpResponse.json(supabaseSession(access, "refresco-1"))), meOk())
    const text = await (await login(bffRequest("POST", "/api/session", { body: credentials }))).text()
    expect(text).not.toContain(access)
    expect(text).not.toContain("refresco-1")
  })

  test("con credenciales inválidas responde 401 uniforme sin decir qué falló, sin cookies y sin llamar a la API", async () => {
    server.use(http.post(`${SUPABASE}/auth/v1/token`, () => HttpResponse.json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, { status: 400 })))
    const response = await login(bffRequest("POST", "/api/session", { body: credentials }))
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toMatchObject({ code: "invalid_credentials", message: "Correo o contraseña incorrectos." })
    expect(body.error.request_id).toEqual(expect.any(String))
    expect(setCookies(response)).toEqual([])
  })

  test.each([
    ["responde 500", () => HttpResponse.json({ msg: "boom" }, { status: 500 })],
    ["no responde", () => HttpResponse.error()],
  ])("si Supabase Auth %s, responde 503 auth_unavailable (no 401)", async (_name, respond) => {
    server.use(http.post(`${SUPABASE}/auth/v1/token`, respond))
    const response = await login(bffRequest("POST", "/api/session", { body: credentials }))
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe("auth_unavailable")
    expect(setCookies(response)).toEqual([])
  })

  test("una cuenta desactivada (403 de /me) no obtiene cookies", async () => {
    server.use(
      http.post(`${SUPABASE}/auth/v1/token`, () => HttpResponse.json(supabaseSession(fakeJwt(3600)))),
      http.get(`${API}/api/v1/me`, () => HttpResponse.json({ error: { code: "account_disabled", message: "La cuenta no está habilitada para operar.", request_id: "r-1" } }, { status: 403 })),
    )
    const response = await login(bffRequest("POST", "/api/session", { body: credentials }))
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe("account_disabled")
    expect(setCookies(response)).toEqual([])
  })

  test.each([
    ["sin correo", { password: "x" }, "email"],
    ["sin contraseña", { email: "a@gynfem.test" }, "password"],
    ["con un correo que no es texto", { email: 5, password: "x" }, "email"],
  ])("%s responde 422 con el campo, sin llamar a Supabase", async (_name, body, field) => {
    const response = await login(bffRequest("POST", "/api/session", { body }))
    expect(response.status).toBe(422)
    expect((await response.json()).error).toMatchObject({ code: "validation_error", details: [{ loc: ["body", field], type: "missing" }] })
  })

  test("un cuerpo que no es JSON responde 422", async () => {
    const response = await login(bffRequest("POST", "/api/session", { rawBody: "{no-json" }))
    expect(response.status).toBe(422)
  })

  test("sin la cabecera anti-CSRF responde 403 y no llama a Supabase", async () => {
    const response = await login(bffRequest("POST", "/api/session", { body: credentials, csrf: false }))
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe("csrf_rejected")
  })

  test("sin variables de entorno (vista previa) responde 503 not_configured", async () => {
    vi.unstubAllEnvs()
    vi.stubEnv("API_BASE_URL", "")
    vi.stubEnv("SUPABASE_URL", "")
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "")
    const response = await login(bffRequest("POST", "/api/session", { body: credentials }))
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe("not_configured")
  })
})

describe("GET /api/session (restaurar la sesión al recargar)", () => {
  test("sin cookies responde 401 not_authenticated", async () => {
    const response = await currentSession(bffRequest("GET", "/api/session"))
    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe("not_authenticated")
  })

  test("con sesión vigente responde id y rol de /me y el correo del token", async () => {
    server.use(meOk())
    const response = await currentSession(bffRequest("GET", "/api/session", { cookies: { [ACCESS_COOKIE]: fakeJwt(3600), [REFRESH_COOKIE]: "r" } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: USER_ID, role: "medico", email: "medica.ficticia@gynfem.test" })
  })

  test("si la API rechaza el token (401), borra las cookies", async () => {
    server.use(http.get(`${API}/api/v1/me`, () => HttpResponse.json({ error: { code: "invalid_token", message: "El token de acceso no es válido.", request_id: "r" } }, { status: 401 })))
    const response = await currentSession(bffRequest("GET", "/api/session", { cookies: { [ACCESS_COOKIE]: fakeJwt(3600), [REFRESH_COOKIE]: "r" } }))
    expect(response.status).toBe(401)
    expect(setCookies(response).every((c) => c.includes("Max-Age=0"))).toBe(true)
    expect(setCookies(response)).toHaveLength(2)
  })
})

describe("DELETE /api/session (cierre de sesión)", () => {
  test("cierra la sesión en Supabase con el token y borra las cookies", async () => {
    const access = fakeJwt(3600)
    let authorization: string | null = null
    server.use(http.post(`${SUPABASE}/auth/v1/logout`, ({ request }) => {
      authorization = request.headers.get("authorization")
      return new HttpResponse(null, { status: 204 })
    }))
    const response = await logout(bffRequest("DELETE", "/api/session", { cookies: { [ACCESS_COOKIE]: access, [REFRESH_COOKIE]: "r" } }))
    expect(response.status).toBe(204)
    expect(authorization).toBe(`Bearer ${access}`)
    expect(setCookies(response)).toHaveLength(2)
    expect(setCookies(response).every((c) => c.includes("Max-Age=0"))).toBe(true)
  })

  test("aunque Supabase falle, las cookies se borran igual", async () => {
    server.use(http.post(`${SUPABASE}/auth/v1/logout`, () => HttpResponse.error()))
    const response = await logout(bffRequest("DELETE", "/api/session", { cookies: { [ACCESS_COOKIE]: fakeJwt(3600), [REFRESH_COOKIE]: "r" } }))
    expect(response.status).toBe(204)
    expect(setCookies(response)).toHaveLength(2)
  })

  test("sin cookies no llama a Supabase y responde 204", async () => {
    const response = await logout(bffRequest("DELETE", "/api/session"))
    expect(response.status).toBe(204)
  })

  test("sin la cabecera anti-CSRF responde 403 y no borra nada", async () => {
    const response = await logout(bffRequest("DELETE", "/api/session", { csrf: false, cookies: { [ACCESS_COOKIE]: fakeJwt(3600) } }))
    expect(response.status).toBe(403)
    expect(setCookies(response)).toEqual([])
  })
})
