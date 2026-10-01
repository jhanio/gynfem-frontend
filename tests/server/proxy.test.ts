// @vitest-environment node
import { delay, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { READ_UPSTREAM_TIMEOUT_MS, WAKE_UPSTREAM_TIMEOUT_MS, WRITE_UPSTREAM_TIMEOUT_MS } from "@/lib/server/backend"
import { proxyToBackend } from "@/lib/server/proxy"
import { wakeBackend } from "@/lib/server/wake"
import { server } from "../msw/server"
import { ACCESS_COOKIE, API, PATIENT_ID, REFRESH_COOKIE, SUPABASE, bffRequest, fakeJwt, stubServerEnv, supabaseSession } from "./helpers"

beforeEach(() => stubServerEnv())
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

const fresh = () => ({ [ACCESS_COOKIE]: fakeJwt(3600), [REFRESH_COOKIE]: "refresco-vigente" })
const proxy = (method: string, path: string, options: Parameters<typeof bffRequest>[2] = {}) =>
  proxyToBackend(bffRequest(method, `/api/v1${path}`, options), path.split("?")[0].split("/").filter(Boolean))
const errorCode = async (response: Response) => (await response.json()).error.code as string
const setCookies = (response: Response) => response.headers.getSetCookie()

describe("tiempos de espera del BFF (decisión A)", () => {
  test("lectura 15 s, escritura 30 s, despertar 70 s", () => {
    expect(READ_UPSTREAM_TIMEOUT_MS).toBe(15_000)
    expect(WRITE_UPSTREAM_TIMEOUT_MS).toBe(30_000)
    expect(WAKE_UPSTREAM_TIMEOUT_MS).toBe(70_000)
  })
})

describe("el BFF no es un proxy abierto", () => {
  test.each([
    ["GET", "/patients"],
    ["GET", "/health/ready"],
    ["GET", "/openapi.json"],
    ["PUT", `/patients/${PATIENT_ID}`],
    ["GET", "/patients/no-es-un-uuid"],
    ["GET", `/patients/${PATIENT_ID}/otra-cosa`],
    ["POST", "/users/../patients"],
  ])("%s %s no está en la lista: 404 sin llamar al backend", async (method, path) => {
    // Sin manejador MSW: si el BFF llamara al backend, la prueba vería un 502, no un 404.
    const response = await proxy(method, path, { cookies: fresh(), body: method === "GET" ? undefined : {} })
    expect(response.status).toBe(404)
    expect(await errorCode(response)).toBe("not_found")
  })

  test("sin variables de entorno responde 503 not_configured", async () => {
    vi.unstubAllEnvs()
    vi.stubEnv("API_BASE_URL", "")
    const response = await proxy("GET", "/users", { cookies: fresh() })
    expect(response.status).toBe(503)
    expect(await errorCode(response)).toBe("not_configured")
  })

  test("sin cookies responde 401 not_authenticated sin llamar al backend", async () => {
    const response = await proxy("GET", "/users")
    expect(response.status).toBe(401)
    expect(await errorCode(response)).toBe("not_authenticated")
  })

  test.each([
    ["sin la cabecera propia", { csrf: false }],
    ["con Origin ajeno", { origin: "https://atacante.example" }],
  ])("una escritura %s responde 403 csrf_rejected sin llamar al backend", async (_name, options) => {
    const response = await proxy("POST", "/patients", { cookies: fresh(), body: {}, ...options })
    expect(response.status).toBe(403)
    expect(await errorCode(response)).toBe("csrf_rejected")
  })

  test("un cuerpo mayor de 16 KiB responde 413 sin llamar al backend", async () => {
    const response = await proxy("POST", "/patients", { cookies: fresh(), rawBody: JSON.stringify({ given_names: "a".repeat(17_000) }) })
    expect(response.status).toBe(413)
  })
})

describe("reenvío al backend", () => {
  test("envía el token de la cookie como Bearer, el cuerpo y el X-Request-ID; nunca la cookie", async () => {
    const cookies = fresh()
    let seen: { authorization: string | null; cookie: string | null; requestId: string | null; body: unknown } | null = null
    server.use(http.post(`${API}/api/v1/patients`, async ({ request }) => {
      seen = { authorization: request.headers.get("authorization"), cookie: request.headers.get("cookie"), requestId: request.headers.get("x-request-id"), body: await request.json() }
      return HttpResponse.json({ id: PATIENT_ID }, { status: 201, headers: { "X-Request-ID": "id-del-cliente-1" } })
    }))
    const response = await proxy("POST", "/patients", { cookies, body: { given_names: "Paciente Ficticia" }, headers: { "x-request-id": "id-del-cliente-1" } })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: PATIENT_ID })
    expect(seen).toEqual({ authorization: `Bearer ${cookies[ACCESS_COOKIE]}`, cookie: null, requestId: "id-del-cliente-1", body: { given_names: "Paciente Ficticia" } })
    expect(response.headers.get("x-request-id")).toBe("id-del-cliente-1")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(setCookies(response)).toEqual([])
  })

  test("un X-Request-ID con formato inválido se sustituye por un UUID", async () => {
    let requestId: string | null = null
    server.use(http.get(`${API}/api/v1/users`, ({ request }) => { requestId = request.headers.get("x-request-id"); return HttpResponse.json({}) }))
    await proxy("GET", "/users", { cookies: fresh(), headers: { "x-request-id": "dni 00000001 <script>" } })
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  test("de la URL solo pasan limit y offset", async () => {
    let search = ""
    server.use(http.get(`${API}/api/v1/users`, ({ request }) => { search = new URL(request.url).search; return HttpResponse.json({}) }))
    await proxy("GET", "/users?limit=6&offset=12&name=perez&role=administrador", { cookies: fresh() })
    expect(search).toBe("?limit=6&offset=12")
  })

  test("un 204 del backend se devuelve sin cuerpo", async () => {
    server.use(http.delete(`${API}/api/v1/patients/${PATIENT_ID}`, () => new HttpResponse(null, { status: 204 })))
    const response = await proxy("DELETE", `/patients/${PATIENT_ID}`, { cookies: fresh() })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe("")
  })

  test("un error del backend pasa tal cual, con su formato uniforme", async () => {
    const body = { error: { code: "validation_error", message: "La solicitud no es válida.", request_id: "r", details: [{ loc: ["body", "temperature_c"], type: "less_than_equal" }] } }
    server.use(http.post(`${API}/api/v1/predict`, () => HttpResponse.json(body, { status: 422 })))
    const response = await proxy("POST", "/predict", { cookies: fresh(), body: {} })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual(body)
  })

  test("un 401 del backend borra las cookies de sesión", async () => {
    server.use(http.get(`${API}/api/v1/users`, () => HttpResponse.json({ error: { code: "invalid_token", message: "El token de acceso no es válido.", request_id: "r" } }, { status: 401 })))
    const response = await proxy("GET", "/users", { cookies: fresh() })
    expect(response.status).toBe(401)
    expect(setCookies(response)).toHaveLength(2)
    expect(setCookies(response).every((c) => c.includes("Max-Age=0"))).toBe(true)
  })

  test("un 403 del backend no toca las cookies", async () => {
    server.use(http.get(`${API}/api/v1/users`, () => HttpResponse.json({ error: { code: "forbidden", message: "No tiene permiso para esta operación.", request_id: "r" } }, { status: 403 })))
    const response = await proxy("GET", "/users", { cookies: fresh() })
    expect(response.status).toBe(403)
    expect(setCookies(response)).toEqual([])
  })

  test("si el backend no responde, 502 upstream_unreachable uniforme", async () => {
    server.use(http.get(`${API}/api/v1/users`, () => HttpResponse.error()))
    const response = await proxy("GET", "/users", { cookies: fresh() })
    expect(response.status).toBe(502)
    const body = await response.json()
    expect(body.error.code).toBe("upstream_unreachable")
    expect(body.error.request_id).toEqual(expect.any(String))
  })

  test("si una escritura agota los 30 s, 504 upstream_timeout y una sola llamada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(http.post(`${API}/api/v1/patients`, async () => { calls++; await delay("infinite"); return HttpResponse.json({}) }))
    const pending = proxy("POST", "/patients", { cookies: fresh(), body: {} })
    await vi.advanceTimersByTimeAsync(WRITE_UPSTREAM_TIMEOUT_MS + 1000)
    const response = await pending
    expect(response.status).toBe(504)
    expect(await errorCode(response)).toBe("upstream_timeout")
    expect(calls).toBe(1)
  })
})

describe("refresco de la sesión en el servidor, antes de reenviar", () => {
  const refreshHandler = (newAccess: string, seen: { refresh?: unknown }) =>
    http.post(`${SUPABASE}/auth/v1/token`, async ({ request }) => {
      expect(new URL(request.url).searchParams.get("grant_type")).toBe("refresh_token")
      seen.refresh = await request.json()
      return HttpResponse.json(supabaseSession(newAccess, "refresco-rotado"))
    })

  test.each([
    ["le quedan menos de 60 s", () => ({ [ACCESS_COOKIE]: fakeJwt(30), [REFRESH_COOKIE]: "refresco-vigente" })],
    ["la cookie de acceso ya caducó y solo queda la de refresco", () => ({ [REFRESH_COOKIE]: "refresco-vigente" })],
  ])("si al token %s, refresca, reenvía con el token nuevo y fija cookies nuevas", async (_name, cookies) => {
    const newAccess = fakeJwt(3600)
    const seen: { refresh?: unknown } = {}
    let authorization: string | null = null
    server.use(
      refreshHandler(newAccess, seen),
      http.post(`${API}/api/v1/patients`, ({ request }) => { authorization = request.headers.get("authorization"); return HttpResponse.json({}, { status: 201 }) }),
    )
    const response = await proxy("POST", "/patients", { cookies: cookies(), body: {} })
    expect(response.status).toBe(201)
    expect(seen.refresh).toMatchObject({ refresh_token: "refresco-vigente" })
    expect(authorization).toBe(`Bearer ${newAccess}`)
    const cookiesSet = setCookies(response)
    expect(cookiesSet[0]).toContain(`${ACCESS_COOKIE}=${newAccess}`)
    expect(cookiesSet[1]).toContain(`${REFRESH_COOKIE}=refresco-rotado`)
  })

  test("si el refresco falla, 401 con cookies borradas y sin llamar al backend", async () => {
    server.use(http.post(`${SUPABASE}/auth/v1/token`, () => HttpResponse.json({ code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" }, { status: 400 })))
    const response = await proxy("POST", "/patients", { cookies: { [ACCESS_COOKIE]: fakeJwt(10), [REFRESH_COOKIE]: "revocado" }, body: {} })
    expect(response.status).toBe(401)
    expect(await errorCode(response)).toBe("not_authenticated")
    expect(setCookies(response).every((c) => c.includes("Max-Age=0"))).toBe(true)
  })

  test("si Supabase no responde al refrescar, 503 auth_unavailable y la sesión se conserva", async () => {
    server.use(http.post(`${SUPABASE}/auth/v1/token`, () => HttpResponse.error()))
    const response = await proxy("GET", "/users", { cookies: { [ACCESS_COOKIE]: fakeJwt(10), [REFRESH_COOKIE]: "r" } })
    expect(response.status).toBe(503)
    expect(await errorCode(response)).toBe("auth_unavailable")
    expect(setCookies(response)).toEqual([])
  })

  test("con el token vigente no se llama a Supabase", async () => {
    // Sin manejador para Supabase: una llamada haría fallar la prueba.
    server.use(http.get(`${API}/api/v1/users`, () => HttpResponse.json({ items: [] })))
    const response = await proxy("GET", "/users", { cookies: fresh() })
    expect(response.status).toBe(200)
  })
})

describe("GET /api/wake (despertar del plan Free de Render)", () => {
  test("consulta /health sin credenciales y responde 200", async () => {
    let authorization: string | null = "sin-comprobar"
    server.use(http.get(`${API}/api/v1/health`, ({ request }) => { authorization = request.headers.get("authorization"); return HttpResponse.json({ status: "ok", version: "0.5.0", timestamp: "2026-09-30T00:00:00Z" }) }))
    const response = await wakeBackend(bffRequest("GET", "/api/wake", { cookies: fresh() }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok" })
    expect(authorization).toBeNull()
  })

  test("espera hasta 70 s un arranque en frío antes de responder 504", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.get(`${API}/api/v1/health`, async () => { await delay("infinite"); return HttpResponse.json({}) }))
    const pending = wakeBackend(bffRequest("GET", "/api/wake"))
    let settled = false
    void pending.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(11_000)
    expect((await pending).status).toBe(504)
  })

  test("un backend que responde con error da 502", async () => {
    server.use(http.get(`${API}/api/v1/health`, () => new HttpResponse("Service Unavailable", { status: 503 })))
    const response = await wakeBackend(bffRequest("GET", "/api/wake"))
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain("Service Unavailable")
  })

  test("sin variables de entorno responde 503 not_configured", async () => {
    vi.unstubAllEnvs()
    vi.stubEnv("API_BASE_URL", "")
    expect((await wakeBackend(bffRequest("GET", "/api/wake"))).status).toBe(503)
  })
})
