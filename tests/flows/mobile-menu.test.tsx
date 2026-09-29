import { screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { MEDICO_EMAIL, loginAs, renderApp } from "./helpers"

describe("menú móvil (F8, B5)", () => {
  test("expone su estado con aria-expanded y se cierra al navegar", async () => {
    const user = await renderApp()
    await loginAs(user, MEDICO_EMAIL)
    const toggle = await screen.findByRole("button", { name: /menú/i })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(screen.getByRole("button", { name: "Evaluación rápida" }))
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })
})
