// @vitest-environment node
import { describe, expect, test } from "vitest"
import { assertServerOrigins, readServerEnv } from "@/lib/server/env"

const VALID = { API_BASE_URL: "https://api-ficticia.example", SUPABASE_URL: "https://proyecto-ficticio.example", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba" }

describe("readServerEnv", () => {
  test("con las tres variables devuelve la configuración", () => {
    expect(readServerEnv(VALID)).toEqual({ apiBaseUrl: VALID.API_BASE_URL, supabaseUrl: VALID.SUPABASE_URL, supabasePublishableKey: VALID.SUPABASE_PUBLISHABLE_KEY })
  })

  test.each(["API_BASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"])("sin %s devuelve null (vista previa)", (name) => {
    expect(readServerEnv({ ...VALID, [name]: undefined })).toBeNull()
  })

  test("con un origen mal formado devuelve null en vez de llamar a un destino dudoso", () => {
    expect(readServerEnv({ ...VALID, API_BASE_URL: "http://api-ficticia.example" })).toBeNull()
  })
})

describe("assertServerOrigins (al compilar)", () => {
  test("sin variables no falla: una vista previa compila sin ellas", () => {
    expect(() => assertServerOrigins({})).not.toThrow()
  })

  test.each(["API_BASE_URL", "SUPABASE_URL"])("un %s mal formado detiene la compilación y nombra la variable sin mostrar su valor", (name) => {
    const value = `${VALID.API_BASE_URL}/con-ruta`
    expect(() => assertServerOrigins({ ...VALID, [name]: value })).toThrowError(new RegExp(name))
    try {
      assertServerOrigins({ ...VALID, [name]: value })
    } catch (error) {
      expect((error as Error).message).not.toContain(value)
    }
  })
})
