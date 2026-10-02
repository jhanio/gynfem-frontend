import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { server } from "../msw/server"
import { EVALUATION, IN_RANGE_VALUES, MEASUREMENT_ID, MEDICA, PATIENT, PREDICTION_ID, QUICK_PREDICTION, SCHEMA, summaryOf, uniformError, user } from "../msw/fixtures"

// Los servicios y el cliente guardan estado de módulo (caché del esquema): copia nueva por prueba.
let schema: typeof import("@/services/prediction-schema")
let session: typeof import("@/services/session")
let patients: typeof import("@/services/patients")
let assessments: typeof import("@/services/assessments")
let users: typeof import("@/services/users")

beforeEach(async () => {
  vi.resetModules()
  schema = await import("@/services/prediction-schema")
  session = await import("@/services/session")
  patients = await import("@/services/patients")
  assessments = await import("@/services/assessments")
  users = await import("@/services/users")
})
afterEach(() => vi.useRealTimers())

function countingSchema() {
  const counter = { calls: 0 }
  server.use(http.get("*/api/v1/prediction/schema", () => { counter.calls++; return HttpResponse.json(SCHEMA) }))
  return counter
}

describe("esquema de predicción: caché en memoria de 10 min (decisión B)", () => {
  test("la vigencia es de 10 minutos", () => expect(schema.SCHEMA_TTL_MS).toBe(10 * 60_000))

  test("dos lecturas seguidas hacen una sola petición", async () => {
    const counter = countingSchema()
    expect(await schema.getPredictionSchema()).toEqual(SCHEMA)
    await schema.getPredictionSchema()
    expect(counter.calls).toBe(1)
  })

  test("pasados 10 minutos se vuelve a pedir", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const counter = countingSchema()
    await schema.getPredictionSchema()
    vi.setSystemTime(Date.now() + schema.SCHEMA_TTL_MS + 1000)
    await schema.getPredictionSchema()
    expect(counter.calls).toBe(2)
  })

  test("invalidatePredictionSchema obliga a pedirlo de nuevo", async () => {
    const counter = countingSchema()
    await schema.getPredictionSchema()
    schema.invalidatePredictionSchema()
    await schema.getPredictionSchema()
    expect(counter.calls).toBe(2)
  })

  test("un fallo no se guarda en la caché", async () => {
    let calls = 0
    server.use(http.get("*/api/v1/prediction/schema", () => (++calls === 1 ? HttpResponse.json(uniformError("forbidden", "x"), { status: 403 }) : HttpResponse.json(SCHEMA))))
    await expect(schema.getPredictionSchema()).rejects.toMatchObject({ status: 403 })
    await expect(schema.getPredictionSchema()).resolves.toEqual(SCHEMA)
  })

  test("cerrar sesión borra la caché", async () => {
    const counter = countingSchema()
    server.use(http.delete("*/api/session", () => new HttpResponse(null, { status: 204 })))
    await schema.getPredictionSchema()
    await session.logout()
    await schema.getPredictionSchema()
    expect(counter.calls).toBe(2)
  })
})

describe("sesión", () => {
  test("login envía las credenciales y devuelve id, rol y correo", async () => {
    let body: unknown
    server.use(http.post("*/api/session", async ({ request }) => { body = await request.json(); return HttpResponse.json(MEDICA) }))
    await expect(session.login("medica.ficticia@gynfem.test", "clave-ficticia")).resolves.toEqual(MEDICA)
    expect(body).toEqual({ email: "medica.ficticia@gynfem.test", password: "clave-ficticia" })
  })

  test("restoreSession devuelve null si no hay sesión (401)", async () => {
    server.use(http.get("*/api/session", () => HttpResponse.json(uniformError("not_authenticated", "Se requiere autenticación."), { status: 401 })))
    await expect(session.restoreSession()).resolves.toBeNull()
  })

  test("restoreSession propaga un fallo que no es 401", async () => {
    server.use(http.get("*/api/session", () => HttpResponse.json(uniformError("not_configured", "x"), { status: 503 })))
    await expect(session.restoreSession()).rejects.toMatchObject({ status: 503 })
  })

  test("logout no falla aunque el servidor no responda: la sesión local se cierra igual", async () => {
    server.use(http.delete("*/api/session", () => HttpResponse.error()))
    await expect(session.logout()).resolves.toBeUndefined()
  })
})

describe("pacientes", () => {
  test("la búsqueda por documento envía tipo y número en el cuerpo, nunca en la URL", async () => {
    let body: unknown
    let url = ""
    server.use(http.post("*/api/v1/patients/search", async ({ request }) => { url = request.url; body = await request.json(); return HttpResponse.json({ items: [summaryOf(PATIENT)], limit: 20, offset: 0, has_more: false }) }))
    const page = await patients.searchPatients({ kind: "document", documentType: "PASAPORTE", documentNumber: "FICTICIO001" }, 0)
    expect(body).toEqual({ document_type: "PASAPORTE", document_number: "FICTICIO001", limit: patients.PATIENTS_PAGE_SIZE, offset: 0 })
    expect(new URL(url).search).toBe("")
    expect(page.items[0].document_number_masked).toBe("********001")
  })

  test("normalizeDocumentNumber compara como el backend: sin espacios en los extremos y en mayúsculas", () => {
    expect(patients.normalizeDocumentNumber(" ficticio001 ")).toBe("FICTICIO001")
    expect(patients.normalizeDocumentNumber("FICTICIO001")).toBe("FICTICIO001")
  })

  test("el documento se envía como se escribió: quien lo normaliza es el backend", async () => {
    let body: unknown
    server.use(http.post("*/api/v1/patients/search", async ({ request }) => { body = await request.json(); return HttpResponse.json({ items: [], limit: 20, offset: 0, has_more: false }) }))
    await patients.searchPatients({ kind: "document", documentType: "PASAPORTE", documentNumber: "ficticio001" }, 0)
    expect(body).toEqual({ document_type: "PASAPORTE", document_number: "ficticio001", limit: patients.PATIENTS_PAGE_SIZE, offset: 0 })
  })

  test("la búsqueda por nombre envía un solo criterio y el desplazamiento", async () => {
    let body: unknown
    server.use(http.post("*/api/v1/patients/search", async ({ request }) => { body = await request.json(); return HttpResponse.json({ items: [], limit: 20, offset: 20, has_more: false }) }))
    await patients.searchPatients({ kind: "name", name: "ficticia" }, 20)
    expect(body).toEqual({ name: "ficticia", limit: patients.PATIENTS_PAGE_SIZE, offset: 20 })
  })

  test("crear, consultar, actualizar y dar de baja usan el método y la ruta del contrato", async () => {
    const calls: string[] = []
    const log = (name: string, response: Response) => { calls.push(name); return response }
    server.use(
      http.post("*/api/v1/patients", () => log("POST /patients", HttpResponse.json(PATIENT, { status: 201 }))),
      http.get(`*/api/v1/patients/${PATIENT.id}`, () => log("GET /patients/{id}", HttpResponse.json(PATIENT))),
      http.patch(`*/api/v1/patients/${PATIENT.id}`, async ({ request }) => log(`PATCH ${JSON.stringify(await request.json())}`, HttpResponse.json(PATIENT))),
      http.delete(`*/api/v1/patients/${PATIENT.id}`, () => log("DELETE /patients/{id}", new HttpResponse(null, { status: 204 }))),
    )
    const { id, created_at, updated_at, ...input } = PATIENT
    void id; void created_at; void updated_at
    await patients.createPatient(input)
    await patients.getPatient(PATIENT.id)
    await patients.updatePatient(PATIENT.id, { given_names: "Paciente Ficticia" })
    await patients.deactivatePatient(PATIENT.id)
    expect(calls).toEqual(["POST /patients", "GET /patients/{id}", 'PATCH {"given_names":"Paciente Ficticia"}', "DELETE /patients/{id}"])
  })
})

describe("evaluaciones", () => {
  test("registrar una evaluación es UN solo POST que devuelve medición y predicción (decisión F)", async () => {
    let calls = 0
    let body: unknown
    server.use(http.post(`*/api/v1/patients/${PATIENT.id}/measurements`, async ({ request }) => { calls++; body = await request.json(); return HttpResponse.json(EVALUATION, { status: 201 }) }))
    const evaluation = await assessments.registerAssessment(PATIENT.id, IN_RANGE_VALUES)
    expect(calls).toBe(1)
    expect(body).toEqual(IN_RANGE_VALUES)
    expect(evaluation.prediction.id).toBe(PREDICTION_ID)
    expect(evaluation.measurement.id).toBe(MEASUREMENT_ID)
  })

  test("un 503 al registrar no se reintenta", async () => {
    let calls = 0
    server.use(http.post(`*/api/v1/patients/${PATIENT.id}/measurements`, () => { calls++; return HttpResponse.json(uniformError("database_unavailable", "La base de datos no está disponible."), { status: 503 }) }))
    await expect(assessments.registerAssessment(PATIENT.id, IN_RANGE_VALUES)).rejects.toMatchObject({ code: "database_unavailable" })
    expect(calls).toBe(1)
  })

  test("corregir va a /measurements/{id}/corrections", async () => {
    let called = false
    server.use(http.post(`*/api/v1/measurements/${MEASUREMENT_ID}/corrections`, () => { called = true; return HttpResponse.json(EVALUATION, { status: 201 }) }))
    await assessments.correctMeasurement(MEASUREMENT_ID, IN_RANGE_VALUES)
    expect(called).toBe(true)
  })

  test("la evaluación rápida usa /predict, sin paciente", async () => {
    let body: unknown
    server.use(http.post("*/api/v1/predict", async ({ request }) => { body = await request.json(); return HttpResponse.json(QUICK_PREDICTION) }))
    await expect(assessments.quickAssessment(IN_RANGE_VALUES)).resolves.toEqual(QUICK_PREDICTION)
    expect(body).toEqual(IN_RANGE_VALUES)
  })
})

describe("usuarios", () => {
  test("el listado pagina con limit y offset y no espera un total", async () => {
    let search = ""
    server.use(http.get("*/api/v1/users", ({ request }) => { search = new URL(request.url).search; return HttpResponse.json({ items: [user(1)], limit: 6, offset: 6, has_more: true }) }))
    const page = await users.listUsers(6)
    expect(search).toBe(`?limit=${users.USERS_PAGE_SIZE}&offset=6`)
    expect(page).toMatchObject({ has_more: true })
    expect(page).not.toHaveProperty("total")
  })

  test("crear, modificar, activar y desactivar usan las rutas del contrato", async () => {
    const calls: string[] = []
    const u = user(1)
    server.use(
      http.post("*/api/v1/users", async ({ request }) => { calls.push(`POST /users ${Object.keys((await request.json()) as object).sort().join(",")}`); return HttpResponse.json(u, { status: 201 }) }),
      http.patch(`*/api/v1/users/${u.id}`, async ({ request }) => { calls.push(`PATCH ${JSON.stringify(await request.json())}`); return HttpResponse.json(u) }),
      http.post(`*/api/v1/users/${u.id}/deactivate`, () => { calls.push("deactivate"); return HttpResponse.json({ ...u, is_active: false }) }),
      http.post(`*/api/v1/users/${u.id}/activate`, () => { calls.push("activate"); return HttpResponse.json(u) }),
    )
    await users.createUser({ email: "nueva.ficticia@gynfem.test", password: "x".repeat(12), full_name: "Nueva Ficticia", role: "medico" })
    await users.updateUser(u.id, { role: "administrador" })
    await expect(users.setUserActive(u.id, false)).resolves.toMatchObject({ is_active: false })
    await users.setUserActive(u.id, true)
    expect(calls).toEqual(["POST /users email,full_name,password,role", 'PATCH {"role":"administrador"}', "deactivate", "activate"])
  })
})
