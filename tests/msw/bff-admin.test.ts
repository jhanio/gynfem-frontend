import { beforeEach, describe, expect, test, vi } from "vitest"
import { mockBff } from "./bff"
import { ADMIN, IN_RANGE_VALUES, LIMITATION_CODES, MEDICA, MODEL_METRICS, MODEL_METRICS_ALT, PATIENT } from "./fixtures"

// El BFF simulado sigue las reglas de gynfem-backend/docs/API_SPEC.md §3.7 de
// las que dependen las pruebas de flujo de la Fase 16. Si el simulado se
// apartara del contrato, esas pruebas pasarían en falso: aquí se fija, a través
// de los servicios reales.
let assessments: typeof import("@/services/assessments")
let history: typeof import("@/services/history")
let reports: typeof import("@/services/reports")
let metrics: typeof import("@/services/model-metrics")
let settings: typeof import("@/services/settings")
let audit: typeof import("@/services/audit-log")

beforeEach(async () => {
  vi.resetModules()
  assessments = await import("@/services/assessments")
  history = await import("@/services/history")
  reports = await import("@/services/reports")
  metrics = await import("@/services/model-metrics")
  settings = await import("@/services/settings")
  audit = await import("@/services/audit-log")
})

const AUDIT_KEYS = ["action", "actor_user_id", "changed_fields", "created_at", "entity_id", "entity_type", "outcome", "request_id"]

describe("historial (§3.7.1)", () => {
  test("incluye la evaluación corregida, marcada, y la advertencia va una vez en la página", async () => {
    mockBff({ signedIn: MEDICA })
    const first = await assessments.registerAssessment(PATIENT.id, IN_RANGE_VALUES)
    const correction = await assessments.correctMeasurement(first.measurement.id, IN_RANGE_VALUES)
    const page = await history.listEvaluations(PATIENT.id, 0)
    expect(page.items.map((item) => [item.measurement.id, item.status])).toEqual([
      [correction.measurement.id, "current"],
      [first.measurement.id, "corrected"],
    ])
    expect(page.clinical_disclaimer).toBe(first.prediction.clinical_disclaimer)
    for (const item of page.items) expect(item.prediction).not.toHaveProperty("clinical_disclaimer")
    expect(page).not.toHaveProperty("total")
  })

  test("sin limit aplica history_default_page_size y lo devuelve; con limit, el pedido", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    const size = bff.settings.history_default_page_size.value
    for (let i = 0; i <= size; i++) await assessments.registerAssessment(PATIENT.id, IN_RANGE_VALUES)
    const page = await history.listEvaluations(PATIENT.id, 0)
    expect(page).toMatchObject({ limit: size, offset: 0, has_more: true })
    expect(page.items).toHaveLength(size)
    await expect(history.listEvaluations(PATIENT.id, size, size)).resolves.toMatchObject({ offset: size, has_more: false })
    await expect(history.listEvaluations(PATIENT.id, 0, 1)).resolves.toMatchObject({ limit: 1, has_more: true })
  })

  test("solo el médico: la administradora recibe 403, y una paciente inexistente da 404", async () => {
    const bff = mockBff({ signedIn: ADMIN })
    await expect(history.listEvaluations(PATIENT.id, 0)).rejects.toMatchObject({ status: 403, code: "forbidden" })
    bff.session = MEDICA
    bff.patients.clear()
    await expect(history.listEvaluations(PATIENT.id, 0)).rejects.toMatchObject({ status: 404, code: "patient_not_found" })
  })
})

describe("reporte (§3.7.2)", () => {
  test("devuelve paciente con el documento completo, medición sin patient_id y predicción con status; cada generación se audita", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    const { prediction, measurement } = await assessments.registerAssessment(PATIENT.id, IN_RANGE_VALUES)
    const before = bff.audit.length
    const report = await reports.generateReport(prediction.id)
    expect(report.institution_name).toBe(bff.settings.institution_name.value)
    expect(report.patient).toEqual({ id: PATIENT.id, document_type: PATIENT.document_type, document_number: PATIENT.document_number, given_names: PATIENT.given_names, family_names: PATIENT.family_names })
    expect(report.measurement).toMatchObject({ id: measurement.id, ...IN_RANGE_VALUES })
    expect(report.measurement).not.toHaveProperty("patient_id")
    expect(report.prediction).toMatchObject({ id: prediction.id, status: "current" })
    expect(report.clinical_disclaimer).toBe(prediction.clinical_disclaimer)
    await reports.generateReport(prediction.id)
    expect(bff.audit.slice(0, bff.audit.length - before).map((entry) => [entry.action, entry.entity_id, entry.actor_user_id])).toEqual([
      ["prediction.report", prediction.id, MEDICA.id],
      ["prediction.report", prediction.id, MEDICA.id],
    ])
  })

  test("una predicción inexistente o de una paciente dada de baja da el mismo 404 y no se audita", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    const { prediction } = await assessments.registerAssessment(PATIENT.id, IN_RANGE_VALUES)
    const before = bff.audit.length
    await expect(reports.generateReport("99999999-9999-4999-8999-999999999999")).rejects.toMatchObject({ status: 404, code: "prediction_not_found" })
    bff.patients.clear()
    await expect(reports.generateReport(prediction.id)).rejects.toMatchObject({ status: 404, code: "prediction_not_found" })
    expect(bff.audit).toHaveLength(before)
  })

  test("la administradora recibe 403", async () => {
    mockBff({ signedIn: ADMIN })
    await expect(reports.generateReport("99999999-9999-4999-8999-999999999999")).rejects.toMatchObject({ status: 403 })
  })
})

describe("métricas (§3.7.3)", () => {
  test("médico y administrador las leen; llegan las nueve limitaciones en el orden del contrato", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    const asMedica = await metrics.getModelMetrics()
    expect(asMedica).toEqual(MODEL_METRICS)
    expect(asMedica.limitations.map((l) => l.code)).toEqual(LIMITATION_CODES)
    expect(LIMITATION_CODES).toHaveLength(9)
    expect(LIMITATION_CODES.at(-1)).toBe("clinical_disclaimer")
    bff.session = ADMIN
    await expect(metrics.getModelMetrics()).resolves.toEqual(MODEL_METRICS)
  })

  test("la segunda variante cambia todas las cifras: una pantalla con valores codificados no la sigue", async () => {
    mockBff({ signedIn: MEDICA, metrics: MODEL_METRICS_ALT })
    const received = await metrics.getModelMetrics()
    for (const [name, value] of Object.entries(MODEL_METRICS.metrics)) {
      expect(received.metrics[name as keyof typeof received.metrics]).not.toBe(value)
    }
    expect(received.detail?.labels).not.toEqual(MODEL_METRICS.detail?.labels)
  })
})

describe("configuración (§3.7.4)", () => {
  test("el nombre se normaliza con NFC y espacios, y su longitud cuenta puntos de código", async () => {
    mockBff({ signedIn: ADMIN })
    const normalized = await settings.updateSettings({ institution_name: "  Cli\u0301nica\u00a0\u00a0Ficticia  " })
    expect(normalized.institution_name.value).toBe("Clínica Ficticia")
    const astral = "😀".repeat(100)
    expect((await settings.updateSettings({ institution_name: astral })).institution_name.value).toBe(astral)
    await expect(settings.updateSettings({ institution_name: `${astral}😀` })).rejects.toMatchObject({ status: 422, details: [{ loc: ["body", "institution_name"], type: "institution_name_length" }] })
  })

  test.each(["\tCentro Ficticio", "Centro\ue000Ficticio", "Centro\ud800Ficticio", "Centro\u0378Ficticio", "Centro\u2028Ficticio"])("el mock rechaza categorías Unicode prohibidas antes de recortar", async (institution_name) => {
    const bff = mockBff({ signedIn: ADMIN })
    const initial = structuredClone(bff.settings)
    const auditLength = bff.audit.length
    await expect(settings.updateSettings({ institution_name })).rejects.toMatchObject({ status: 422, details: [{ loc: ["body", "institution_name"], type: "control_character" }] })
    expect(bff.settings).toEqual(initial)
    expect(bff.audit).toHaveLength(auditLength)
  })

  test("solo el administrador; un cambio fija updated_at y updated_by y audita solo el nombre de la clave", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    await expect(settings.getSettings()).rejects.toMatchObject({ status: 403 })
    bff.session = ADMIN
    const initial = await settings.getSettings()
    expect(initial.institution_name).toMatchObject({ updated_at: null, updated_by: null })
    const before = bff.audit.length
    const changed = await settings.updateSettings({ institution_name: "  Centro Ficticio de Prueba  " })
    expect(changed.institution_name).toMatchObject({ value: "Centro Ficticio de Prueba", default: initial.institution_name.default, updated_by: ADMIN.id })
    expect(changed.institution_name.updated_at).toEqual(expect.any(String))
    expect(changed.history_default_page_size).toEqual(initial.history_default_page_size)
    expect(bff.audit).toHaveLength(before + 1)
    expect(bff.audit[0]).toMatchObject({ action: "system_setting.update", entity_type: "system_setting", entity_id: null, changed_fields: ["institution_name"] })
    expect(JSON.stringify(bff.audit[0])).not.toContain("Centro Ficticio de Prueba")
  })

  test("un valor igual al vigente (tras normalizar) responde 200 con el mismo estado y no escribe ni audita", async () => {
    const bff = mockBff({ signedIn: ADMIN })
    const initial = await settings.getSettings()
    const before = bff.audit.length
    await expect(settings.updateSettings({ institution_name: ` ${initial.institution_name.value} `, history_default_page_size: initial.history_default_page_size.value })).resolves.toEqual(initial)
    expect(bff.audit).toHaveLength(before)
  })

  test.each([
    [{}, ["body"], "empty_update"],
    [{ institution_name: null }, ["body"], "null_field"],
    [{ otra_clave: 1 }, ["body", "otra_clave"], "extra_forbidden"],
    [{ history_default_page_size: 0 }, ["body", "history_default_page_size"], "greater_than_equal"],
    [{ history_default_page_size: 51 }, ["body", "history_default_page_size"], "less_than_equal"],
    [{ history_default_page_size: "7" }, ["body", "history_default_page_size"], "int_type"],
    [{ institution_name: "   " }, ["body", "institution_name"], "institution_name_length"],
    [{ institution_name: "Centro\u0007Ficticio" }, ["body", "institution_name"], "control_character"],
  ])("PATCH %j da 422 sin escribir nada", async (body, loc, type) => {
    const bff = mockBff({ signedIn: ADMIN })
    const initial = structuredClone(bff.settings)
    await expect(settings.updateSettings(body as never)).rejects.toMatchObject({ status: 422, code: "validation_error", details: [{ loc, type }] })
    expect(bff.settings).toEqual(initial)
  })
})

describe("auditoría (§3.7.5)", () => {
  test.each([
    [{ action: "Borrar todo" }, "action", "string_pattern_mismatch"],
    [{ entity_type: "otra" }, "entity_type", "literal_error"],
    [{ entity_id: "no-es-uuid" }, "entity_id", "uuid_parsing"],
    [{ actor_user_id: "no-es-uuid" }, "actor_user_id", "uuid_parsing"],
    [{ from: "2026-10-03T10:00:00" }, "from", "timezone_aware"],
    [{ from: "2026-02-30T10:00:00Z" }, "from", "timezone_aware"],
    [{ to: "2026-10-03T10:00:00+24:00" }, "to", "timezone_aware"],
  ])("filtro inválido %j da 422 sin modificar auditoría", async (filters, field, type) => {
    const bff = mockBff({ signedIn: ADMIN })
    const initial = structuredClone(bff.audit)
    await expect(audit.listAuditLog(filters, 0)).rejects.toMatchObject({ status: 422, details: [{ loc: ["query", field], type }] })
    expect(bff.audit).toEqual(initial)
  })

  test("el mock conserva microsegundos en from inclusivo y to exclusivo", async () => {
    const bff = mockBff({ signedIn: ADMIN })
    bff.audit = [{ ...bff.audit[0], created_at: "2026-10-03T10:00:00.000001Z" }, { ...bff.audit[1], created_at: "2026-10-03T10:00:00.000002Z" }]
    expect((await audit.listAuditLog({ from: "2026-10-03T10:00:00.000001Z", to: "2026-10-03T10:00:00.000002Z" }, 0)).items).toEqual([bff.audit[0]])
    await expect(audit.listAuditLog({ from: "2026-10-03T10:00:00.000002Z", to: "2026-10-03T10:00:00.000001Z" }, 0)).rejects.toMatchObject({ status: 422, details: [{ loc: ["query"], type: "date_range_inverted" }] })
  })

  test("solo el administrador; cada ítem lleva exactamente las ocho claves, de lo más reciente a lo más antiguo, sin total", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    await expect(audit.listAuditLog({}, 0)).rejects.toMatchObject({ status: 403 })
    bff.session = ADMIN
    const page = await audit.listAuditLog({}, 0)
    expect(page.items.length).toBeGreaterThan(1)
    for (const item of page.items) expect(Object.keys(item).sort()).toEqual(AUDIT_KEYS)
    const times = page.items.map((item) => item.created_at)
    expect(times).toEqual([...times].sort().reverse())
    expect(page).not.toHaveProperty("total")
  })

  test("los filtros se combinan; from es inclusivo y to exclusivo", async () => {
    const bff = mockBff({ signedIn: ADMIN })
    const [newest, older] = bff.audit
    await expect(audit.listAuditLog({ action: older.action, entity_type: older.entity_type }, 0)).resolves.toMatchObject({
      items: bff.audit.filter((entry) => entry.action === older.action && entry.entity_type === older.entity_type),
    })
    const upTo = await audit.listAuditLog({ from: older.created_at, to: newest.created_at }, 0)
    expect(upTo.items.map((item) => item.created_at)).toContain(older.created_at)
    expect(upTo.items.map((item) => item.created_at)).not.toContain(newest.created_at)
    await expect(audit.listAuditLog({ from: older.created_at, to: older.created_at }, 0)).resolves.toMatchObject({ items: [] })
  })

  test("from posterior a to da 422 date_range_inverted, no una página vacía", async () => {
    const bff = mockBff({ signedIn: ADMIN })
    const [newest, older] = bff.audit
    await expect(audit.listAuditLog({ from: newest.created_at, to: older.created_at }, 0)).rejects.toMatchObject({
      status: 422, details: [{ loc: ["query"], type: "date_range_inverted" }],
    })
  })

  test("pagina con has_more", async () => {
    const bff = mockBff({ signedIn: ADMIN })
    const page = await audit.listAuditLog({}, 0)
    expect(page.has_more).toBe(bff.audit.length > audit.AUDIT_PAGE_SIZE)
    expect(page.items).toHaveLength(Math.min(bff.audit.length, audit.AUDIT_PAGE_SIZE))
    await expect(audit.listAuditLog({}, bff.audit.length)).resolves.toMatchObject({ items: [], has_more: false })
  })
})
