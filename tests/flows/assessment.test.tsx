import { screen, waitFor, within } from "@testing-library/react"
import { delay, http, HttpResponse } from "msw"
import { describe, expect, test } from "vitest"
import { mockBff } from "../msw/bff"
import { DISCLAIMER, PATIENT, QUICK_PREDICTION, SCHEMA, uniformError } from "../msw/fixtures"
import { server } from "../msw/server"
import { FIELD_VALUES, MEDICA, fill, openPatientFile, renderApp } from "./helpers"

type User = Awaited<ReturnType<typeof renderApp>>

async function openQuick() {
  const bff = mockBff({ signedIn: MEDICA })
  const user = await renderApp()
  await user.click(await screen.findByRole("button", { name: "Evaluación rápida" }))
  await screen.findByLabelText("Edad")
  return { bff, user }
}

async function openPatientAssessment() {
  const bff = mockBff({ signedIn: MEDICA })
  const user = await renderApp()
  await openPatientFile(user)
  await user.click(screen.getByRole("button", { name: "Nueva evaluación" }))
  await screen.findByLabelText("Edad")
  return { bff, user }
}

const quickSubmit = () => screen.getByRole("button", { name: /Calcular riesgo|Calculando/ })
const patientSubmit = () => screen.getByRole("button", { name: /Registrar y calcular riesgo|Registrando/ })
const noteOf = (label: string) => screen.getByLabelText(label).closest("div")!
const measurementCalls = (calls: string[]) => calls.filter((c) => c === `POST /api/v1/patients/${PATIENT.id}/measurements`)

describe("el formulario se alimenta de /prediction/schema (decisiones 2 y B)", () => {
  test("muestra los campos, unidades y rangos que publica la API", async () => {
    await openQuick()
    expect(noteOf("Temperatura")).toHaveTextContent("°C · rango del modelo: 33.89 a 40")
    expect(noteOf("IMC")).toHaveTextContent("kg/m² · rango del modelo: 14.9 a 27.9")
  })

  test("si la API publica otros rangos, las notas y los estados cambian: nada está codificado", async () => {
    mockBff({ signedIn: MEDICA })
    const altered = { ...SCHEMA, fields: SCHEMA.fields.map((f) => f.name === "temperature_c"
      ? { ...f, unit: "°X", training_range: { min: 1, max: 2 }, physiological_limits: { ...f.physiological_limits, min: 0, max: 500 } } : f) }
    server.use(http.get("*/api/v1/prediction/schema", () => HttpResponse.json(altered)))
    const user = await renderApp()
    await user.click(await screen.findByRole("button", { name: "Evaluación rápida" }))
    await screen.findByLabelText("Edad")
    expect(noteOf("Temperatura")).toHaveTextContent("°X · rango del modelo: 1 a 2")
    await fill(user, { Temperatura: "98.6" })
    // Con el esquema normal 98.6 es imposible; con este es solo un aviso.
    expect(screen.getByLabelText("Temperatura")).toHaveAttribute("aria-invalid", "false")
    expect(noteOf("Temperatura")).toHaveTextContent(/Fuera del rango de entrenamiento/)
  })

  test("mientras carga el esquema no hay formulario; se indica que se cargan los rangos", async () => {
    mockBff({ signedIn: MEDICA })
    server.use(http.get("*/api/v1/prediction/schema", async () => { await delay(400); return HttpResponse.json(SCHEMA) }))
    const user = await renderApp()
    await user.click(await screen.findByRole("button", { name: "Evaluación rápida" }))
    expect(await screen.findByText("Cargando rangos del modelo…")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Calcular riesgo" })).not.toBeInTheDocument()
    expect(await screen.findByLabelText("Edad")).toBeInTheDocument()
  })

  test("si el esquema no responde, no se puede evaluar: error con Reintentar, que lo vuelve a pedir", async () => {
    mockBff({ signedIn: MEDICA })
    let fails = true
    server.use(http.get("*/api/v1/prediction/schema", () => (fails ? HttpResponse.json(uniformError("forbidden", "x"), { status: 403 }) : HttpResponse.json(SCHEMA))))
    const user = await renderApp()
    await user.click(await screen.findByRole("button", { name: "Evaluación rápida" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudieron cargar los rangos del modelo/)
    expect(screen.queryByLabelText("Edad")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Calcular riesgo" })).not.toBeInTheDocument()
    fails = false
    await user.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(await screen.findByLabelText("Edad")).toBeInTheDocument()
  })
})

describe("los tres estados de validación (decisión 7)", () => {
  test("normal: con todos los campos válidos el botón se habilita", async () => {
    const { user } = await openQuick()
    expect(quickSubmit()).toBeDisabled()
    await fill(user, FIELD_VALUES)
    expect(quickSubmit()).toBeEnabled()
    expect(screen.queryByText(/Valor imposible|Fuera del rango/)).not.toBeInTheDocument()
  })

  test("error bloqueante: un valor imposible se marca y bloquea el envío", async () => {
    const { user } = await openQuick()
    await fill(user, { ...FIELD_VALUES, Temperatura: "98.6" })
    expect(screen.getByLabelText("Temperatura")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText(/Valor imposible/)).toBeInTheDocument()
    expect(quickSubmit()).toBeDisabled()
  })

  test("aviso no bloqueante: fuera del rango de entrenamiento avisa y permite enviar", async () => {
    const { user } = await openQuick()
    await fill(user, { ...FIELD_VALUES, IMC: "32" })
    expect(screen.getByLabelText("IMC")).toHaveAttribute("aria-invalid", "false")
    expect(screen.getByText(/Fuera del rango de entrenamiento/)).toBeInTheDocument()
    expect(quickSubmit()).toBeEnabled()
  })

  test("una diastólica mayor o igual que la sistólica muestra una alerta y bloquea el envío", async () => {
    const { user } = await openQuick()
    await fill(user, { ...FIELD_VALUES, "Presión diastólica": "118" })
    expect(screen.getByRole("alert")).toHaveTextContent("La presión diastólica debe ser menor que la sistólica")
    expect(quickSubmit()).toBeDisabled()
  })

  test("el servidor confirma: si rechaza (422) un valor que la interfaz dejó pasar, el error va a su campo y se piden rangos nuevos", async () => {
    const { bff, user } = await openQuick()
    await fill(user, FIELD_VALUES)
    server.use(http.post("*/api/v1/predict", () => HttpResponse.json(uniformError("validation_error", "La solicitud no es válida.", [{ loc: ["body", "temperature_c"], type: "less_than_equal" }]), { status: 422 }), { once: true }))
    const schemaCallsBefore = bff.calls.filter((c) => c.endsWith("/prediction/schema")).length
    await user.click(quickSubmit())
    await waitFor(() => expect(screen.getByLabelText("Temperatura")).toHaveAttribute("aria-invalid", "true"))
    expect(noteOf("Temperatura")).toHaveTextContent("El valor está por encima del máximo admitido.")
    expect(screen.getByLabelText("Edad")).toHaveAttribute("aria-invalid", "false")
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
    await waitFor(() => expect(bff.calls.filter((c) => c.endsWith("/prediction/schema")).length).toBe(schemaCallsBefore + 1))
  })
})

describe("resultado de la predicción (HU007, decisión 8)", () => {
  test("muestra nivel de riesgo, probabilidades, versión del modelo, fecha y la advertencia clínica de la API", async () => {
    const { user } = await openQuick()
    await fill(user, FIELD_VALUES)
    await user.click(quickSubmit())
    const card = (await screen.findByRole("heading", { name: "Riesgo Moderado" })).closest("section")!
    expect(card).toHaveTextContent("Bajo 5% · Moderado 70% · Alto 26%")
    expect(card).toHaveTextContent("Modelo 9.9.9")
    expect(card).toHaveTextContent(/2026/)
    expect(card).toHaveTextContent(DISCLAIMER)
    expect(card).not.toHaveTextContent(/simulado/i)
  })

  test("con aviso de extrapolación muestra el mensaje de la API junto al nombre del campo", async () => {
    const { user } = await openQuick()
    await fill(user, { ...FIELD_VALUES, IMC: "32" })
    await user.click(quickSubmit())
    const card = (await screen.findByRole("heading", { name: "Riesgo Alto" })).closest("section")!
    expect(card).toHaveTextContent(/IMC: Valor por encima del rango de entrenamiento/)
    expect(card).toHaveTextContent(DISCLAIMER)
  })

  test("un resultado sin advertencia clínica no se muestra", async () => {
    const { user } = await openQuick()
    await fill(user, FIELD_VALUES)
    server.use(http.post("*/api/v1/predict", () => HttpResponse.json({ ...QUICK_PREDICTION, clinical_disclaimer: "" })))
    await user.click(quickSubmit())
    expect(await screen.findByRole("alert")).toHaveTextContent(/sin la advertencia clínica/)
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })

  test("editar un valor tras calcular retira el resultado anterior", async () => {
    const { user } = await openQuick()
    await fill(user, FIELD_VALUES)
    await user.click(quickSubmit())
    await screen.findByRole("heading", { name: "Riesgo Moderado" })
    await fill(user, { "Presión sistólica": "130" })
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })

  test("editar mientras se calcula descarta la respuesta que llega después", async () => {
    const { user } = await openQuick()
    await fill(user, FIELD_VALUES)
    server.use(http.post("*/api/v1/predict", async () => { await delay(300); return HttpResponse.json(QUICK_PREDICTION) }))
    await user.click(quickSubmit())
    await fill(user, { Edad: "33" })
    await delay(500)
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })

  test("la evaluación rápida no guarda nada: usa /predict y lo dice", async () => {
    const { bff, user } = await openQuick()
    expect(screen.getByText(/no se asocia a una paciente ni guarda información/)).toBeInTheDocument()
    await fill(user, FIELD_VALUES)
    await user.click(quickSubmit())
    await screen.findByRole("heading", { name: "Riesgo Moderado" })
    expect(bff.calls).toContain("POST /api/v1/predict")
    expect(bff.calls.filter((c) => c.includes("measurements"))).toEqual([])
  })
})

describe("evaluación de una paciente: una sola operación (decisión F)", () => {
  test("registrar guarda medición y predicción con UN POST, muestra el resultado y bloquea el reenvío", async () => {
    const { bff, user } = await openPatientAssessment()
    expect(screen.getByText(/Paciente: Paciente Ficticia Ejemplo Uno/)).toBeInTheDocument()
    await fill(user, FIELD_VALUES)
    await user.click(patientSubmit())
    expect(await screen.findByRole("heading", { name: "Riesgo Moderado" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Evaluación registrada en la ficha.")
    expect(measurementCalls(bff.calls)).toHaveLength(1)
    expect(bff.calls).not.toContain("POST /api/v1/predict")
    // Ya registrada: el formulario queda de solo lectura para no duplicarla.
    expect(screen.getByLabelText("Edad")).toBeDisabled()
    expect(screen.queryByRole("button", { name: /Registrar y calcular riesgo/ })).not.toBeInTheDocument()
  })

  test("la evaluación registrada aparece en la ficha y su resultado guardado se puede consultar", async () => {
    const { bff, user } = await openPatientAssessment()
    await fill(user, { ...FIELD_VALUES, IMC: "32" })
    await user.click(patientSubmit())
    await screen.findByRole("heading", { name: "Riesgo Alto" })
    await user.click(screen.getByRole("button", { name: "Volver a la ficha" }))
    await user.click(await screen.findByRole("button", { name: "Ver resultado" }))
    const card = (await screen.findByRole("heading", { name: "Riesgo Alto" })).closest("section")!
    expect(card).toHaveTextContent(DISCLAIMER)
    expect(card).toHaveTextContent("Modelo 9.9.9")
    expect(card).toHaveTextContent(/IMC: Valor por encima/)
    expect(bff.calls.some((c) => c.startsWith("GET /api/v1/predictions/"))).toBe(true)
  })

  test("503 (nada se guardó): conserva los valores y permite reintentar a mano, sin reintento automático", async () => {
    const { bff, user } = await openPatientAssessment()
    await fill(user, FIELD_VALUES)
    let calls = 0
    server.use(http.post(`*/api/v1/patients/${PATIENT.id}/measurements`, () => { calls++; return HttpResponse.json(uniformError("database_unavailable", "La base de datos no está disponible."), { status: 503 }) }, { once: true }))
    await user.click(patientSubmit())
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("La base de datos no está disponible.")
    expect(alert).toHaveTextContent("ref-ficticia-1")
    await delay(300)
    expect(calls).toBe(1)
    expect(screen.getByLabelText("Edad")).toHaveValue(28)
    await user.click(patientSubmit())
    expect(await screen.findByRole("heading", { name: "Riesgo Moderado" })).toBeInTheDocument()
    expect(measurementCalls(bff.calls)).toHaveLength(1)
  })

  test("fallo de red (resultado desconocido): no repite el POST, lo dice y manda a comprobar la ficha", async () => {
    const { user } = await openPatientAssessment()
    await fill(user, FIELD_VALUES)
    let calls = 0
    server.use(http.post(`*/api/v1/patients/${PATIENT.id}/measurements`, () => { calls++; return HttpResponse.error() }))
    await user.click(patientSubmit())
    expect(await screen.findByRole("alert")).toHaveTextContent(/No sabemos si la operación se guardó/)
    await delay(300)
    expect(calls).toBe(1)
    expect(patientSubmit()).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Ver evaluaciones de la paciente" }))
    expect(await screen.findByRole("heading", { level: 1, name: /Paciente Ficticia Ejemplo Uno/ })).toBeInTheDocument()
  })

  test("422 del servidor: nada se guarda y el error va a su campo", async () => {
    const { bff, user } = await openPatientAssessment()
    await fill(user, FIELD_VALUES)
    server.use(http.post(`*/api/v1/patients/${PATIENT.id}/measurements`, () => HttpResponse.json(uniformError("validation_error", "La solicitud no es válida.", [{ loc: ["body", "bmi_kg_m2"], type: "greater_than_equal" }]), { status: 422 }), { once: true }))
    await user.click(patientSubmit())
    await waitFor(() => expect(screen.getByLabelText("IMC")).toHaveAttribute("aria-invalid", "true"))
    expect(noteOf("IMC")).toHaveTextContent("El valor está por debajo del mínimo admitido.")
    expect(bff.measurements).toHaveLength(0)
  })

  test("si la paciente fue dada de baja entretanto (404), lo dice y ofrece volver a pacientes", async () => {
    const { bff, user } = await openPatientAssessment()
    await fill(user, FIELD_VALUES)
    bff.patients.clear()
    await user.click(patientSubmit())
    expect(await screen.findByRole("alert")).toHaveTextContent("Paciente no encontrada.")
    await user.click(screen.getByRole("button", { name: "Volver a pacientes" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
  })

  test("pasar de la evaluación de una paciente a la rápida no arrastra valores ni resultado", async () => {
    const { user } = await openPatientAssessment()
    await fill(user, FIELD_VALUES)
    await user.click(patientSubmit())
    await screen.findByRole("heading", { name: "Riesgo Moderado" })
    await user.click(screen.getByRole("button", { name: "Evaluación rápida" }))
    expect(await screen.findByText(/no se asocia a una paciente/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
    expect(await screen.findByLabelText("Edad")).toHaveValue(null)
  })
})

describe("corrección de una medición (HU005: actualizar)", () => {
  async function registerAndOpenCorrection(user: User) {
    await fill(user, FIELD_VALUES)
    await user.click(patientSubmit())
    await screen.findByRole("heading", { name: "Riesgo Moderado" })
    await user.click(screen.getByRole("button", { name: "Volver a la ficha" }))
    await user.click(await screen.findByRole("button", { name: "Corregir" }))
    await screen.findByRole("heading", { level: 1, name: "Corregir evaluación" })
  }

  test("abre el formulario con los valores registrados y guarda por /measurements/{id}/corrections", async () => {
    const { bff, user } = await openPatientAssessment()
    await registerAndOpenCorrection(user)
    expect(await screen.findByLabelText("Edad")).toHaveValue(28)
    expect(screen.getByText(/La evaluación original no se edita/)).toBeInTheDocument()
    await fill(user, { IMC: "32" })
    await user.click(screen.getByRole("button", { name: "Guardar corrección y recalcular" }))
    expect(await screen.findByRole("heading", { name: "Riesgo Alto" })).toBeInTheDocument()
    expect(bff.calls.filter((c) => /\/measurements\/[^/]+\/corrections$/.test(c))).toHaveLength(1)
    // La original deja de estar vigente: en la ficha queda una sola evaluación.
    await user.click(screen.getByRole("button", { name: "Volver a la ficha" }))
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Corregir" })).toHaveLength(1))
  })

  test("si ya fue corregida (409), muestra el mensaje de la API", async () => {
    const { bff, user } = await openPatientAssessment()
    await registerAndOpenCorrection(user)
    bff.measurements = []
    await user.click(screen.getByRole("button", { name: "Guardar corrección y recalcular" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa medición ya fue corregida.")
    expect(within(screen.getByRole("main")).getByRole("button", { name: "Volver a la ficha" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })
})
