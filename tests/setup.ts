import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll } from "vitest"
import { server } from "./msw/server"

// Una petición sin manejador declarado hace fallar la prueba (en MSW 3 la opción es onUnhandledFrame).
beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
afterEach(() => {
  server.resetHandlers()
  if (typeof document !== "undefined") cleanup()
})
afterAll(() => server.close())
