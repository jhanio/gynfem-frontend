import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"

export const MEDICO_EMAIL = "medica.ficticia@gynfem.test"
export const ADMIN_EMAIL = "admin@gynfem.test"

type User = ReturnType<typeof userEvent.setup>

// Cada flujo parte de un estado simulado limpio: se reimportan App y los servicios.
export async function renderApp(): Promise<User> {
  vi.resetModules()
  const { default: App } = await import("@/app/page")
  const user = userEvent.setup()
  render(<App />)
  return user
}

export async function loginAs(user: User, email: string) {
  await user.type(screen.getByLabelText("Correo electrónico"), email)
  await user.type(screen.getByLabelText("Contraseña"), "clave-simulada")
  await user.click(screen.getByRole("button", { name: "Ingresar" }))
}

export async function openPatientFile(user: User) {
  await user.type(await screen.findByLabelText("Criterio de búsqueda"), "00000001")
  await user.click(screen.getByRole("button", { name: "Buscar" }))
  await user.click(await screen.findByRole("button", { name: /Ver ficha/ }))
  await screen.findByRole("heading", { level: 1, name: /Paciente Ficticia Uno/ })
}
