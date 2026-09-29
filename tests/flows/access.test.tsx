import { screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { ADMIN_EMAIL, MEDICO_EMAIL, loginAs, renderApp } from "./helpers"

describe("banner de datos simulados (F1)", () => {
  test("es visible en el login", async () => {
    await renderApp()
    expect(screen.getByText("DATOS SIMULADOS")).toBeInTheDocument()
  })

  test.each([MEDICO_EMAIL, ADMIN_EMAIL])("sigue visible tras entrar como %s", async (email) => {
    const user = await renderApp()
    await loginAs(user, email)
    await screen.findByRole("navigation", { name: "Navegación principal" })
    expect(screen.getByText("DATOS SIMULADOS")).toBeInTheDocument()
  })
})

describe("login (F2)", () => {
  test("con campos vacíos muestra una alerta y no entra", async () => {
    const user = await renderApp()
    await user.click(screen.getByRole("button", { name: "Ingresar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ingresa tu correo y contraseña")
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument()
  })

  test("un médico entra a Pacientes", async () => {
    const user = await renderApp()
    await loginAs(user, MEDICO_EMAIL)
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
  })

  test("un administrador entra a la administración de usuarios", async () => {
    const user = await renderApp()
    await loginAs(user, ADMIN_EMAIL)
    expect(await screen.findByRole("heading", { level: 1, name: "Administración de usuarios" })).toBeInTheDocument()
  })
})

describe("aislamiento por rol (F3)", () => {
  test("el administrador solo ve Usuarios en la navegación", async () => {
    const user = await renderApp()
    await loginAs(user, ADMIN_EMAIL)
    await screen.findByRole("button", { name: "Usuarios" })
    expect(screen.queryByRole("button", { name: "Pacientes" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Evaluación rápida" })).not.toBeInTheDocument()
  })

  test("el médico no ve Usuarios en la navegación", async () => {
    const user = await renderApp()
    await loginAs(user, MEDICO_EMAIL)
    await screen.findByRole("button", { name: "Pacientes" })
    expect(screen.queryByRole("button", { name: "Usuarios" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Administración de usuarios" })).not.toBeInTheDocument()
  })

  test("cerrar sesión vuelve al login y olvida el rol", async () => {
    const user = await renderApp()
    await loginAs(user, ADMIN_EMAIL)
    await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }))
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument()
    await loginAs(user, MEDICO_EMAIL)
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Usuarios" })).not.toBeInTheDocument()
  })
})
