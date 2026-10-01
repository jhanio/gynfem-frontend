import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import type { Session } from "@/lib/api/types"
import { VALID_PASSWORD } from "../msw/bff"
import { ADMIN, MEDICA } from "../msw/fixtures"

export { ADMIN, MEDICA }

type User = ReturnType<typeof userEvent.setup>

// Cada flujo parte de un estado limpio: se reimportan App y los servicios
// (caché del esquema, última respuesta, manejador de 401).
export async function renderApp(): Promise<User> {
  vi.resetModules()
  const { default: App } = await import("@/app/page")
  const user = userEvent.setup()
  render(<App />)
  return user
}

export async function loginAs(user: User, account: Session, password = VALID_PASSWORD) {
  await user.type(await screen.findByLabelText("Correo electrónico"), account.email ?? "")
  await user.type(screen.getByLabelText("Contraseña"), password)
  await user.click(screen.getByRole("button", { name: "Ingresar" }))
}

// La paciente de ejemplo se busca por su documento ficticio y se abre su ficha.
export async function openPatientFile(user: User) {
  await user.selectOptions(await screen.findByLabelText("Tipo de documento"), "PASAPORTE")
  await user.type(screen.getByLabelText("Criterio de búsqueda"), "FICTICIO001")
  await user.click(screen.getByRole("button", { name: "Buscar" }))
  await user.click(await screen.findByRole("button", { name: /Ver ficha/ }))
  await screen.findByRole("heading", { level: 1, name: /Paciente Ficticia Ejemplo Uno/ })
}

export const FIELD_VALUES: Record<string, string> = {
  "Edad": "28", "Temperatura": "36.8", "Frecuencia cardíaca": "80", "Presión sistólica": "118",
  "Presión diastólica": "76", "IMC": "22.5", "Hemoglobina glicosilada": "5.2", "Glucosa en ayunas": "85",
}

export async function fill(user: User, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    const input = screen.getByLabelText(label)
    await user.clear(input)
    await user.type(input, value)
  }
}
