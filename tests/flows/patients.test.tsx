import { screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { MEDICO_EMAIL, loginAs, openPatientFile, renderApp } from "./helpers"

describe("ficha de paciente (F4, hallazgo 2)", () => {
  test("Volver a pacientes regresa al buscador", async () => {
    const user = await renderApp()
    await loginAs(user, MEDICO_EMAIL)
    await openPatientFile(user)
    await user.click(screen.getByRole("button", { name: "Volver a pacientes" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" }, { timeout: 1500 })).toBeInTheDocument()
  })
})
