import { screen, waitFor, within } from "@testing-library/react"
import { delay, http, HttpResponse } from "msw"
import { describe, expect, test } from "vitest"
import { mockBff, unauthorized } from "../msw/bff"
import { ADMIN, uniformError } from "../msw/fixtures"
import { server } from "../msw/server"
import { FIELD_VALUES, MEDICA, fill, loginAs, renderApp } from "./helpers"

async function openQuickAssessmentAsMedica() {
  const bff = mockBff({ signedIn: MEDICA })
  const user = await renderApp()
  await user.click(await screen.findByRole("button", { name: "Evaluación rápida" }))
  await screen.findByLabelText("Edad")
  return { bff, user }
}

describe("sesión expirada (decisión 4)", () => {
  test("un 401 a mitad de un formulario pide reingresar SIN perder lo escrito, y luego permite continuar", async () => {
    const { bff, user } = await openQuickAssessmentAsMedica()
    await fill(user, FIELD_VALUES)
    server.use(http.post("*/api/v1/predict", () => { bff.session = null; return unauthorized() }, { once: true }))
    await user.click(screen.getByRole("button", { name: "Calcular riesgo" }))

    const dialog = await screen.findByRole("dialog", { name: "Tu sesión expiró" })
    expect(dialog).toHaveTextContent(/se conserva/)
    // El formulario sigue montado debajo, con sus valores.
    expect(screen.getByLabelText("Edad")).toHaveValue(28)
    expect(screen.getByLabelText("Hemoglobina glicosilada")).toHaveValue(5.2)

    await user.type(within(dialog).getByLabelText("Correo electrónico"), MEDICA.email)
    await user.type(within(dialog).getByLabelText("Contraseña"), "clave-ficticia-valida")
    await user.click(within(dialog).getByRole("button", { name: "Ingresar" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByLabelText("Edad")).toHaveValue(28)
    await user.click(screen.getByRole("button", { name: "Calcular riesgo" }))
    expect(await screen.findByRole("heading", { name: "Riesgo Moderado" })).toBeInTheDocument()
  })

  test("si reingresa OTRO usuario, lo anterior se descarta y entra a su propia pantalla", async () => {
    const { bff, user } = await openQuickAssessmentAsMedica()
    await fill(user, FIELD_VALUES)
    server.use(http.post("*/api/v1/predict", () => { bff.session = null; return unauthorized() }, { once: true }))
    await user.click(screen.getByRole("button", { name: "Calcular riesgo" }))
    const dialog = await screen.findByRole("dialog", { name: "Tu sesión expiró" })
    await user.type(within(dialog).getByLabelText("Correo electrónico"), ADMIN.email)
    await user.type(within(dialog).getByLabelText("Contraseña"), "clave-ficticia-valida")
    await user.click(within(dialog).getByRole("button", { name: "Ingresar" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Administración de usuarios" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Edad")).not.toBeInTheDocument()
  })

  test("desde el diálogo se puede salir del todo y volver al login", async () => {
    const { bff, user } = await openQuickAssessmentAsMedica()
    server.use(http.post("*/api/v1/patients/search", () => { bff.session = null; return unauthorized() }))
    await user.click(screen.getByRole("button", { name: "Pacientes" }))
    await user.click(await screen.findByRole("button", { name: "Nombre" }))
    await user.type(screen.getByLabelText("Criterio de búsqueda"), "ficticia")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    const dialog = await screen.findByRole("dialog", { name: "Tu sesión expiró" })
    await user.click(within(dialog).getByRole("button", { name: "Salir" }))
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("arranque en frío del backend (decisiones 9 y A)", () => {
  test("mientras despierta se ve un estado de carga, no un error, y después se puede entrar", async () => {
    mockBff()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    server.use(http.get("*/api/wake", async () => { await gate; return HttpResponse.json({ status: "ok" }) }))
    const user = await renderApp()
    await screen.findByRole("heading", { name: "Iniciar sesión" })

    const status = await screen.findByText(/Iniciando el servicio/, {}, { timeout: 4000 })
    expect(status.closest("[role=status]")).not.toBeNull()
    expect(status).toHaveTextContent(/hasta un minuto/)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()

    release()
    await waitFor(() => expect(screen.queryByText(/Iniciando el servicio/)).not.toBeInTheDocument())
    await loginAs(user, MEDICA)
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
  })

  test("un despertar rápido no muestra ningún aviso", async () => {
    mockBff()
    await renderApp()
    await screen.findByRole("heading", { name: "Iniciar sesión" })
    await delay(300)
    expect(screen.queryByText(/Iniciando el servicio/)).not.toBeInTheDocument()
  })

  test("el inicio de sesión espera a que el servicio despierte antes de enviar las credenciales", async () => {
    const bff = mockBff()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    server.use(http.get("*/api/wake", async () => { await gate; return HttpResponse.json({ status: "ok" }) }))
    const user = await renderApp()
    await loginAs(user, MEDICA)
    await delay(100)
    expect(bff.calls).not.toContain("POST /api/session")
    release()
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
  })

  test("si el servicio no despierta, el login lo dice y permite reintentar", async () => {
    mockBff()
    server.use(http.get("*/api/wake", () => HttpResponse.json(uniformError("upstream_timeout", "El servidor tardó demasiado en responder."), { status: 504 })))
    const user = await renderApp()
    await loginAs(user, MEDICA)
    expect(await screen.findByRole("alert")).toHaveTextContent(/tardó demasiado/)
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeEnabled()
  })
})
