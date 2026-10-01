// BFF simulado para las pruebas de flujo: responde en la frontera /api/* con la
// forma del contrato. Tiene estado (pacientes, mediciones, usuarios) por prueba.
import { http, HttpResponse } from "msw"
import type { Evaluation, MeasurementListItem, Patient, PredictionDetail, Session, User } from "@/lib/api/types"
import { ADMIN, DISCLAIMER, MEDICA, PATIENT, QUICK_PREDICTION, SCHEMA, WARNED_PREDICTION, summaryOf, uniformError, user } from "./fixtures"
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
}

const json = (body: unknown, status = 200) => HttpResponse.json(body as Record<string, unknown>, { status })
const fail = (status: number, code: string, message: string, details?: Array<{ loc: Array<string | number>; type: string }>) =>
  json(uniformError(code, message, details), status)
export const unauthorized = () => fail(401, "invalid_token", "El token de acceso no es válido.")

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
export function mockBff(options: { signedIn?: Session; patients?: Patient[]; users?: User[] } = {}): Bff {
  const bff: Bff = {
    calls: [],
    session: options.signedIn ?? null,
    patients: new Map((options.patients ?? [PATIENT]).map((p) => [p.id, p])),
    measurements: [],
    predictions: new Map(),
    users: options.users ?? Array.from({ length: 8 }, (_, i) => user(i + 1, i === 0 ? { role: "administrador", email: ADMIN.email, id: ADMIN.id } : {})),
  }
  let sequence = 0
  const track = (request: Request) => { bff.calls.push(`${request.method} ${new URL(request.url).pathname}`) }
  const guard = (role: Session["role"]) =>
    !bff.session ? unauthorized() : bff.session.role !== role ? fail(403, "forbidden", "No tiene permiso para esta operación.") : null

  const store = (patientId: string, values: Record<string, number>, replaces?: string): Evaluation => {
    sequence++
    const measurement = { id: uuid("aaaaaaaa", sequence), patient_id: patientId, measured_at: "2026-09-26T01:21:37.192880Z", ...values }
    const view = predictionFor(values)
    const prediction = {
      id: uuid("bbbbbbbb", sequence), risk_level: view.risk_level, probabilities: view.probabilities,
      extrapolation_warnings: view.extrapolation_warnings, clinical_disclaimer: DISCLAIMER,
      model_version: view.model_version, conversion_schema_version: view.conversion_schema_version, predicted_at: view.predicted_at,
    }
    if (replaces) bff.measurements = bff.measurements.filter((m) => m.id !== replaces)
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
      const all = [...bff.patients.values()].filter((p) => body.name !== undefined
        ? `${p.given_names} ${p.family_names}`.toLowerCase().split(" ").some((word) => word.startsWith(body.name!.toLowerCase()))
        : p.document_type === body.document_type && p.document_number === body.document_number?.toUpperCase())
      return json({ items: all.slice(body.offset, body.offset + body.limit).map(summaryOf), limit: body.limit, offset: body.offset, has_more: all.length > body.offset + body.limit })
    }),
    http.post("*/api/v1/patients", async ({ request }) => {
      track(request)
      const denied = guard("medico")
      if (denied) return denied
      const input = (await request.json()) as Omit<Patient, "id" | "created_at" | "updated_at">
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
      const updated = { ...patient, ...((await request.json()) as Partial<Patient>) }
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
  )
  return bff
}
