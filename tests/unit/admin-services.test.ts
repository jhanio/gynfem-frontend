import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { READ_RETRY_DELAYS_MS } from "@/lib/api/retry"
import { server } from "../msw/server"
import { PATIENT, PREDICTION_ID, uniformError } from "../msw/fixtures"

// Servicios de la Fase 16 (gynfem-backend/docs/API_SPEC.md §3.7). Como en
// services.test.ts, el cliente guarda estado de módulo: copia nueva por prueba.
let history: typeof import("@/services/history")
let reports: typeof import("@/services/reports")
let metrics: typeof import("@/services/model-metrics")
let settings: typeof import("@/services/settings")
let audit: typeof import("@/services/audit-log")

beforeEach(async () => {
  vi.resetModules()
  history = await import("@/services/history")
  reports = await import("@/services/reports")
  metrics = await import("@/services/model-metrics")
  settings = await import("@/services/settings")
  audit = await import("@/services/audit-log")
})
// Aquí y no al final de la prueba: si una afirmación falla, el reloj falso no queda puesto.
afterEach(() => vi.useRealTimers())

const unavailable = () => HttpResponse.json(uniformError("database_unavailable", "La base de datos no está disponible."), { status: 503 })
const emptyPage = { items: [], limit: 20, offset: 0, has_more: false }

describe("historial de evaluaciones (HU008)", () => {
  const capture = () => {
    const seen = { search: "" }
    server.use(http.get(`*/api/v1/patients/${PATIENT.id}/evaluations`, ({ request }) => { seen.search = new URL(request.url).search; return HttpResponse.json({ ...emptyPage, clinical_disclaimer: "Advertencia de prueba." }) }))
    return seen
  }

  test("la primera página no envía limit: rige el parámetro del sistema", async () => {
    const seen = capture()
    const page = await history.listEvaluations(PATIENT.id, 0)
    expect(seen.search).toBe("?offset=0")
    expect(page.clinical_disclaimer).toBe("Advertencia de prueba.")
    expect(page).not.toHaveProperty("total")
  })

  test("las páginas siguientes repiten el limit que aplicó la primera", async () => {
    const seen = capture()
    await history.listEvaluations(PATIENT.id, 14, 7)
    expect(seen.search).toBe("?offset=14&limit=7")
  })
})

describe("reporte de una evaluación (HU009)", () => {
  test("es UN POST sin cuerpo a /predictions/{id}/report", async () => {
    const seen = { calls: 0, body: "sin leer", contentType: "sin leer" as string | null }
    server.use(http.post(`*/api/v1/predictions/${PREDICTION_ID}/report`, async ({ request }) => {
      seen.calls++; seen.body = await request.text(); seen.contentType = request.headers.get("content-type")
      return HttpResponse.json({ institution_name: "Centro Ficticio de Prueba" })
    }))
    await expect(reports.generateReport(PREDICTION_ID)).resolves.toMatchObject({ institution_name: "Centro Ficticio de Prueba" })
    expect(seen).toEqual({ calls: 1, body: "", contentType: null })
  })

  test.each([
    ["un 503", unavailable],
    ["un fallo de red", () => HttpResponse.error()],
  ])("ante %s no se reintenta: cada generación deja un registro de auditoría", async (_name, respond) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(http.post(`*/api/v1/predictions/${PREDICTION_ID}/report`, () => { calls++; return respond() }))
    await expect(reports.generateReport(PREDICTION_ID)).rejects.toMatchObject({ name: "ApiError" })
    // Pasado el margen en el que una lectura se habría reintentado, sigue habiendo una sola.
    await vi.advanceTimersByTimeAsync(READ_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 1000)
    expect(calls).toBe(1)
  })
})

describe("métricas del modelo (HU010)", () => {
  test("pide /model/metrics sin ningún parámetro: no existe una vista de solo cifras", async () => {
    let url = ""
    const body = { metrics: {}, limitations: [{ code: "clinical_disclaimer", title: "t", message: "m", sources: [] }] }
    server.use(http.get("*/api/v1/model/metrics", ({ request }) => { url = request.url; return HttpResponse.json(body) }))
    await expect(metrics.getModelMetrics()).resolves.toEqual(body)
    expect(new URL(url).search).toBe("")
  })
})

describe("configuración del sistema (HU011)", () => {
  const current = {
    institution_name: { value: "Centro Ficticio de Prueba", default: "Centro Ficticio", updated_at: "2026-10-01T00:00:00Z", updated_by: "33333333-3333-4333-8333-333333333333" },
    history_default_page_size: { value: 7, default: 9, updated_at: null, updated_by: null },
  }

  test("getSettings lee GET /settings", async () => {
    server.use(http.get("*/api/v1/settings", () => HttpResponse.json(current)))
    await expect(settings.getSettings()).resolves.toEqual(current)
  })

  test("updateSettings envía un PATCH con solo las claves que cambian", async () => {
    let body: unknown
    server.use(http.patch("*/api/v1/settings", async ({ request }) => { body = await request.json(); return HttpResponse.json(current) }))
    await expect(settings.updateSettings({ history_default_page_size: 7 })).resolves.toEqual(current)
    expect(body).toEqual({ history_default_page_size: 7 })
  })

  test("un 503 al guardar no se reintenta", async () => {
    let calls = 0
    server.use(http.patch("*/api/v1/settings", () => { calls++; return unavailable() }))
    await expect(settings.updateSettings({ institution_name: "Centro Ficticio" })).rejects.toMatchObject({ code: "database_unavailable" })
    expect(calls).toBe(1)
  })
})

describe("consulta de auditoría", () => {
  const capture = () => {
    const seen = { url: "" }
    server.use(http.get("*/api/v1/audit-log", ({ request }) => { seen.url = request.url; return HttpResponse.json(emptyPage) }))
    return seen
  }

  test("sin filtros envía solo la paginación, con el tamaño de página fijo", async () => {
    const seen = capture()
    const page = await audit.listAuditLog({}, 40)
    expect(new URL(seen.url).search).toBe(`?limit=${audit.AUDIT_PAGE_SIZE}&offset=40`)
    expect(page).not.toHaveProperty("total")
  })

  test("el signo + de una zona horaria viaja como %2B, nunca como + ni como espacio", async () => {
    const seen = capture()
    await audit.listAuditLog({ from: "2026-10-01T00:00:00+00:00", to: "2026-10-02T00:00:00+05:30" }, 0)
    const search = new URL(seen.url).search
    expect(search).toContain("from=2026-10-01T00%3A00%3A00%2B00%3A00")
    expect(search).toContain("to=2026-10-02T00%3A00%3A00%2B05%3A30")
    expect(search).not.toMatch(/[+ ]|%20/)
  })

  test("envía los filtros con los nombres del contrato y omite los vacíos", async () => {
    const seen = capture()
    await audit.listAuditLog({ action: "prediction.report", entity_type: "prediction", entity_id: PREDICTION_ID, actor_user_id: "", from: undefined }, 0)
    expect(Object.fromEntries(new URL(seen.url).searchParams)).toEqual({
      limit: String(audit.AUDIT_PAGE_SIZE), offset: "0", action: "prediction.report", entity_type: "prediction", entity_id: PREDICTION_ID,
    })
  })
})
