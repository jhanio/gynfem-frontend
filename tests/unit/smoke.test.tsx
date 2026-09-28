import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

test("el entorno de pruebas renderiza React en jsdom", () => {
  render(<p>listo</p>)
  expect(screen.getByText("listo")).toBeInTheDocument()
})
