import { screen, within } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ADMIN_EMAIL, loginAs, renderApp } from "./helpers"

type User = Awaited<ReturnType<typeof renderApp>>

afterEach(() => { vi.doUnmock("@/services/clinical") })

function failWith(fn: "createUser" | "updateUser", code: string) {
  vi.doMock("@/services/clinical", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/services/clinical")>()),
    [fn]: () => { throw new Error(code) },
  }))
}

async function openUserAdmin() {
  const user = await renderApp()
  await loginAs(user, ADMIN_EMAIL)
  await screen.findByRole("cell", { name: /admin@gynfem\.test/ })
  return user
}

async function createAccount(user: User, email: string) {
  await user.type(screen.getByLabelText("Correo electrónico"), email)
  await user.type(screen.getByLabelText("Nombre"), "Cuenta de prueba")
  await user.type(screen.getByLabelText("Contraseña temporal"), "x".repeat(12))
  await user.click(screen.getByRole("button", { name: "Crear usuario" }))
}

async function toggleRowOf(user: User, email: string) {
  const row = screen.getByRole("cell", { name: (name) => name.includes(email) }).closest("tr")!
  await user.click(within(row).getByRole("button", { name: /Desactivar|Activar/ }))
}

describe("administración de usuarios: mensajes de error (F7, hallazgo 7)", () => {
  test("un correo duplicado dice que ya está registrado", async () => {
    const user = await openUserAdmin()
    await createAccount(user, "admin@gynfem.test")
    expect(await screen.findByRole("alert")).toHaveTextContent("El correo ya está registrado.")
  })

  test("una contraseña rechazada explica el rango de longitud", async () => {
    failWith("createUser", "PASSWORD_REJECTED")
    const user = await openUserAdmin()
    await createAccount(user, "nueva@gynfem.test")
    expect(await screen.findByRole("alert")).toHaveTextContent("Usa entre 12 y 72 caracteres")
  })

  test("un error desconocido al crear no se presenta como un problema de contraseña", async () => {
    failWith("createUser", "BOOM")
    const user = await openUserAdmin()
    await createAccount(user, "nueva@gynfem.test")
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("No se pudo completar la operación")
    expect(alert).not.toHaveTextContent(/contraseña/i)
  })

  test("desactivar al último administrador muestra el motivo", async () => {
    const user = await openUserAdmin()
    await toggleRowOf(user, ADMIN_EMAIL)
    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede desactivar al último administrador activo.")
  })

  test("un error desconocido al activar o desactivar no se silencia", async () => {
    failWith("updateUser", "BOOM")
    const user = await openUserAdmin()
    await toggleRowOf(user, "soporte@gynfem.test")
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo completar la operación")
  })
})

describe("administración de usuarios: la tabla se actualiza (refuerza M21)", () => {
  test("un usuario creado aparece en la tabla", async () => {
    const user = await openUserAdmin()
    await createAccount(user, "nueva@gynfem.test")
    expect(await screen.findByRole("status")).toHaveTextContent("Usuario creado")
    expect(await screen.findByRole("cell", { name: /nueva@gynfem\.test/ })).toBeInTheDocument()
  })

  test("desactivar a un usuario cambia su estado en la tabla", async () => {
    const user = await openUserAdmin()
    await toggleRowOf(user, "soporte@gynfem.test")
    const row = screen.getByRole("cell", { name: /soporte@gynfem\.test/ }).closest("tr")!
    expect(await within(row).findByRole("cell", { name: "Inactivo" })).toBeInTheDocument()
    expect(within(row).getByRole("button", { name: "Activar" })).toBeInTheDocument()
  })
})
