// @vitest-environment node
// Fase 17, hallazgo S8/S9: en producción, dos cargas con forma de inyección SQL
// recibieron un 403 en HTML de un intermediario (`server: cloudflare`), sin el
// formato de error uniforme ni `request_id` (gynfem-backend/docs/validation/FASE17.md).
// Caracteriza qué hace hoy el BFF con esa respuesta y qué ve la interfaz: el HTML
// nunca llega al navegador y el mensaje es genérico.
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ApiError, isOutcomeUnknown, isTransient, parseErrorResponse } from "@/lib/api/errors"
import { UNKNOWN_ERROR_MESSAGE, describeError } from "@/lib/error-messages"
import { proxyToBackend } from "@/lib/server/proxy"
import { server } from "../msw/server"
import { ACCESS_COOKIE, API, PATIENT_ID, REFRESH_COOKIE, bffRequest, fakeJwt, stubServerEnv } from "./helpers"

beforeEach(() => stubServerEnv())
afterEach(() => vi.unstubAllEnvs())

const fresh = () => ({ [ACCESS_COOKIE]: fakeJwt(3600), [REFRESH_COOKIE]: "refresco-vigente" })
const proxy = (method: string, path: string, options: Parameters<typeof bffRequest>[2] = {}) =>
  proxyToBackend(bffRequest(method, `/api/v1${path}`, options), path.split("/").filter(Boolean))

const EDGE_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>Attention Required! | Cloudflare</title>' +
  '</head><body><div id="cf-error-details"><span>Cloudflare Ray ID: a46614b3f8e112b3</span>' +
  "<p>/opt/render/project/src</p></div></body></html>"

function edgeForbidden() {
  return new HttpResponse(EDGE_HTML, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=UTF-8", Server: "cloudflare", "CF-Ray": "a46614b3f8e112b3-LIM" },
  })
}

const LEAKS = ["<", "DOCTYPE", "Cloudflare", "cloudflare", "a46614b3f8e112b3", "/opt/render"]

describe("403 en HTML de un intermediario (hallazgo S8/S9)", () => {
  test.each([
    ["una escritura (PATCH /patients/{id})", "PATCH", `/patients/${PATIENT_ID}`, { given_names: "Paciente Ficticia" }],
    ["una lectura (GET /patients/{id})", "GET", `/patients/${PATIENT_ID}`, undefined],
  ])("en %s, el BFF responde 502 upstream_unreachable uniforme sin nada del HTML", async (_name, method, path, body) => {
    server.use(http.all(`${API}/api/v1/patients/${PATIENT_ID}`, edgeForbidden))

    const response = await proxy(method, path, { cookies: fresh(), body })

    expect(response.status).toBe(502)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(response.headers.get("server")).toBeNull()
    expect(response.headers.get("cf-ray")).toBeNull()
    const text = await response.text()
    for (const leak of LEAKS) expect(text).not.toContain(leak)
    const { error } = JSON.parse(text)
    expect(error).toEqual({
      code: "upstream_unreachable",
      message: "No se pudo conectar con el servidor.",
      request_id: response.headers.get("X-Request-ID"),
    })
  })

  test("la interfaz muestra un mensaje genérico con la referencia del BFF", async () => {
    server.use(http.patch(`${API}/api/v1/patients/${PATIENT_ID}`, edgeForbidden))
    const response = await proxy("PATCH", `/patients/${PATIENT_ID}`, { cookies: fresh(), body: { given_names: "Paciente Ficticia" } })

    const error = await parseErrorResponse(response)
    const described = describeError(error)

    expect(error).toBeInstanceOf(ApiError)
    expect(described.message).toBe(UNKNOWN_ERROR_MESSAGE)
    expect(described.reference).toBe(response.headers.get("X-Request-ID"))
    // Consecuencias de que llegue como 502: una lectura se reintenta y, en una
    // escritura, los formularios dicen que no se sabe si se guardó.
    expect(isTransient(error)).toBe(true)
    expect(isOutcomeUnknown(error)).toBe(true)
  })

  test("si el HTML llegara al cliente sin pasar por el BFF, tampoco se mostraría", async () => {
    const error = await parseErrorResponse(edgeForbidden())

    expect(error.code).toBe("http_error")
    expect(error.status).toBe(403)
    expect(describeError(error).message).toBe("No tienes permiso para esta operación.")
    for (const leak of LEAKS) expect(error.message).not.toContain(leak)
  })
})
