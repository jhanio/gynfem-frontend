import { screen, waitFor } from "@testing-library/react"
import { http } from "msw"
import { describe, expect, test } from "vitest"
import { mockBff } from "../msw/bff"
import { server } from "../msw/server"
import { ADMIN, MEDICA, loginAs, renderApp } from "./helpers"

describe("sin sesión", () => {
  test("se muestra el inicio de sesión y ninguna pantalla clínica", async () => {
    mockBff()
    await renderApp()
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument()
    expect(screen.queryByText(/Buscar paciente|Administración de usuarios|Evaluación de riesgo/)).not.toBeInTheDocument()
  })

  test("ya no existe el modo simulado: sin banner y sin datos de ejemplo", async () => {
    mockBff()
    await renderApp()
    await screen.findByRole("heading", { name: "Iniciar sesión" })
    expect(screen.queryByText(/DATOS SIMULADOS/)).not.toBeInTheDocument()
  })
})

describe("inicio de sesión", () => {
  test("con campos vacíos muestra una alerta y no llama al servidor", async () => {
    const bff = mockBff()
    const user = await renderApp()
    await user.click(await screen.findByRole("button", { name: "Ingresar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresa tu correo y contraseña")
    expect(bff.calls).not.toContain("POST /api/session")
  })

  test("con credenciales inválidas muestra el mensaje único de la API y sigue en el login", async () => {
    mockBff()
    const user = await renderApp()
    await loginAs(user, MEDICA, "contrasena-equivocada")
    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.")
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument()
  })

  test("una médica entra a Pacientes y la cabecera muestra su correo y el rol que dijo la API", async () => {
    mockBff()
    const user = await renderApp()
    await loginAs(user, MEDICA)
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
    const banner = screen.getByRole("banner")
    expect(banner).toHaveTextContent(MEDICA.email)
    expect(banner).toHaveTextContent("Médico")
  })

  test("una administradora entra a la administración de usuarios", async () => {
    mockBff()
    const user = await renderApp()
    await loginAs(user, ADMIN)
    expect(await screen.findByRole("heading", { level: 1, name: "Administración de usuarios" })).toBeInTheDocument()
  })

  test("el rol no se deduce del correo: una cuenta con «admin» en el correo y rol médico ve pantallas clínicas", async () => {
    mockBff({ signedIn: { id: MEDICA.id, role: "medico", email: "admin.ficticia@gynfem.test" } })
    await renderApp()
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Usuarios" })).not.toBeInTheDocument()
  })

  test("al recargar con la sesión vigente (cookies) no se vuelve a pedir la contraseña", async () => {
    mockBff({ signedIn: MEDICA })
    await renderApp()
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Iniciar sesión" })).not.toBeInTheDocument()
  })
})

describe("control de acceso por rol (decisión 5)", () => {
  test("la administradora solo ve Usuarios: ni Pacientes ni Evaluación rápida", async () => {
    const bff = mockBff({ signedIn: ADMIN })
    await renderApp()
    await screen.findByRole("button", { name: "Usuarios" })
    expect(screen.queryByRole("button", { name: "Pacientes" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Evaluación rápida" })).not.toBeInTheDocument()
    await screen.findByRole("cell", { name: /usuario\.ficticio2@gynfem\.test/ })
    // Tampoco pide nada clínico por debajo.
    expect(bff.calls.filter((c) => /patients|predict|measurements/.test(c))).toEqual([])
  })

  test("la médica no ve Usuarios ni pide el listado de usuarios", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    await renderApp()
    await screen.findByRole("button", { name: "Pacientes" })
    expect(screen.queryByRole("button", { name: "Usuarios" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Administración de usuarios" })).not.toBeInTheDocument()
    expect(bff.calls.filter((c) => c.includes("/users"))).toEqual([])
  })

  test("un 403 del backend se informa sin revelar si el recurso existe", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    const user = await renderApp()
    await screen.findByRole("heading", { level: 1, name: "Pacientes" })
    // El backend es quien autoriza: aunque la interfaz muestre la pantalla, responde 403.
    bff.session = { ...MEDICA, role: "administrador" }
    await user.selectOptions(await screen.findByLabelText("Tipo de documento"), "PASAPORTE")
    await user.type(screen.getByLabelText("Criterio de búsqueda"), "FICTICIO001")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("No tienes permiso para esta operación.")
    expect(alert).not.toHaveTextContent(/paciente|existe/i)
  })

  test("cerrar sesión vuelve al login, llama al servidor y olvida el rol", async () => {
    const bff = mockBff({ signedIn: ADMIN })
    const user = await renderApp()
    await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }))
    expect(await screen.findByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument()
    await waitFor(() => expect(bff.calls).toContain("DELETE /api/session"))
    await loginAs(user, MEDICA)
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Usuarios" })).not.toBeInTheDocument()
  })

  test("una cuenta desactivada no entra y ve el motivo que da la API", async () => {
    mockBff()
    server.use(http.post("*/api/session", () => Response.json({ error: { code: "account_disabled", message: "La cuenta no está habilitada para operar.", request_id: "r" } }, { status: 403 })))
    const user = await renderApp()
    await loginAs(user, MEDICA)
    expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta no está habilitada para operar.")
  })
})
