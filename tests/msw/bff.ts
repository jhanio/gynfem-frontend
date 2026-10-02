// BFF simulado para las pruebas de flujo: responde en la frontera /api/* con la
// forma del contrato. Tiene estado (pacientes, mediciones, usuarios) por prueba.
import { http, HttpResponse } from "msw"
import type { AuditEntry, Evaluation, HistoryItem, MeasurementListItem, ModelMetrics, Patient, PredictionDetail, Report, Session, SystemSettings, User } from "@/lib/api/types"
import { ADMIN, AUDIT_ENTRIES, DISCLAIMER, GENERATED_AT, MEDICA, MODEL_METRICS, PATIENT, QUICK_PREDICTION, SCHEMA, SETTINGS, WARNED_PREDICTION, summaryOf, uniformError, user } from "./fixtures"
import { server } from "./server"

export const VALID_PASSWORD = "clave-ficticia-valida"

const ACCOUNTS = new Map<string, Session>([[MEDICA.email, MEDICA], [ADMIN.email, ADMIN]])
const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`

export type Bff = {
  calls: string[]
  session: Session | null
  patients: Map<string, Patient>
  measurements: MeasurementListItem[]
  predictions: Map<string, PredictionDetail>
  users: User[]
  // Fase 16. Historial y auditoría, de lo más reciente a lo más antiguo.
  evaluations: HistoryItem[]
  settings: SystemSettings
  audit: AuditEntry[]
  metrics: ModelMetrics
}

const json = (body: unknown, status = 200) => HttpResponse.json(body as Record<string, unknown>, { status })
const fail = (status: number, code: string, message: string, details?: Array<{ loc: Array<string | number>; type: string }>) =>
  json(uniformError(code, message, details), status)
export const unauthorized = () => fail(401, "invalid_token", "El token de acceso no es válido.")
// Como el backend (gynfem-backend/app/schemas/patients.py): quita los espacios
// de los extremos, pasa a mayúsculas y valida el formato del tipo de documento.
const DOCUMENT_FORMAT: Record<string, RegExp> = { DNI: /^[0-9]{8}$/, CE: /^[A-Z0-9]{4,20}$/, PASAPORTE: /^[A-Z0-9]{4,20}$/ }
function normalizeDocument(type: string | undefined, number: string): string | null {
  const clean = number.trim().toUpperCase()
  return DOCUMENT_FORMAT[type ?? ""]?.test(clean) ? clean : null
}
// Mínimo de letras o dígitos de una búsqueda por nombre (NOMBRE_BUSQUEDA_MIN).
const NAME_SEARCH_MIN = 3
// En la búsqueda el formato lo valida el modelo entero (`loc: ["body"]`); al
// registrar o editar, el campo.
const invalidDocumentNumber = (loc: string[]) => fail(422, "validation_error", "La solicitud no es válida.", [{ loc, type: "document_number_format" }])

function predictionFor(values: Record<string, number>) {
  const bmi = SCHEMA.fields.find((f) => f.name === "bmi_kg_m2")!
  return values.bmi_kg_m2 > bmi.training_range.max ? WARNED_PREDICTION : QUICK_PREDICTION
}

function validation(values: Record<string, number>) {
  const details = SCHEMA.fields
    .filter((f) => values[f.name] > f.physiological_limits.max || values[f.name] < f.physiological_limits.min)
    .map((f) => ({ loc: ["body", f.name], type: values[f.name] > f.physiological_limits.max ? "less_than_equal" : "greater_than_equal" }))
  return details.length > 0 ? fail(422, "validation_error", "La solicitud no es válida.", details) : null
}

// signedIn: la sesión que GET /api/session restaura (como si ya hubiera cookies).
// Reglas de PATCH /settings (API_SPEC §3.7.4; app/services/settings_catalog.py).
const PAGE_SIZE_MIN = 1, PAGE_SIZE_MAX = 50, INSTITUTION_NAME_MAX = 100
// Caracteres de control, de formato (ancho cero, inversión de dirección) y separadores de línea.
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u
const SETTING_KEYS = ["institution_name", "history_default_page_size"]
type Detail = { loc: Array<string | number>; type: string }

// Devuelve los valores normalizados o el detalle del 422.
function validateSettings(body: Record<string, unknown>): { values: Record<string, string | number> } | { details: Detail[] } {
  const keys = Object.keys(body)
  if (keys.length === 0) return { details: [{ loc: ["body"], type: "empty_update" }] }
  const extra = keys.filter((key) => !SETTING_KEYS.includes(key))
  if (extra.length > 0) return { details: extra.map((key) => ({ loc: ["body", key], type: "extra_forbidden" })) }
  if (keys.some((key) => body[key] === null)) return { details: [{ loc: ["body"], type: "null_field" }] }
  const values: Record<string, string | number> = {}
  const details: Detail[] = []
  if ("institution_name" in body) {
    const loc = ["body", "institution_name"]
    const raw = body.institution_name
    const name = typeof raw === "string" ? raw.normalize("NFC").trim() : null
    if (name === null) details.push({ loc, type: "string_type" })
    else if (CONTROL_OR_FORMAT.test(name)) details.push({ loc, type: "control_character" })
    else if (name.length === 0 || name.length > INSTITUTION_NAME_MAX) details.push({ loc, type: "institution_name_length" })
    else values.institution_name = name
  }
  if ("history_default_page_size" in body) {
    const loc = ["body", "history_default_page_size"]
    const size = body.history_default_page_size
    if (typeof size !== "number" || !Number.isInteger(size)) details.push({ loc, type: "int_type" })
    else if (size < PAGE_SIZE_MIN) details.push({ loc, type: "greater_than_equal" })
    else if (size > PAGE_SIZE_MAX) details.push({ loc, type: "less_than_equal" })
    else values.history_default_page_size = size
  }
  return details.length > 0 ? { details } : { values }
}

type Options = { signedIn?: Session; patients?: Patient[]; users?: User[]; evaluations?: HistoryItem[]; settings?: SystemSettings; audit?: AuditEntry[]; metrics?: ModelMetrics }

export function mockBff(options: Options = {}): Bff {
  const bff: Bff = {
    calls: [],
    session: options.signedIn ?? null,
    patients: new Map((options.patients ?? [PATIENT]).map((p) => [p.id, p])),
    measurements: [],
    predictions: new Map(),
    users: options.users ?? Array.from({ length: 8 }, (_, i) => user(i + 1, i === 0 ? { role: "administrador", email: ADMIN.email, id: ADMIN.id } : {})),
    evaluations: options.evaluations ?? [],
    settings: options.settings ?? SETTINGS,
    audit: options.audit ?? AUDIT_ENTRIES,
    metrics: options.metrics ?? MODEL_METRICS,
  }
  let sequence = 0
  const track = (request: Request) => { bff.calls.push(`${request.method} ${new URL(request.url).pathname}`) }
  const guard = (...roles: Array<Session["role"]>) =>
    !bff.session ? unauthorized() : !roles.includes(bff.session.role) ? fail(403, "forbidden", "No tiene permiso para esta operación.") : null
  // Cada escritura auditada añade su registro, con una hora posterior a las anteriores.
  let auditSequence = 0
  const record = (action: string, entityId: string | null, changedFields: string[] | null = null): string => {
    auditSequence++
    const createdAt = `2026-10-01T12:${String(Math.floor(auditSequence / 60)).padStart(2, "0")}:${String(auditSequence % 60).padStart(2, "0")}.000000Z`
    const entry: AuditEntry = {
      created_at: createdAt, actor_user_id: bff.session?.id ?? null, action, entity_type: action.split(".")[0], entity_id: entityId,
      request_id: uuid("dddddddd", auditSequence), outcome: "success", changed_fields: changedFields,
    }
    bff.audit = [entry, ...bff.audit]
    return createdAt
  }

  const store = (patientId: string, values: Record<string, number>, replaces?: string): Evaluation => {
    sequence++
    const measurement = { id: uuid("aaaaaaaa", sequence), patient_id: patientId, measured_at: "2026-09-26T01:21:37.192880Z", ...values }
    const view = predictionFor(values)
    // Lo que se guarda. La advertencia va en cada respuesta: en el historial, una vez en la página.
    const stored = {
      id: uuid("bbbbbbbb", sequence), risk_level: view.risk_level, probabilities: view.probabilities,
      extrapolation_warnings: view.extrapolation_warnings,
      model_version: view.model_version, conversion_schema_version: view.conversion_schema_version, predicted_at: view.predicted_at,
    }
    const prediction = { ...stored, clinical_disclaimer: DISCLAIMER }
    if (replaces) bff.measurements = bff.measurements.filter((m) => m.id !== replaces)
    // El historial conserva la corregida, marcada.
    bff.evaluations = [
      { measurement, prediction: stored, status: "current" },
      ...bff.evaluations.map((item): HistoryItem => (item.measurement.id === replaces ? { ...item, status: "corrected" } : item)),
    ]
    bff.measurements = [{ ...measurement, prediction_id: prediction.id }, ...bff.measurements]
    bff.predictions.set(prediction.id, { ...prediction, measurement_id: measurement.id, input: values, model_input: values })
    return { measurement, prediction }
  }

  server.use(
    http.get("*/api/wake", ({ request }) => { track(request); return json({ status: "ok" }) }),
    http.get("*/api/session", ({ request }) => { track(request); return bff.session ? json(bff.session) : fail(401, "not_authenticated", "Se requiere autenticación.") }),
    http.post("*/api/session", async ({ request }) => {
      track(request)
      const { email, password } = (await request.json()) as { email: string; password: string }
      const account = ACCOUNTS.get(email)
      if (!account || password !== VALID_PASSWORD) return fail(401, "invalid_credentials", "Correo o contraseña incorrectos.")
      bff.session = account
      return json(account)
    }),
    http.delete("*/api/session", ({ request }) => { track(request); bff.session = null; return new HttpResponse(null, { status: 204 }) }),

    http.get("*/api/v1/prediction/schema", ({ request }) => { track(request); return guard("medico") ?? json(SCHEMA) }),
    http.post("*/api/v1/predict", async ({ request }) => {
      track(request)
      const values = (await request.json()) as Record<string, number>
      return guard("medico") ?? validation(values) ?? json(predictionFor(values))
    }),

    http.post("*/api/v1/patients/search", async ({ request }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      const body = (await request.json()) as { name?: string; document_type?: string; document_number?: string; limit: number; offset: number }
      const documentNumber = body.document_number === undefined ? undefined : normalizeDocument(body.document_type, body.document_number)
      if (documentNumber === null) return invalidDocumentNumber(["body"])
      if (body.name !== undefined && (body.name.normalize("NFKD").match(/[\p{L}\p{N}]/gu) ?? []).length < NAME_SEARCH_MIN) {
        return fail(422, "validation_error", "La solicitud no es válida.", [{ loc: ["body"], type: "search_criterion_required" }])
      }
      const all = [...bff.patients.values()].filter((p) => body.name !== undefined
        ? `${p.given_names} ${p.family_names}`.toLowerCase().split(" ").some((word) => word.startsWith(body.name!.toLowerCase()))
        : p.document_type === body.document_type && p.document_number === documentNumber)
      return json({ items: all.slice(body.offset, body.offset + body.limit).map(summaryOf), limit: body.limit, offset: body.offset, has_more: all.length > body.offset + body.limit })
    }),
    http.post("*/api/v1/patients", async ({ request }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      const received = (await request.json()) as Omit<Patient, "id" | "created_at" | "updated_at">
      const documentNumber = normalizeDocument(received.document_type, received.document_number)
      if (documentNumber === null) return invalidDocumentNumber(["body", "document_number"])
      const input = { ...received, document_number: documentNumber }
      if ([...bff.patients.values()].some((p) => p.document_type === input.document_type && p.document_number === input.document_number)) {
        return fail(409, "patient_already_exists", "Ya hay una paciente activa con ese documento.")
      }
      const patient: Patient = { ...input, id: uuid("cccccccc", ++sequence), created_at: "2026-09-30T00:00:00Z", updated_at: "2026-09-30T00:00:00Z" }
      bff.patients.set(patient.id, patient)
      return json(patient, 201)
    }),
    http.get("*/api/v1/patients/:id", ({ request, params }) => {
      track(request)
      const patient = bff.patients.get(String(params.id))
      return guard("medico") ?? (patient ? json(patient) : fail(404, "patient_not_found", "Paciente no encontrada."))
    }),
    http.patch("*/api/v1/patients/:id", async ({ request, params }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      const patient = bff.patients.get(String(params.id))
      if (!patient) return fail(404, "patient_not_found", "Paciente no encontrada.")
      const changes = (await request.json()) as Partial<Patient>
      const documentNumber = changes.document_number === undefined ? undefined : normalizeDocument(changes.document_type, changes.document_number)
      if (documentNumber === null) return invalidDocumentNumber(["body", "document_number"])
      const updated = { ...patient, ...changes, ...(documentNumber === undefined ? {} : { document_number: documentNumber }) }
      bff.patients.set(patient.id, updated)
      return json(updated)
    }),
    http.delete("*/api/v1/patients/:id", ({ request, params }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      return bff.patients.delete(String(params.id)) ? new HttpResponse(null, { status: 204 }) : fail(404, "patient_not_found", "Paciente no encontrada.")
    }),
    http.get("*/api/v1/patients/:id/measurements", ({ request, params }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      if (!bff.patients.has(String(params.id))) return fail(404, "patient_not_found", "Paciente no encontrada.")
      return json({ items: bff.measurements.filter((m) => m.patient_id === params.id), limit: 20, offset: 0, has_more: false })
    }),
    http.post("*/api/v1/patients/:id/measurements", async ({ request, params }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      const values = (await request.json()) as Record<string, number>
      if (!bff.patients.has(String(params.id))) return fail(404, "patient_not_found", "Paciente no encontrada.")
      return validation(values) ?? json(store(String(params.id), values), 201)
    }),
    http.post("*/api/v1/measurements/:id/corrections", async ({ request, params }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      const values = (await request.json()) as Record<string, number>
      const original = bff.measurements.find((m) => m.id === params.id)
      if (!original) return fail(409, "measurement_already_corrected", "Esa medición ya fue corregida.")
      return validation(values) ?? json(store(original.patient_id, values, original.id), 201)
    }),
    http.get("*/api/v1/predictions/:id", ({ request, params }) => {
      track(request)
      const prediction = bff.predictions.get(String(params.id))
      return guard("medico") ?? (prediction ? json(prediction) : fail(404, "prediction_not_found", "Predicción no encontrada."))
    }),

    http.get("*/api/v1/users", ({ request }) => {
      track(request)
      const denied = guard("administrador")
      if (denied) return denied
      const query = new URL(request.url).searchParams
      const limit = Number(query.get("limit")), offset = Number(query.get("offset"))
      return json({ items: bff.users.slice(offset, offset + limit), limit, offset, has_more: bff.users.length > offset + limit })
    }),
    http.post("*/api/v1/users", async ({ request }) => {
      track(request)
      const denied = guard("administrador")
      if (denied) return denied
      const input = (await request.json()) as { email: string; password: string; full_name: string; role: User["role"] }
      if (bff.users.some((u) => u.email === input.email.toLowerCase())) return fail(409, "user_already_exists", "Ya existe un usuario con ese correo.")
      if (new TextEncoder().encode(input.password).length < 12) return fail(422, "validation_error", "La solicitud no es válida.", [{ loc: ["body", "password"], type: "password_length" }])
      const created = user(bff.users.length + 1, { email: input.email.toLowerCase(), full_name: input.full_name, role: input.role })
      bff.users = [...bff.users, created]
      return json(created, 201)
    }),
    http.patch("*/api/v1/users/:id", async ({ request, params }) => {
      track(request)
      const denied = guard("administrador")
      if (denied) return denied
      const changes = (await request.json()) as Partial<User>
      bff.users = bff.users.map((u) => (u.id === params.id ? { ...u, ...changes } : u))
      return json(bff.users.find((u) => u.id === params.id))
    }),
    http.post("*/api/v1/users/:id/:action", ({ request, params }) => {
      track(request)
      const denied = guard("administrador")
      if (denied) return denied
      const target = bff.users.find((u) => u.id === params.id)
      if (!target) return fail(404, "user_not_found", "Usuario no encontrado.")
      const activate = params.action === "activate"
      if (!activate && target.role === "administrador" && bff.users.filter((u) => u.role === "administrador" && u.is_active).length === 1) {
        return fail(409, "last_active_admin", "No se puede dejar el sistema sin un administrador activo.")
      }
      bff.users = bff.users.map((u) => (u.id === target.id ? { ...u, is_active: activate } : u))
      return json({ ...target, is_active: activate })
    }),

    http.get("*/api/v1/patients/:id/evaluations", ({ request, params }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      if (!bff.patients.has(String(params.id))) return fail(404, "patient_not_found", "Paciente no encontrada.")
      const query = new URL(request.url).searchParams
      // Sin `limit` rige el parámetro del sistema; la respuesta dice cuál se aplicó.
      const limit = query.has("limit") ? Number(query.get("limit")) : bff.settings.history_default_page_size.value
      const offset = Number(query.get("offset") ?? 0)
      if (!Number.isInteger(limit) || limit < PAGE_SIZE_MIN || limit > PAGE_SIZE_MAX) {
        return fail(422, "validation_error", "La solicitud no es válida.", [{ loc: ["query", "limit"], type: limit > PAGE_SIZE_MAX ? "less_than_equal" : "greater_than_equal" }])
      }
      const all = bff.evaluations.filter((item) => item.measurement.patient_id === params.id)
      return json({ items: all.slice(offset, offset + limit), limit, offset, has_more: all.length > offset + limit, clinical_disclaimer: DISCLAIMER })
    }),
    http.post("*/api/v1/predictions/:id/report", ({ request, params }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      const item = bff.evaluations.find((evaluation) => evaluation.prediction.id === params.id)
      const patient = item && bff.patients.get(item.measurement.patient_id)
      // Inexistente o de una paciente dada de baja: el mismo 404, sin auditar.
      if (!item || !patient) return fail(404, "prediction_not_found", "Predicción no encontrada.")
      record("prediction.report", item.prediction.id)
      // En el reporte la medición no lleva `patient_id`: la paciente va en `patient`.
      const measurement = Object.fromEntries(Object.entries(item.measurement).filter(([name]) => name !== "patient_id")) as Report["measurement"]
      const report: Report = {
        institution_name: bff.settings.institution_name.value,
        generated_at: GENERATED_AT,
        patient: { id: patient.id, document_type: patient.document_type, document_number: patient.document_number, given_names: patient.given_names, family_names: patient.family_names },
        measurement,
        prediction: { ...item.prediction, status: item.status },
        clinical_disclaimer: DISCLAIMER,
      }
      return HttpResponse.json(report, { headers: { "Cache-Control": "no-store" } })
    }),

    http.get("*/api/v1/model/metrics", ({ request }) => { track(request); return guard("medico", "administrador") ?? json(bff.metrics) }),

    http.get("*/api/v1/settings", ({ request }) => { track(request); return guard("administrador") ?? json(bff.settings) }),
    http.patch("*/api/v1/settings", async ({ request }) => {
      track(request)
      const denied = guard("administrador")
      if (denied) return denied
      const result = validateSettings((await request.json()) as Record<string, unknown>)
      if ("details" in result) return fail(422, "validation_error", "La solicitud no es válida.", result.details)
      // Un valor igual al vigente no escribe nada: ni fila ni auditoría.
      for (const [name, value] of Object.entries(result.values)) {
        const key = name as keyof SystemSettings
        if (bff.settings[key].value === value) continue
        const updatedAt = record("system_setting.update", null, [key])
        bff.settings = { ...bff.settings, [key]: { ...bff.settings[key], value, updated_at: updatedAt, updated_by: bff.session?.id ?? null } }
      }
      return json(bff.settings)
    }),

    http.get("*/api/v1/audit-log", ({ request }) => {
      track(request)
      const denied = guard("administrador")
      if (denied) return denied
      const query = new URL(request.url).searchParams
      const from = query.get("from"), to = query.get("to")
      const instant = (value: string) => new Date(value).getTime()
      if (from && to && instant(from) > instant(to)) {
        return fail(422, "validation_error", "La solicitud no es válida.", [{ loc: ["query"], type: "date_range_inverted" }])
      }
      const equals = (name: "action" | "entity_type" | "entity_id" | "actor_user_id", entry: AuditEntry) => !query.has(name) || entry[name] === query.get(name)
      const all = bff.audit.filter((entry) =>
        equals("action", entry) && equals("entity_type", entry) && equals("entity_id", entry) && equals("actor_user_id", entry)
        && (!from || instant(entry.created_at) >= instant(from)) && (!to || instant(entry.created_at) < instant(to)))
      const limit = Number(query.get("limit") ?? 20), offset = Number(query.get("offset") ?? 0)
      return HttpResponse.json({ items: all.slice(offset, offset + limit), limit, offset, has_more: all.length > offset + limit }, { headers: { "Cache-Control": "no-store" } })
    }),
  )
  return bff
}
