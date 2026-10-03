import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, test } from "vitest"
import type { SystemSettings } from "@/lib/api/types"
import { UNKNOWN_OUTCOME_MESSAGE } from "@/lib/error-messages"
import { mockBff } from "../msw/bff"
import { ADMIN, MEDICA, SETTINGS, uniformError } from "../msw/fixtures"
import { server } from "../msw/server"
import { renderApp } from "./helpers"

const NAME = "Nombre de la institución"
const SIZE = "Evaluaciones por página del historial"
const FORM = "Parámetros del sistema"
const name = () => screen.getByRole("textbox", { name: NAME })
const size = () => screen.getByRole("textbox", { name: SIZE })
const save = () => screen.getByRole("button", { name: "Guardar cambios" })
const patchCalls = (calls: string[]) => calls.filter((call) => call === "PATCH /api/v1/settings")

async function openSettings(settings: SystemSettings = SETTINGS) {
  const bff = mockBff({ signedIn: ADMIN, settings })
  const user = await renderApp()
  await user.click(await screen.findByRole("button", { name: "Configuración" }))
  await screen.findByRole("form", { name: FORM })
  return { bff, user }
}

function capturePatch(response: SystemSettings = SETTINGS) {
  const bodies: unknown[] = []
  server.use(http.patch("*/api/v1/settings", async ({ request }) => {
    bodies.push(await request.json())
    return HttpResponse.json(response)
  }))
  return bodies
}

describe("configuración HU011: acceso y lectura", () => {
  test("el administrador ve Configuración y carga los dos valores y sus metadatos", async () => {
    const initial = { ...SETTINGS, institution_name: { ...SETTINGS.institution_name, value: "Centro Ficticio Actual", updated_at: "2026-10-02T10:00:00Z", updated_by: ADMIN.id } }
    const { bff } = await openSettings(initial)
    expect(screen.getByRole("heading", { level: 1, name: "Configuración" })).toBeVisible()
    expect(name()).toHaveValue(initial.institution_name.value)
    expect(size()).toHaveValue(String(initial.history_default_page_size.value))
    expect(screen.getByText(`Valor por defecto: ${initial.institution_name.default}`)).toBeVisible()
    expect(screen.getByText(`Valor por defecto: ${initial.history_default_page_size.default}`)).toBeVisible()
    expect(screen.getByText(`Actualizado por: ${ADMIN.id}`)).toBeVisible()
    expect(screen.getByText(/Última actualización:/)).toBeVisible()
    expect(screen.getByText("Sin cambios guardados.")).toBeVisible()
    expect(bff.calls.filter((call) => call === "GET /api/v1/settings")).toHaveLength(1)
  })

  test("el médico no tiene destino ni pantalla de Configuración al navegar", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    const user = await renderApp()
    await screen.findByRole("button", { name: "Pacientes" })
    for (const target of ["Evaluación rápida", "Métricas del modelo", "Pacientes"]) {
      await user.click(screen.getByRole("button", { name: target }))
      expect(screen.queryByRole("button", { name: "Configuración" })).not.toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: "Configuración" })).not.toBeInTheDocument()
      expect(screen.queryByRole("form", { name: FORM })).not.toBeInTheDocument()
    }
    expect(bff.calls.filter((call) => call.endsWith("/settings"))).toEqual([])
  })

  test("solo aparecen los dos parámetros no clínicos del catálogo", async () => {
    await openSettings()
    const form = screen.getByRole("form", { name: FORM })
    expect(within(form).getAllByRole("textbox")).toHaveLength(2)
    expect(within(form).queryByRole("combobox")).not.toBeInTheDocument()
    expect(within(form).queryByRole("spinbutton")).not.toBeInTheDocument()
    expect(form.textContent).not.toMatch(/umbral|temperatura|glucosa|hemoglobina|presión|advertencia clínica/i)
  })

  test("muestra carga mientras GET está pendiente", async () => {
    mockBff({ signedIn: ADMIN })
    let finish!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => { finish = resolve })
    server.use(http.get("*/api/v1/settings", () => pending))
    const user = await renderApp()
    try {
      await user.click(await screen.findByRole("button", { name: "Configuración" }))
      expect(await screen.findByRole("status")).toHaveTextContent("Cargando la configuración")
      expect(screen.queryByRole("form", { name: FORM })).not.toBeInTheDocument()
    } finally { finish(HttpResponse.json(SETTINGS)) }
    await screen.findByRole("form", { name: FORM })
  })

  test("503 en GET permite Reintentar la lectura", async () => {
    mockBff({ signedIn: ADMIN })
    let unavailable = true
    server.use(http.get("*/api/v1/settings", () => unavailable
      ? HttpResponse.json(uniformError("database_unavailable", "Base de datos no disponible."), { status: 503 })
      : HttpResponse.json(SETTINGS)))
    const user = await renderApp()
    await user.click(await screen.findByRole("button", { name: "Configuración" }))
    const alert = await screen.findByRole("alert", {}, { timeout: 7000 })
    expect(alert).toHaveTextContent("Base de datos no disponible.")
    expect(alert).toHaveTextContent("ref-ficticia-1")
    unavailable = false
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }))
    await screen.findByRole("form", { name: FORM })
    expect(name()).toHaveValue(SETTINGS.institution_name.value)
  })
})

describe("configuración HU011: PATCH parcial y estado confirmado", () => {
  test.each([
    ["nombre", "  Centro Ficticio Nuevo  ", null, { institution_name: "Centro Ficticio Nuevo" }],
    ["página", null, "7", { history_default_page_size: 7 }],
    ["ambos", "Centro Ficticio Nuevo", "7", { institution_name: "Centro Ficticio Nuevo", history_default_page_size: 7 }],
  ])("editar %s envía solo las claves modificadas, sin extras ni null", async (_label, newName, newSize, expected) => {
    const { user } = await openSettings()
    const bodies = capturePatch()
    if (newName !== null) fireEvent.change(name(), { target: { value: newName } })
    if (newSize !== null) fireEvent.change(size(), { target: { value: newSize } })
    await user.click(save())
    await screen.findByText("Configuración guardada.")
    expect(bodies).toEqual([expected])
  })

  test.each(["sin editar", "normalización equivalente"])("%s no envía PATCH", async (variant) => {
    const { bff, user } = await openSettings()
    if (variant === "normalización equivalente") {
      fireEvent.change(name(), { target: { value: `  ${SETTINGS.institution_name.value.replace(" ", "   ")}  ` } })
      fireEvent.change(size(), { target: { value: `0${SETTINGS.history_default_page_size.value}` } })
    }
    await user.click(save())
    expect(await screen.findByRole("status")).toHaveTextContent("No hay cambios que guardar.")
    expect(patchCalls(bff.calls)).toEqual([])
  })

  test("200 sustituye formulario y metadatos por la respuesta, y la siguiente comparación usa ese estado", async () => {
    const { user } = await openSettings()
    const confirmed = {
      institution_name: { ...SETTINGS.institution_name, value: "Centro Ficticio Confirmado", updated_at: "2026-10-02T10:00:00Z", updated_by: ADMIN.id },
      history_default_page_size: { ...SETTINGS.history_default_page_size, value: 8, updated_at: "2026-10-02T10:00:00Z", updated_by: ADMIN.id },
    }
    const bodies = capturePatch(confirmed)
    fireEvent.change(name(), { target: { value: "Centro Ficticio Solicitado" } })
    await user.click(save())
    expect(await screen.findByRole("status")).toHaveTextContent("Configuración guardada.")
    expect(name()).toHaveValue(confirmed.institution_name.value)
    expect(size()).toHaveValue("8")
    expect(screen.getAllByText(`Actualizado por: ${ADMIN.id}`)).toHaveLength(2)
    expect(screen.getAllByText(/Última actualización:/)).toHaveLength(2)
    await user.click(save())
    expect(screen.getByRole("status")).toHaveTextContent("No hay cambios que guardar.")
    expect(bodies).toHaveLength(1)
  })

  test("PATCH pendiente bloquea doble envío y edición", async () => {
    const { user } = await openSettings()
    let calls = 0
    let finish!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => { finish = resolve })
    server.use(http.patch("*/api/v1/settings", () => { calls++; return pending }))
    fireEvent.change(size(), { target: { value: "7" } })
    try {
      await user.dblClick(save())
      await waitFor(() => expect(calls).toBe(1))
      expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled()
      expect(name()).toBeDisabled()
      expect(size()).toBeDisabled()
      fireEvent.submit(screen.getByRole("form", { name: FORM }))
      expect(calls).toBe(1)
    } finally { finish(HttpResponse.json(SETTINGS)) }
    await screen.findByText("Configuración guardada.")
  })
})

describe("configuración HU011: validación accesible", () => {
  test.each([
    [NAME, "", /longitud admitida/],
    [NAME, " ", /longitud admitida/],
    [NAME, "a".repeat(101), /longitud admitida/],
    [NAME, "Centro\u0007Ficticio", /caracteres de control/],
    [NAME, "\tCentro Ficticio", /caracteres de control/],
    [NAME, "Centro\u200bFicticio", /caracteres de control/],
    [SIZE, "0", /mínimo/],
    [SIZE, "51", /máximo/],
    [SIZE, "3.5", /número entero/],
    [SIZE, "true", /número entero/],
    [SIZE, "texto", /número entero/],
    [SIZE, "", /número entero/],
  ])("%s con %j muestra error asociado al campo sin PATCH", async (label, value, message) => {
    const { bff, user } = await openSettings()
    const input = screen.getByRole("textbox", { name: label })
    fireEvent.change(input, { target: { value } })
    await user.click(save())
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription(message)
    expect(patchCalls(bff.calls)).toEqual([])
    expect(input).toHaveFocus()
  })

  test("cien puntos de código astrales se admiten; NFC y espacios se normalizan como el backend", async () => {
    const { user } = await openSettings()
    const bodies = capturePatch()
    fireEvent.change(name(), { target: { value: "😀".repeat(100) } })
    await user.click(save())
    await screen.findByText("Configuración guardada.")
    expect(bodies).toEqual([{ institution_name: "😀".repeat(100) }])
    fireEvent.change(name(), { target: { value: "  Cli\u0301nica\u00a0\u00a0Ficticia  " } })
    await user.click(save())
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual({ institution_name: "Clínica Ficticia" })
  })

  test.each([
    ["institution_name", "institution_name_length", /longitud admitida/],
    ["institution_name", "control_character", /caracteres de control/],
    ["institution_name", "string_type", /Debe ser un texto/],
    ["history_default_page_size", "int_type", /número entero/],
  ])("422 %s/%s se asocia al campo", async (field, type, message) => {
    const { user } = await openSettings()
    server.use(http.patch("*/api/v1/settings", () => HttpResponse.json(uniformError("validation_error", "La solicitud no es válida.", [{ loc: ["body", field], type }]), { status: 422 })))
    fireEvent.change(name(), { target: { value: "Centro Ficticio Nuevo" } })
    await user.click(save())
    const input = field === "institution_name" ? name() : size()
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"))
    expect(input).toHaveAccessibleDescription(message)
    expect(input).toHaveFocus()
    expect(screen.queryByText("Configuración guardada.")).not.toBeInTheDocument()
  })
})

describe("configuración HU011: escrituras fallidas", () => {
  test("503 en escritura no reintenta ni muestra éxito, y conserva la edición", async () => {
    const { user } = await openSettings()
    let calls = 0
    server.use(http.patch("*/api/v1/settings", () => { calls++; return HttpResponse.json(uniformError("database_unavailable", "Base de datos no disponible."), { status: 503 }) }))
    fireEvent.change(name(), { target: { value: "Centro Ficticio Nuevo" } })
    await user.click(save())
    expect(await screen.findByRole("alert")).toHaveTextContent("Base de datos no disponible.")
    expect(calls).toBe(1)
    expect(name()).toHaveValue("Centro Ficticio Nuevo")
    expect(save()).toBeEnabled()
    expect(screen.queryByText("Configuración guardada.")).not.toBeInTheDocument()
  })

  test("resultado desconocido bloquea nuevas escrituras hasta comprobar mediante GET", async () => {
    const { user } = await openSettings()
    let calls = 0
    server.use(http.patch("*/api/v1/settings", () => { calls++; return HttpResponse.error() }))
    fireEvent.change(name(), { target: { value: "Centro Ficticio Nuevo" } })
    await user.click(save())
    expect(await screen.findByRole("alert")).toHaveTextContent(UNKNOWN_OUTCOME_MESSAGE)
    expect(calls).toBe(1)
    expect(save()).toBeDisabled()
    fireEvent.submit(screen.getByRole("form", { name: FORM }))
    expect(calls).toBe(1)
    await user.click(screen.getByRole("button", { name: "Comprobar estado actual" }))
    await waitFor(() => expect(name()).toHaveValue(SETTINGS.institution_name.value))
    expect(save()).toBeEnabled()
    expect(calls).toBe(1)
  })
})
