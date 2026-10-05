import { readFileSync } from "node:fs"
import { cleanup, screen, waitFor, within } from "@testing-library/react"
import { delay, http, HttpResponse } from "msw"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { HistoryItem, Report } from "@/lib/api/types"
import { READ_RETRY_DELAYS_MS } from "@/lib/api/retry"
import { fieldLabel } from "@/lib/field-labels"
import * as format from "@/lib/format"
import { riskLabel } from "@/lib/risk"
import { mockBff, unauthorized } from "../msw/bff"
import { DISCLAIMER, GENERATED_AT, PATIENT, SCHEMA, SETTINGS, WARNED_PREDICTION, historyItem, uniformError } from "../msw/fixtures"
import { server } from "../msw/server"
import { MEDICA, loginAs, openPatientFile, renderApp } from "./helpers"

// Reporte de una evaluación (HU009; gynfem-backend/docs/API_SPEC.md §3.7.2).
const CURRENT = historyItem(1, { measuredAt: "2026-09-28T15:00:00Z", risk: "high", values: { bmi_kg_m2: 26.4 } })
const CORRECTED = historyItem(2, { measuredAt: "2026-09-24T15:00:00Z", risk: "mid", status: "corrected" })
const reportUrl = (item: HistoryItem) => `*/api/v1/predictions/${item.prediction.id}/report`
const reportCall = (item: HistoryItem) => `POST /api/v1/predictions/${item.prediction.id}/report`
const AUDIT_NOTICE = "Cada generación queda registrada en la auditoría."
const REPORT_TITLE = "Reporte de evaluación de riesgo"

// La respuesta del contrato para una evaluación, para las pruebas que la sustituyen.
function reportOf(item: HistoryItem, overrides: Partial<Report> = {}): Report {
  const measurement = Object.fromEntries(Object.entries(item.measurement).filter(([name]) => name !== "patient_id")) as Report["measurement"]
  return {
    institution_name: SETTINGS.institution_name.value, generated_at: GENERATED_AT,
    patient: { id: PATIENT.id, document_type: PATIENT.document_type, document_number: PATIENT.document_number, given_names: PATIENT.given_names, family_names: PATIENT.family_names },
    measurement, prediction: { ...item.prediction, status: item.status }, clinical_disclaimer: DISCLAIMER,
    ...overrides,
  }
}

const history = () => screen.getByRole("region", { name: "Historial de evaluaciones" })
const rows = () => within(history()).getAllByRole("listitem")
const generateButton = () => within(history()).getByRole("button", { name: /Generar reporte|Generando/ })
const report = () => screen.getByRole("article", { name: REPORT_TITLE })
const queryReport = () => screen.queryByRole("article", { name: REPORT_TITLE })
const reportCalls = (calls: string[]) => calls.filter((call) => call.endsWith("/report"))
const NO_UNITS = /Las unidades no están disponibles/

// El artículo aparece antes de que termine la lectura de sus unidades
// (GET /prediction/schema, que ReportView pide al montarse). Toda prueba que
// abre el reporte espera a que esa lectura termine —con la unidad a la vista
// (el término lleva solo la etiqueta) o con la nota de que faltan— para no
// contarla entre las peticiones de otra acción ni dejarla en vuelo hacia la
// prueba siguiente, donde consumiría sus manejadores.
async function findSettledReport() {
  const paper = await screen.findByRole("article", { name: REPORT_TITLE })
  await waitFor(() => expect(within(paper).queryByText(fieldLabel("temperature_c"), { selector: "dt" }) ?? within(paper).queryByText(NO_UNITS)).toBeInTheDocument())
  return paper
}

async function openFile(options: Parameters<typeof mockBff>[0] = {}, row = 0) {
  const bff = mockBff({ signedIn: MEDICA, evaluations: [CURRENT, CORRECTED], ...options })
  const user = await renderApp()
  await openPatientFile(user)
  await waitFor(() => expect(rows().length).toBeGreaterThan(0))
  await user.click(within(rows()[row]).getByRole("button", { name: "Ver resultado" }))
  return { bff, user }
}

async function openReport(options: Parameters<typeof mockBff>[0] = {}, row = 0) {
  const opened = await openFile(options, row)
  await opened.user.click(generateButton())
  await findSettledReport()
  return opened
}

afterEach(() => vi.restoreAllMocks())

describe("reporte: solo por una acción explícita del médico", () => {
  test("abrir la ficha y expandir una evaluación no genera ningún reporte; el botón avisa de la auditoría", async () => {
    const { bff } = await openFile()
    expect(generateButton()).toBeVisible()
    expect(rows()[0]).toHaveTextContent(AUDIT_NOTICE)
    expect(reportCalls(bff.calls)).toEqual([])
    expect(queryReport()).not.toBeInTheDocument()
  })

  test("el botón existe en vigentes y en corregidas", async () => {
    const { user } = await openFile({}, 1)
    expect(rows()[1]).toHaveTextContent("Corregida")
    expect(within(rows()[1]).getByRole("button", { name: "Generar reporte" })).toBeVisible()
    await user.click(within(rows()[0]).getByRole("button", { name: "Ver resultado" }))
    expect(within(rows()[0]).getByRole("button", { name: "Generar reporte" })).toBeVisible()
  })

  test("un clic envía exactamente un POST", async () => {
    const { bff } = await openReport()
    expect(reportCalls(bff.calls)).toEqual([reportCall(CURRENT)])
  })

  test("tres clics seguidos con la respuesta pendiente envían un solo POST", async () => {
    const { user } = await openFile()
    let calls = 0
    server.use(http.post(reportUrl(CURRENT), async () => { calls++; await delay(300); return HttpResponse.json(reportOf(CURRENT)) }))
    const button = generateButton()
    await user.click(button)
    await user.click(button)
    await user.click(button)
    expect(button).toHaveAttribute("aria-disabled", "true")
    await findSettledReport()
    expect(calls).toBe(1)
  })

  test("al recargar la aplicación no se genera nada ni se muestra el reporte anterior", async () => {
    const { bff } = await openReport()
    expect(reportCalls(bff.calls)).toHaveLength(1)
    cleanup()
    await renderApp()
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
    expect(queryReport()).not.toBeInTheDocument()
    expect(reportCalls(bff.calls)).toHaveLength(1)
  })

  test("«Cerrar» no llama a la API ni genera nada: descarta el reporte y devuelve la ficha como estaba, con el foco en el botón", async () => {
    const { bff, user } = await openReport()
    const before = [...bff.calls]
    await user.click(within(report()).getByRole("button", { name: "Cerrar" }))
    expect(queryReport()).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(PATIENT.document_number))).toBeVisible()
    expect(bff.calls).toEqual(before)
    expect(within(rows()[0]).getByRole("button", { name: "Ocultar resultado" })).toHaveAttribute("aria-expanded", "true")
    expect(generateButton()).toHaveFocus()
    expect(rows()[0]).toHaveTextContent(AUDIT_NOTICE)
  })

  test("generar de nuevo tras cerrar es otra acción explícita: envía otro POST y deja otro registro de auditoría", async () => {
    const { bff, user } = await openReport()
    const audited = () => bff.audit.filter((entry) => entry.action === "prediction.report" && entry.entity_id === CURRENT.prediction.id)
    expect(audited()).toHaveLength(1)
    await user.click(within(report()).getByRole("button", { name: "Cerrar" }))
    expect(rows()[0]).toHaveTextContent(AUDIT_NOTICE)
    await user.click(generateButton())
    await findSettledReport()
    expect(reportCalls(bff.calls)).toEqual([reportCall(CURRENT), reportCall(CURRENT)])
    expect(audited()).toHaveLength(2)
  })

  test("al abrirse, el foco pasa al título del reporte y la ficha queda oculta", async () => {
    await openReport()
    expect(within(report()).getByRole("heading", { level: 1, name: REPORT_TITLE })).toHaveFocus()
    expect(screen.queryByRole("region", { name: "Historial de evaluaciones" })).not.toBeInTheDocument()
  })

  test("si la sesión expira con el reporte abierto y reingresa el mismo usuario, el reporte sigue ahí y no se regenera", async () => {
    const bff = mockBff({ signedIn: MEDICA, evaluations: [CURRENT] })
    const user = await renderApp()
    await openPatientFile(user)
    await user.click(await within(history()).findByRole("button", { name: "Ver resultado" }))
    // La lectura de unidades del reporte encuentra la sesión caída. Se registra
    // justo antes del clic que la provoca: ninguna otra lectura puede consumirlo.
    server.use(http.get("*/api/v1/prediction/schema", () => { bff.session = null; return unauthorized() }, { once: true }))
    await user.click(generateButton())
    const dialog = await screen.findByRole("dialog", { name: "Tu sesión expiró" })
    await loginAs(user, MEDICA)
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await findSettledReport()
    expect(report()).toHaveTextContent(PATIENT.document_number)
    expect(reportCalls(bff.calls)).toHaveLength(1)
  })
})

describe("reporte: contenido del papel", () => {
  test("lleva la institución, la paciente con el documento completo, los identificadores, las versiones, las fechas y la advertencia clínica", async () => {
    await openReport()
    const paper = report()
    expect(paper).toHaveTextContent(SETTINGS.institution_name.value)
    expect(paper).toHaveTextContent(`${PATIENT.given_names} ${PATIENT.family_names}`)
    expect(paper).toHaveTextContent(`Pasaporte ${PATIENT.document_number}`)
    expect(paper).toHaveTextContent(`Predicción ${CURRENT.prediction.id}`)
    expect(paper).toHaveTextContent(`Modelo ${CURRENT.prediction.model_version}`)
    expect(paper).toHaveTextContent(`Esquema de conversión ${CURRENT.prediction.conversion_schema_version}`)
    expect(paper.textContent).toContain(`Reporte generado el ${format.formatDateTimeWithZone(GENERATED_AT)}`)
    expect(paper.textContent).toContain(format.formatDateTimeWithZone(CURRENT.measurement.measured_at))
    expect(paper.textContent).toContain(format.formatDateTimeWithZone(CURRENT.prediction.predicted_at))
    expect(within(paper).getByRole("heading", { name: "Advertencia clínica" }).parentElement).toHaveTextContent(DISCLAIMER)
  })

  test("muestra el riesgo y las tres probabilidades con un decimal y coma", async () => {
    await openReport()
    const { probabilities, risk_level } = CURRENT.prediction
    const valueOf = (term: string) => within(report()).getByText(term, { selector: "dt" }).nextElementSibling
    expect(valueOf("Nivel de riesgo")).toHaveTextContent(riskLabel(risk_level))
    expect(valueOf("Probabilidades")).toHaveTextContent(`Bajo ${format.formatPercent(probabilities.low)} · Moderado ${format.formatPercent(probabilities.mid)} · Alto ${format.formatPercent(probabilities.high)}`)
    expect(format.formatPercent(probabilities.mid)).toMatch(/^\d+,\d %$/)
  })

  test("los ocho valores de la medición llevan su etiqueta y la unidad que publica /prediction/schema", async () => {
    await openReport()
    const values = Object.entries(CURRENT.measurement).filter(([, value]) => typeof value === "number")
    expect(values).toHaveLength(8)
    for (const [name, value] of values) {
      const unit = SCHEMA.fields.find((field) => field.name === name)!.unit
      await waitFor(() => expect(within(report()).getByText(fieldLabel(name), { selector: "dt" }).nextElementSibling).toHaveTextContent(`${value} ${unit}`))
    }
    expect(report()).not.toHaveTextContent("Las unidades no están disponibles")
  })

  test("una evaluación corregida lleva el recuadro de aviso, antes de los datos de la paciente; una vigente no", async () => {
    await openReport({}, 1)
    const box = within(report()).getByRole("heading", { name: "Evaluación corregida" }).parentElement!
    expect(box).toHaveTextContent("Esta evaluación fue corregida después: no es la vigente de la paciente.")
    const patient = within(report()).getByRole("heading", { name: "Paciente" })
    expect(box.compareDocumentPosition(patient) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    cleanup()
    await openReport()
    expect(within(report()).queryByRole("heading", { name: "Evaluación corregida" })).not.toBeInTheDocument()
  })

  test("los avisos de extrapolación salen con el texto de la API; sin avisos, el bloque no existe", async () => {
    const warned: HistoryItem = { ...CURRENT, prediction: { ...CURRENT.prediction, extrapolation_warnings: WARNED_PREDICTION.extrapolation_warnings } }
    await openReport({ evaluations: [warned] })
    const warning = WARNED_PREDICTION.extrapolation_warnings[0]
    expect(within(report()).getByRole("heading", { name: "Avisos" }).parentElement).toHaveTextContent(`${fieldLabel(warning.field)}: ${warning.message}`)
    cleanup()
    await openReport()
    expect(within(report()).queryByRole("heading", { name: "Avisos" })).not.toBeInTheDocument()
  })

  test("el nombre de la institución se muestra como texto, nunca como HTML", async () => {
    const hostile = "<img src=x onerror=alert(1)> Centro <b>Ficticio</b>"
    await openReport({ settings: { ...SETTINGS, institution_name: { ...SETTINGS.institution_name, value: hostile } } })
    expect(report().textContent).toContain(hostile)
    expect(document.querySelector("img")).toBeNull()
    expect(report().querySelector("b")).toBeNull()
  })

  test("termina con «Profesional responsable:» y un espacio en blanco que la interfaz no rellena", async () => {
    await openReport()
    const line = within(report()).getByText(/Profesional responsable:/)
    expect(line.textContent?.trim()).toBe("Profesional responsable:")
    expect(report()).not.toHaveTextContent(MEDICA.email)
    expect(report()).not.toHaveTextContent(MEDICA.id)
    const blocks = [...report().querySelectorAll("p, h2")]
    expect(blocks.at(-1)).toBe(line)
  })

  test("un reporte sin la advertencia clínica no se muestra: alerta y la ficha sigue visible", async () => {
    const { user } = await openFile()
    server.use(http.post(reportUrl(CURRENT), () => HttpResponse.json(reportOf(CURRENT, { clinical_disclaimer: "" }))))
    await user.click(generateButton())
    expect(await within(rows()[0]).findByText(/El reporte llegó sin la advertencia clínica obligatoria y no se muestra/)).toBeInTheDocument()
    expect(queryReport()).not.toBeInTheDocument()
    expect(history()).toBeVisible()
  })
})

describe("reporte: unidades", () => {
  const FIELD = "temperature_c"

  test("si /prediction/schema falla, el reporte se muestra igual: cada valor lleva el nombre de campo de la API, hay una nota y se puede imprimir", async () => {
    const { user } = await openFile()
    server.use(http.get("*/api/v1/prediction/schema", () => HttpResponse.json(uniformError("internal_error", "Error interno."), { status: 500 })))
    await user.click(generateButton())
    expect(await within(await screen.findByRole("article", { name: REPORT_TITLE })).findByText(/Las unidades no están disponibles\. Cada valor se muestra con el nombre del campo, que incluye su unidad\./)).toBeInTheDocument()
    const term = within(report()).getByText(`${fieldLabel(FIELD)} (${FIELD})`, { selector: "dt" })
    expect(term.nextElementSibling?.textContent).toBe(String(CURRENT.measurement[FIELD]))
    expect(within(report()).getByRole("button", { name: "Imprimir o guardar como PDF" })).toBeEnabled()
  })

  test("si el esquema publicado es de otra versión de conversión que la del reporte, no se usan sus unidades", async () => {
    const old: HistoryItem = { ...CURRENT, prediction: { ...CURRENT.prediction, conversion_schema_version: "0.0.1" } }
    await openReport({ evaluations: [old] })
    expect(await within(report()).findByText(/Las unidades no están disponibles/)).toBeInTheDocument()
    expect(within(report()).getByText(`${fieldLabel(FIELD)} (${FIELD})`, { selector: "dt" })).toBeInTheDocument()
  })
})

describe("reporte: errores, sin reintento automático", () => {
  test("un 503 muestra el mensaje de la API tras una sola petición, y no se repite en el margen de reintento de una lectura", async () => {
    const { user } = await openFile()
    let calls = 0
    server.use(http.post(reportUrl(CURRENT), () => { calls++; return HttpResponse.json(uniformError("database_unavailable", "La base de datos no está disponible."), { status: 503 }) }))
    await user.click(generateButton())
    expect(await within(rows()[0]).findByRole("alert")).toHaveTextContent("La base de datos no está disponible.")
    await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAYS_MS[0] + 200))
    expect(calls).toBe(1)
    expect(queryReport()).not.toBeInTheDocument()
  })

  test("un fallo de red dice que no se sabe si se generó y que repetirlo deja otro registro; una sola petición", async () => {
    const { user } = await openFile()
    let calls = 0
    server.use(http.post(reportUrl(CURRENT), () => { calls++; return HttpResponse.error() }))
    await user.click(generateButton())
    expect(await within(rows()[0]).findByRole("alert")).toHaveTextContent("No sabemos si el reporte llegó a generarse. Si lo generas de nuevo quedará otro registro en la auditoría.")
    expect(calls).toBe(1)
  })

  test("un 404 muestra el mensaje de la API y el foco sigue en el botón", async () => {
    const { bff, user } = await openFile()
    bff.evaluations = []
    await user.click(generateButton())
    expect(await within(rows()[0]).findByRole("alert")).toHaveTextContent("Predicción no encontrada.")
    expect(generateButton()).toHaveFocus()
    expect(generateButton()).not.toHaveAttribute("aria-disabled", "true")
  })
})

describe("reporte: impresión", () => {
  test("«Imprimir o guardar como PDF» llama a window.print una vez y no pide nada", async () => {
    const { bff, user } = await openReport()
    const unit = SCHEMA.fields.find((field) => field.name === "temperature_c")!.unit
    expect(within(report()).getByText(fieldLabel("temperature_c"), { selector: "dt" }).nextElementSibling).toHaveTextContent(`${CURRENT.measurement.temperature_c} ${unit}`)
    const print = vi.fn()
    vi.stubGlobal("print", print)
    const before = [...bff.calls]
    expect(before).toEqual([
      "GET /api/wake",
      "GET /api/session",
      "POST /api/v1/patients/search",
      `GET /api/v1/patients/${PATIENT.id}`,
      `GET /api/v1/patients/${PATIENT.id}/evaluations`,
      reportCall(CURRENT),
      "GET /api/v1/prediction/schema",
    ])
    await user.click(within(report()).getByRole("button", { name: "Imprimir o guardar como PDF" }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(bff.calls).toEqual(before)
    vi.unstubAllGlobals()
  })

  // jsdom no aplica estilos de impresión: esto solo fija que las marcas existen.
  // La maqueta real se revisa a mano en la vista previa del navegador.
  test("la cabecera, la navegación y los botones del reporte se marcan para no imprimirse, y hay estilos de página", async () => {
    await openReport()
    expect(screen.getByRole("banner")).toHaveClass("print:hidden")
    expect(screen.getByRole("navigation", { name: "Navegación principal" }).closest("aside")).toHaveClass("print:hidden")
    expect(within(report()).getByRole("button", { name: "Cerrar" }).parentElement).toHaveClass("print:hidden")
    const css = readFileSync("app/globals.css", "utf8")
    expect(css).toMatch(/@media print/)
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/)
  })
})

describe("reporte: no deja rastro en el navegador", () => {
  test("nada en localStorage ni en sessionStorage con el reporte a la vista", async () => {
    await openReport()
    expect(report()).toHaveTextContent(PATIENT.document_number)
    expect(localStorage).toHaveLength(0)
    expect(sessionStorage).toHaveLength(0)
  })

  test("ni la URL ni el historial del navegador cambian al generar y al cerrar", async () => {
    const { user } = await openFile()
    const href = window.location.href
    const length = window.history.length
    const push = vi.spyOn(window.history, "pushState")
    const replace = vi.spyOn(window.history, "replaceState")
    await user.click(generateButton())
    await findSettledReport()
    expect(window.location.href).toBe(href)
    await user.click(within(report()).getByRole("button", { name: "Cerrar" }))
    expect(window.location.href).toBe(href)
    expect(window.history.length).toBe(length)
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  test("nada llega a la consola ni al título del documento en todo el flujo", async () => {
    const methods = (["log", "info", "warn", "error", "debug"] as const).map((name) => vi.spyOn(console, name).mockImplementation(() => undefined))
    const title = document.title
    vi.stubGlobal("print", vi.fn())
    const { user } = await openReport()
    expect(document.title).toBe(title)
    await user.click(within(report()).getByRole("button", { name: "Imprimir o guardar como PDF" }))
    await user.click(within(report()).getByRole("button", { name: "Cerrar" }))
    for (const method of methods) expect(method).not.toHaveBeenCalled()
    expect(document.title).toBe(title)
    expect(document.title).not.toContain(PATIENT.given_names)
    expect(document.title).not.toContain(PATIENT.document_number)
    vi.unstubAllGlobals()
  })
})
