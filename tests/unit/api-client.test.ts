import { delay, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { server } from "../msw/server"

type Client = typeof import("@/lib/api/client")
let client: Client

// El cliente guarda estado de módulo (última respuesta, manejador de 401): copia nueva por prueba.
beforeEach(async () => {
  vi.resetModules()
  client = await import("@/lib/api/client")
})
afterEach(() => vi.useRealTimers())

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const uniform = (status: number, code: string) => HttpResponse.json({ error: { code, message: "m", request_id: "r" } }, { status })

describe("tiempos de espera anclados a DEPLOYMENT.md §7.8 (decisión A)", () => {
  test("lectura 20 s, escritura 35 s, despertar 75 s, despertar previo tras 14 min sin respuesta", () => {
    expect(client.READ_TIMEOUT_MS).toBe(20_000)
    expect(client.WRITE_TIMEOUT_MS).toBe(35_000)
    expect(client.WAKE_TIMEOUT_MS).toBe(75_000)
    expect(client.IDLE_BEFORE_WAKE_MS).toBe(14 * 60_000)
  })
})

describe("cabeceras de cada petición", () => {
  test("lleva un X-Request-ID aleatorio (UUID v4) distinto en cada petición y la cabecera anti-CSRF", async () => {
    const seen: Array<{ id: string | null; csrf: string | null }> = []
    server.use(http.get("*/api/v1/prediction/schema", ({ request }) => {
      seen.push({ id: request.headers.get("x-request-id"), csrf: request.headers.get("x-gynfem-request") })
      return HttpResponse.json({ ok: true })
    }))
    await client.apiRead("/prediction/schema")
    await client.apiRead("/prediction/schema")
    expect(seen).toHaveLength(2)
    expect(seen[0].id).toMatch(UUID)
    expect(seen[1].id).toMatch(UUID)
    expect(seen[0].id).not.toBe(seen[1].id)
    expect(seen[0].csrf).toBe("1")
  })

  test("una escritura envía el cuerpo como JSON", async () => {
    let received: unknown
    let contentType: string | null = null
    server.use(http.post("*/api/v1/patients", async ({ request }) => {
      contentType = request.headers.get("content-type")
      received = await request.json()
      return HttpResponse.json({ id: "p" }, { status: 201 })
    }))
    await expect(client.apiWrite("POST", "/patients", { given_names: "Paciente Ficticia" })).resolves.toEqual({ id: "p" })
    expect(received).toEqual({ given_names: "Paciente Ficticia" })
    expect(contentType).toBe("application/json")
  })

  test("un 204 devuelve undefined", async () => {
    server.use(http.delete("*/api/v1/patients/abc", () => new HttpResponse(null, { status: 204 })))
    await expect(client.apiWrite("DELETE", "/patients/abc")).resolves.toBeUndefined()
  })
})

describe("lecturas: se reintentan ante fallos transitorios", () => {
  test("un 503 seguido de un 200 devuelve el dato tras un reintento", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(http.get("*/api/v1/users", () => (++calls === 1 ? uniform(503, "database_unavailable") : HttpResponse.json({ items: [] }))))
    const promise = client.apiRead("/users")
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).resolves.toEqual({ items: [] })
    expect(calls).toBe(2)
  })

  test("POST /patients/search es lectura: también se reintenta", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(http.post("*/api/v1/patients/search", () => (++calls === 1 ? HttpResponse.error() : HttpResponse.json({ items: [] }))))
    const promise = client.apiRead("/patients/search", { name: "ficticia" })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).resolves.toEqual({ items: [] })
    expect(calls).toBe(2)
  })

  test("un fallo de red se convierte en network_error con estado 0", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.get("*/api/v1/users", () => HttpResponse.error()))
    const promise = client.apiRead("/users")
    const assertion = expect(promise).rejects.toMatchObject({ status: 0, code: "network_error" })
    await vi.advanceTimersByTimeAsync(4000)
    await assertion
  })
})

describe("escrituras: prohibido reintentar (decisión C)", () => {
  test.each([
    ["503", () => uniform(503, "database_unavailable"), "database_unavailable"],
    ["504", () => uniform(504, "upstream_timeout"), "upstream_timeout"],
    ["fallo de red", () => HttpResponse.error(), "network_error"],
  ])("ante %s el POST se envía exactamente una vez", async (_name, respond, code) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(http.post("*/api/v1/patients/p1/measurements", () => { calls++; return respond() }))
    const assertion = expect(client.apiWrite("POST", "/patients/p1/measurements", {})).rejects.toMatchObject({ code })
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(calls).toBe(1)
  })

  test("agotar la espera de una escritura da timeout y no la repite", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(http.post("*/api/v1/patients", async () => { calls++; await delay("infinite"); return HttpResponse.json({}) }))
    const assertion = expect(client.apiWrite("POST", "/patients", {})).rejects.toMatchObject({ status: 0, code: "timeout" })
    await vi.advanceTimersByTimeAsync(client.WRITE_TIMEOUT_MS + 5000)
    await assertion
    expect(calls).toBe(1)
  })
})

describe("401: avisa a la sesión una vez por respuesta (decisión 4)", () => {
  test("un 401 de la API llama al manejador y propaga el error", async () => {
    const onUnauthorized = vi.fn()
    client.setUnauthorizedHandler(onUnauthorized)
    server.use(http.get("*/api/v1/users", () => uniform(401, "token_expired")))
    await expect(client.apiRead("/users")).rejects.toMatchObject({ status: 401, code: "token_expired" })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  test("un 403 no cierra la sesión", async () => {
    const onUnauthorized = vi.fn()
    client.setUnauthorizedHandler(onUnauthorized)
    server.use(http.get("*/api/v1/users", () => uniform(403, "forbidden")))
    await expect(client.apiRead("/users")).rejects.toMatchObject({ status: 403 })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe("despertar del backend (arranque en frío, decisión A)", () => {
  test("wake() consulta /api/wake y notifica el inicio y el fin", async () => {
    const states: boolean[] = []
    client.onWakeChange((waking) => states.push(waking))
    server.use(http.get("*/api/wake", () => HttpResponse.json({ status: "ok" })))
    await client.wake()
    expect(states).toEqual([true, false])
  })

  test("wake() reintenta una vez si falla, porque es una lectura", async () => {
    let calls = 0
    server.use(http.get("*/api/wake", () => (++calls === 1 ? uniform(504, "upstream_timeout") : HttpResponse.json({ status: "ok" }))))
    await client.wake()
    expect(calls).toBe(2)
  })

  test("si el despertar falla dos veces, propaga el error y deja de indicar que despierta", async () => {
    const states: boolean[] = []
    client.onWakeChange((waking) => states.push(waking))
    server.use(http.get("*/api/wake", () => uniform(504, "upstream_timeout")))
    await expect(client.wake()).rejects.toMatchObject({ code: "upstream_timeout" })
    expect(states).toEqual([true, false])
  })

  test("ensureAwake despierta una sola vez aunque se pida dos veces a la vez", async () => {
    let calls = 0
    server.use(http.get("*/api/wake", async () => { calls++; await delay(20); return HttpResponse.json({ status: "ok" }) }))
    await Promise.all([client.ensureAwake(), client.ensureAwake()])
    expect(calls).toBe(1)
  })

  test("ensureAwake no despierta si el backend respondió hace poco", async () => {
    let calls = 0
    server.use(http.get("*/api/wake", () => { calls++; return HttpResponse.json({ status: "ok" }) }))
    await client.ensureAwake()
    await client.ensureAwake()
    expect(calls).toBe(1)
  })

  test("tras 14 min sin respuestas, una escritura despierta primero al backend", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const order: string[] = []
    server.use(
      http.get("*/api/wake", () => { order.push("wake"); return HttpResponse.json({ status: "ok" }) }),
      http.get("*/api/v1/users", () => { order.push("read"); return HttpResponse.json({}) }),
      http.post("*/api/v1/patients", () => { order.push("write"); return HttpResponse.json({}, { status: 201 }) }),
    )
    await client.apiRead("/users")
    await client.apiWrite("POST", "/patients", {})
    expect(order).toEqual(["read", "write"])
    vi.setSystemTime(Date.now() + client.IDLE_BEFORE_WAKE_MS + 1000)
    await client.apiWrite("POST", "/patients", {})
    expect(order).toEqual(["read", "write", "wake", "write"])
  })

  test("si el despertar previo falla, la escritura no se envía", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let writes = 0
    server.use(
      http.get("*/api/v1/users", () => HttpResponse.json({})),
      http.get("*/api/wake", () => uniform(504, "upstream_timeout")),
      http.post("*/api/v1/patients", () => { writes++; return HttpResponse.json({}, { status: 201 }) }),
    )
    await client.apiRead("/users")
    vi.setSystemTime(Date.now() + client.IDLE_BEFORE_WAKE_MS + 1000)
    await expect(client.apiWrite("POST", "/patients", {})).rejects.toMatchObject({ code: "upstream_timeout" })
    expect(writes).toBe(0)
  })
})
