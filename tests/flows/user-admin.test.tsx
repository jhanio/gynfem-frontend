import { screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, test } from "vitest"
import { mockBff } from "../msw/bff"
import { uniformError, user as userFixture } from "../msw/fixtures"
import { server } from "../msw/server"
import { ADMIN, renderApp } from "./helpers"

type User = Awaited<ReturnType<typeof renderApp>>

async function openUserAdmin(options: Parameters<typeof mockBff>[0] = {}) {
  const bff = mockBff({ signedIn: ADMIN, ...options })
  const user = await renderApp()
  await screen.findByRole("cell", { name: new RegExp(ADMIN.email!.replace(".", "\\.")) })
  return { bff, user }
}

async function createAccount(user: User, email: string, password = "x".repeat(12)) {
  await user.type(screen.getByLabelText("Correo electrónico"), email)
  await user.type(screen.getByLabelText("Nombre"), "Cuenta Ficticia")
  await user.type(screen.getByLabelText("Contraseña temporal"), password)
  await user.click(screen.getByRole("button", { name: "Crear usuario" }))
}

const rowOf = (email: string) => screen.getByRole("cell", { name: (name) => name.includes(email) }).closest("tr")!

describe("listado de usuarios: paginado sin total (API_SPEC §3.6)", () => {
  test("muestra la primera página y avanza con has_more", async () => {
    const { user } = await openUserAdmin()
    expect(screen.getAllByRole("row")).toHaveLength(1 + 6)
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Siguiente" }))
    await screen.findByRole("cell", { name: /usuario\.ficticio8@gynfem\.test/ })
    expect(screen.getAllByRole("row")).toHaveLength(1 + 2)
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled()
  })

  test("sin usuarios en la página lo dice", async () => {
    mockBff({ signedIn: ADMIN, users: [] })
    await renderApp()
    expect(await screen.findByText("No hay usuarios en esta página.")).toBeInTheDocument()
  })

  test("si el listado falla, muestra el error con su código de referencia", async () => {
    mockBff({ signedIn: ADMIN })
    server.use(http.get("*/api/v1/users", () => HttpResponse.json(uniformError("forbidden", "No tiene permiso para esta operación."), { status: 403 })))
    await renderApp()
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("No tienes permiso para esta operación.")
    expect(alert).toHaveTextContent("ref-ficticia-1")
  })
})

describe("crear usuario", () => {
  test("crea la cuenta, avisa que la contraseña no se volverá a mostrar y limpia el formulario", async () => {
    const { bff, user } = await openUserAdmin({ users: [userFixture(1, { role: "administrador", email: ADMIN.email, id: ADMIN.id })] })
    await createAccount(user, "nueva.ficticia@gynfem.test")
    expect(await screen.findByRole("status")).toHaveTextContent("Usuario creado")
    expect(await screen.findByRole("cell", { name: /nueva\.ficticia@gynfem\.test/ })).toBeInTheDocument()
    expect(screen.getByLabelText("Contraseña temporal")).toHaveValue("")
    expect(bff.calls.filter((c) => c === "POST /api/v1/users")).toHaveLength(1)
  })

  test("un correo duplicado (409) muestra el mensaje de la API", async () => {
    const { user } = await openUserAdmin()
    await createAccount(user, ADMIN.email!)
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un usuario con ese correo.")
  })

  test("una contraseña rechazada por longitud (422) marca el campo de la contraseña, no otro", async () => {
    const { user } = await openUserAdmin()
    await createAccount(user, "nueva.ficticia@gynfem.test", "corta")
    const password = screen.getByLabelText("Contraseña temporal")
    await waitFor(() => expect(password).toHaveAttribute("aria-invalid", "true"))
    expect(screen.getByText("La contraseña no tiene la longitud admitida.")).toBeInTheDocument()
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("aria-invalid", "false")
  })

  test("weak_password (422 sin details) se asocia a la contraseña con el mensaje de la API", async () => {
    const { user } = await openUserAdmin()
    server.use(http.post("*/api/v1/users", () => HttpResponse.json(uniformError("weak_password", "La contraseña no cumple la política del servicio de autenticación."), { status: 422 })))
    await createAccount(user, "nueva.ficticia@gynfem.test")
    await waitFor(() => expect(screen.getByLabelText("Contraseña temporal")).toHaveAttribute("aria-invalid", "true"))
    expect(screen.getByText("La contraseña no cumple la política del servicio de autenticación.")).toBeInTheDocument()
  })

  test("un error desconocido no se presenta como un problema de contraseña", async () => {
    const { user } = await openUserAdmin()
    server.use(http.post("*/api/v1/users", () => HttpResponse.json(uniformError("internal_error", "Error interno del servidor."), { status: 500 })))
    await createAccount(user, "nueva.ficticia@gynfem.test")
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("No se pudo completar la operación")
    expect(alert).not.toHaveTextContent(/contraseña/i)
  })

  test("si no se sabe si se creó (fallo de red), no repite el POST y pide comprobar la lista", async () => {
    const { user } = await openUserAdmin()
    let calls = 0
    server.use(http.post("*/api/v1/users", () => { calls++; return HttpResponse.error() }))
    await createAccount(user, "nueva.ficticia@gynfem.test")
    expect(await screen.findByRole("alert")).toHaveTextContent(/No sabemos si la operación se guardó/)
    expect(calls).toBe(1)
  })
})

describe("activar, desactivar y asignar rol", () => {
  test("desactivar a un usuario cambia su estado en la tabla", async () => {
    const { user } = await openUserAdmin()
    const email = "usuario.ficticio2@gynfem.test"
    await user.click(within(rowOf(email)).getByRole("button", { name: "Desactivar" }))
    expect(await within(rowOf(email)).findByRole("cell", { name: "Inactivo" })).toBeInTheDocument()
    expect(within(rowOf(email)).getByRole("button", { name: "Activar" })).toBeInTheDocument()
  })

  test("desactivar al último administrador (409) muestra el motivo de la API", async () => {
    const { user } = await openUserAdmin()
    await user.click(within(rowOf(ADMIN.email!)).getByRole("button", { name: "Desactivar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede dejar el sistema sin un administrador activo.")
    expect(within(rowOf(ADMIN.email!)).getByRole("cell", { name: "Activo" })).toBeInTheDocument()
  })

  test("cambiar el rol envía PATCH con el rol y la tabla lo refleja", async () => {
    const { bff, user } = await openUserAdmin()
    const email = "usuario.ficticio2@gynfem.test"
    await user.selectOptions(within(rowOf(email)).getByLabelText(`Rol de ${email}`), "administrador")
    await waitFor(() => expect(bff.users.find((u) => u.email === email)?.role).toBe("administrador"))
    await waitFor(() => expect(within(rowOf(email)).getByLabelText(`Rol de ${email}`)).toHaveValue("administrador"))
  })

  test("un error al activar o desactivar no se silencia", async () => {
    const { user } = await openUserAdmin()
    server.use(http.post("*/api/v1/users/:id/deactivate", () => HttpResponse.json(uniformError("internal_error", "Error interno del servidor."), { status: 500 })))
    await user.click(within(rowOf("usuario.ficticio2@gynfem.test")).getByRole("button", { name: "Desactivar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo completar la operación")
  })

  // Verificación contra producción (Fase 15): sin estado pendiente, los clics
  // repetidos dejaron 9 user.deactivate y 1 user.activate en audit_log.
  test("clics repetidos mientras la petición sigue en curso envían una sola y la fila queda bloqueada", async () => {
    const { bff, user } = await openUserAdmin()
    const email = "usuario.ficticio2@gynfem.test"
    let release = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    let calls = 0
    server.use(http.post("*/api/v1/users/:id/deactivate", async ({ params }) => {
      calls++
      await held
      return HttpResponse.json({ ...bff.users.find((u) => u.id === params.id), is_active: false })
    }))
    const button = within(rowOf(email)).getByRole("button", { name: "Desactivar" })
    await user.click(button)
    await user.click(button)
    await user.click(button)
    expect(within(rowOf(email)).getByRole("button")).toBeDisabled()
    expect(within(rowOf(email)).getByLabelText(`Rol de ${email}`)).toBeDisabled()
    // Las demás filas siguen disponibles.
    expect(within(rowOf("usuario.ficticio3@gynfem.test")).getByRole("button", { name: "Desactivar" })).toBeEnabled()

    release()
    expect(await within(rowOf(email)).findByRole("button", { name: "Activar" })).toBeEnabled()
    expect(calls).toBe(1)
  })

  test("la fila se actualiza con la respuesta del servidor, sin esperar a releer la lista", async () => {
    const { bff, user } = await openUserAdmin()
    const email = "usuario.ficticio2@gynfem.test"
    // El listado seguiría devolviendo el estado anterior: la fila no depende de él.
    server.use(http.post("*/api/v1/users/:id/deactivate", ({ params }) => HttpResponse.json({ ...bff.users.find((u) => u.id === params.id), is_active: false })))
    const listReads = () => bff.calls.filter((c) => c === "GET /api/v1/users").length
    const readsBefore = listReads()
    await user.click(within(rowOf(email)).getByRole("button", { name: "Desactivar" }))
    expect(await within(rowOf(email)).findByRole("cell", { name: "Inactivo" })).toBeInTheDocument()
    expect(within(rowOf(email)).getByRole("button", { name: "Activar" })).toBeInTheDocument()
    expect(listReads()).toBe(readsBefore)
  })
})
