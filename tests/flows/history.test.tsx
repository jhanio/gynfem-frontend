import { screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, test } from "vitest"
import type { HistoryItem } from "@/lib/api/types"
import { UNKNOWN_ERROR_MESSAGE } from "@/lib/error-messages"
import { fieldLabel } from "@/lib/field-labels"
import { formatDateTime } from "@/lib/format"
import { riskLabel } from "@/lib/risk"
import { mockBff } from "../msw/bff"
import { DISCLAIMER, PATIENT, SETTINGS, historyItem, uniformError } from "../msw/fixtures"
import { server } from "../msw/server"
import { ADMIN, MEDICA, openPatientFile, renderApp } from "./helpers"

// Historial de evaluaciones en la ficha (HU008; gynfem-backend/docs/API_SPEC.md §3.7.1).
// Las fechas van desordenadas a propósito: la interfaz muestra el orden de la API.
const RECENT = historyItem(1, { measuredAt: "2026-09-20T15:00:00Z", risk: "high", values: { bmi_kg_m2: 26.4 } })
const CORRECTED = historyItem(2, { measuredAt: "2026-09-28T15:00:00Z", risk: "mid", status: "corrected" })
const OLDEST = historyItem(3, { measuredAt: "2026-09-24T15:00:00Z", risk: "low" })
const THREE = [RECENT, CORRECTED, OLDEST]
const many = (count: number) => Array.from({ length: count }, (_, i) => historyItem(i + 1, { measuredAt: `2026-09-${String(28 - i).padStart(2, "0")}T15:00:00Z` }))
const PAGE_SIZE = SETTINGS.history_default_page_size.value
const EVALUATIONS_URL = `*/api/v1/patients/${PATIENT.id}/evaluations`

const dateOf = (item: HistoryItem) => formatDateTime(item.measurement.measured_at)
const riskOf = (item: HistoryItem) => `Riesgo ${riskLabel(item.prediction.risk_level)}`
const history = () => screen.getByRole("region", { name: "Historial de evaluaciones" })
const rows = () => within(history()).getAllByRole("listitem")
const toggleOf = (row: HTMLElement) => within(row).getByRole("button", { name: /Ver resultado|Ocultar resultado/ })

async function openHistory(options: Parameters<typeof mockBff>[0] = {}) {
  const bff = mockBff({ signedIn: MEDICA, evaluations: THREE, ...options })
  const user = await renderApp()
  await openPatientFile(user)
  await waitFor(() => expect(rows().length).toBeGreaterThan(0))
  return { bff, user }
}

describe("historial: solo lo almacenado, en el orden de la API", () => {
  test("muestra las evaluaciones en el orden de la respuesta, sin reordenarlas", async () => {
    await openHistory()
    expect(rows()).toHaveLength(THREE.length)
    // textContent y no toHaveTextContent: la fecha lleva espacios duros que este normalizaría.
    rows().forEach((row, i) => expect(row.textContent).toContain(dateOf(THREE[i])))
  })

  test("cada fila dice su riesgo y su estado con texto, no solo con color", async () => {
    await openHistory()
    rows().forEach((row, i) => {
      expect(row).toHaveTextContent(riskOf(THREE[i]))
      expect(row).toHaveTextContent(THREE[i].status === "corrected" ? "Corregida" : "Vigente")
    })
  })

  test("la corregida va marcada y explicada, y no tiene «Corregir» de ningún modo; la vigente sí", async () => {
    await openHistory()
    const [current, corrected] = rows()
    expect(corrected).toHaveTextContent("Corregida")
    expect(corrected).toHaveTextContent("Fue sustituida por una corrección. Se conserva porque pudo usarse para decidir.")
    expect(corrected).not.toHaveTextContent("Vigente")
    // Ni visible ni oculto: el botón no está en el documento.
    expect(within(corrected).queryByRole("button", { name: /Corregir/, hidden: true })).toBeNull()
    expect(corrected.textContent).not.toContain("Corregir")
    expect(corrected.querySelectorAll("button")).toHaveLength(1)
    expect(current).toHaveTextContent("Vigente")
    expect(current).not.toHaveTextContent("Corregida")
    expect(within(current).getByRole("button", { name: "Corregir" })).toBeVisible()
  })

  test("no interpreta la evolución entre evaluaciones: ni palabras ni flechas", async () => {
    const { user } = await openHistory()
    await user.click(toggleOf(rows()[0]))
    await within(history()).findByRole("heading", { name: riskOf(RECENT) })
    expect(history().textContent).not.toMatch(/mejor[óa]|empeor[óa]|tendencia|evoluci[óo]n/i)
    expect(history().textContent).not.toMatch(/[↑↓▲▼↗↘]/)
  })

  test("al expandir muestra el resultado guardado, sus valores y la advertencia de la página, sin pedir nada más", async () => {
    const { bff, user } = await openHistory()
    const before = bff.calls.length
    await user.click(toggleOf(rows()[0]))
    const card = (await within(rows()[0]).findByRole("heading", { name: riskOf(RECENT) })).closest("section")!
    expect(card).toHaveTextContent(DISCLAIMER)
    expect(card).toHaveTextContent(`Modelo ${RECENT.prediction.model_version}`)
    const values = Object.entries(RECENT.measurement).filter(([, value]) => typeof value === "number")
    expect(values).toHaveLength(8)
    for (const [name, value] of values) {
      expect(within(card).getByText(fieldLabel(name)).nextElementSibling).toHaveTextContent(String(value))
    }
    expect(bff.calls.slice(before)).toEqual([])
    expect(bff.calls.filter((call) => /\/predictions\/|\/measurements$/.test(call) && call.startsWith("GET"))).toEqual([])
  })

  test("si la página llega sin la advertencia clínica, el resultado no se muestra", async () => {
    mockBff({ signedIn: MEDICA })
    server.use(http.get(EVALUATIONS_URL, () => HttpResponse.json({ items: THREE, limit: PAGE_SIZE, offset: 0, has_more: false, clinical_disclaimer: "" })))
    const user = await renderApp()
    await openPatientFile(user)
    await waitFor(() => expect(rows()).toHaveLength(THREE.length))
    await user.click(toggleOf(rows()[0]))
    expect(await within(rows()[0]).findByRole("alert")).toHaveTextContent("sin la advertencia clínica obligatoria")
    expect(within(rows()[0]).queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })
})

describe("historial: paginación con has_more, sin total", () => {
  test("la primera página no envía limit: rige el parámetro del sistema", async () => {
    const { bff } = await openHistory({ evaluations: many(7) })
    expect(bff.evaluationQueries).toEqual(["?offset=0"])
    expect(rows()).toHaveLength(PAGE_SIZE)
  })

  test("«Siguiente» y «Anterior» repiten el limit que devolvió la primera página", async () => {
    const all = many(7)
    const { bff, user } = await openHistory({ evaluations: all })
    await user.click(within(history()).getByRole("button", { name: "Siguiente" }))
    await waitFor(() => expect(rows()[0].textContent).toContain(dateOf(all[PAGE_SIZE])))
    await user.click(within(history()).getByRole("button", { name: "Anterior" }))
    await waitFor(() => expect(rows()[0].textContent).toContain(dateOf(all[0])))
    expect(bff.evaluationQueries).toEqual(["?offset=0", `?offset=${PAGE_SIZE}&limit=${PAGE_SIZE}`, `?offset=0&limit=${PAGE_SIZE}`])
  })

  test("el tamaño de página es el que aplica la API: con otro parámetro, cambian las filas y el offset", async () => {
    const size = PAGE_SIZE - 1
    const settings = { ...SETTINGS, history_default_page_size: { ...SETTINGS.history_default_page_size, value: size } }
    const { bff, user } = await openHistory({ evaluations: many(7), settings })
    expect(rows()).toHaveLength(size)
    await user.click(within(history()).getByRole("button", { name: "Siguiente" }))
    await waitFor(() => expect(bff.evaluationQueries.at(-1)).toBe(`?offset=${size}&limit=${size}`))
  })

  test("en la última página «Siguiente» queda deshabilitado y no aparece ningún total", async () => {
    const all = many(PAGE_SIZE + 1)
    const { user } = await openHistory({ evaluations: all })
    await user.click(within(history()).getByRole("button", { name: "Siguiente" }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(history()).getByRole("button", { name: "Siguiente" })).toBeDisabled()
    expect(within(history()).getByRole("button", { name: "Anterior" })).toBeEnabled()
    expect(history().textContent).not.toMatch(/\bde \d+\b|total/i)
  })

  test("con una fila expandida, cambiar de página cierra el panel abierto", async () => {
    const { user } = await openHistory({ evaluations: many(7) })
    await user.click(toggleOf(rows()[0]))
    await within(history()).findByRole("heading", { name: /^Riesgo / })
    await user.click(within(history()).getByRole("button", { name: "Siguiente" }))
    await waitFor(() => expect(within(history()).queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument())
    expect(within(history()).queryByRole("button", { expanded: true })).not.toBeInTheDocument()
    await user.click(within(history()).getByRole("button", { name: "Anterior" }))
    await waitFor(() => expect(within(history()).getByRole("button", { name: "Siguiente" })).toBeEnabled())
    expect(within(history()).queryByRole("button", { expanded: true })).not.toBeInTheDocument()
    expect(within(history()).queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })
})

describe("historial: errores", () => {
  test("si el historial responde 404, muestra el mensaje de la API con su referencia y conserva los datos personales", async () => {
    mockBff({ signedIn: MEDICA })
    server.use(http.get(EVALUATIONS_URL, () => HttpResponse.json(uniformError("patient_not_found", "Paciente no encontrada."), { status: 404 })))
    const user = await renderApp()
    await openPatientFile(user)
    const alert = await within(history()).findByRole("alert")
    expect(alert).toHaveTextContent("Paciente no encontrada.")
    expect(alert).toHaveTextContent("Código de referencia: ref-ficticia-1")
    expect(screen.getByRole("heading", { name: "Datos personales" })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(PATIENT.document_number))).toBeInTheDocument()
  })

  test("tras un error, «Reintentar» vuelve a pedir el historial y aparecen las filas", async () => {
    const bff = mockBff({ signedIn: MEDICA, evaluations: THREE })
    server.use(http.get(EVALUATIONS_URL, () => HttpResponse.json(uniformError("internal_error", "Error interno."), { status: 500 }), { once: true }))
    const user = await renderApp()
    await openPatientFile(user)
    const alert = await within(history()).findByRole("alert")
    expect(alert).toHaveTextContent(UNKNOWN_ERROR_MESSAGE)
    expect(bff.evaluationQueries).toEqual([])
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }))
    await waitFor(() => expect(rows()).toHaveLength(THREE.length))
    expect(bff.evaluationQueries).toEqual(["?offset=0"])
  })
})

describe("historial: control de acceso en la interfaz", () => {
  test("la administradora nunca pide el historial", async () => {
    const bff = mockBff({ signedIn: ADMIN, evaluations: THREE })
    await renderApp()
    await screen.findByRole("heading", { level: 1, name: "Administración de usuarios" })
    expect(bff.calls.filter((call) => call.includes("/evaluations"))).toEqual([])
    expect(screen.queryByText("Historial de evaluaciones")).not.toBeInTheDocument()
  })
})

describe("historial: accesibilidad", () => {
  test("«Ver resultado» expone su estado con aria-expanded y controla su panel", async () => {
    const { user } = await openHistory()
    for (const row of rows()) expect(toggleOf(row)).toHaveAttribute("aria-expanded", "false")
    const toggle = toggleOf(rows()[0])
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveAccessibleName("Ocultar resultado")
    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "")
    expect(panel).not.toBeNull()
    expect(within(panel!).getByRole("heading", { name: riskOf(RECENT) })).toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAccessibleName("Ver resultado")
    expect(within(history()).queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })

  test("al abrir otra fila, la anterior se cierra y el foco se queda en el botón pulsado", async () => {
    const { user } = await openHistory()
    const first = toggleOf(rows()[0])
    const third = toggleOf(rows()[2])
    await user.click(first)
    await user.click(third)
    expect(first).toHaveAttribute("aria-expanded", "false")
    expect(third).toHaveAttribute("aria-expanded", "true")
    expect(third).toHaveFocus()
    expect(within(history()).getAllByRole("heading", { name: /^Riesgo / })).toHaveLength(1)
    expect(within(rows()[2]).getByRole("heading", { name: riskOf(OLDEST) })).toBeInTheDocument()
  })

  test("se opera con el teclado: Tab llega al botón, Enter expande, Espacio contrae y el foco no se pierde", async () => {
    const { user } = await openHistory()
    const toggle = toggleOf(rows()[0])
    for (let i = 0; i < 40 && document.activeElement !== toggle; i++) await user.tab()
    expect(toggle).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle).toHaveFocus()
    await user.keyboard(" ")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveFocus()
    await user.tab()
    expect(within(rows()[0]).getByRole("button", { name: "Corregir" })).toHaveFocus()
  })

  test("dos botones «Ver resultado» se distinguen por su descripción: la fecha y el riesgo de su fila", async () => {
    await openHistory()
    rows().forEach((row, i) => {
      const description = toggleOf(row).getAttribute("aria-describedby")
      const text = document.getElementById(description ?? "")?.textContent ?? ""
      expect(text).toContain(dateOf(THREE[i]))
      expect(text).toContain(riskOf(THREE[i]))
    })
  })
})
