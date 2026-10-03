import { existsSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { validationMessage } from "@/lib/validation-messages"

const load = (path = "../../lib/settings-validation") => import(/* @vite-ignore */ path)

describe("validación de configuración: reglas del backend", () => {
  test("existe el módulo de validación HU011", () => {
    expect(existsSync("lib/settings-validation.ts")).toBe(true)
  })

  test.each([
    ["  Cli\u0301nica\u00a0\u00a0Ficticia  ", { value: "Clínica Ficticia" }],
    ["😀".repeat(100), { value: "😀".repeat(100) }],
    ["😀".repeat(101), { error: "institution_name_length" }],
    [" ", { error: "institution_name_length" }],
    [true, { error: "string_type" }],
    ["\nCentro", { error: "control_character" }],
    ["Centro\u2028Ficticio", { error: "control_character" }],
    ["Centro\u2029Ficticio", { error: "control_character" }],
    ["Centro\u200bFicticio", { error: "control_character" }],
    ["Centro\ue000Ficticio", { error: "control_character" }],
    ["Centro\ud800Ficticio", { error: "control_character" }],
    ["Centro\u0378Ficticio", { error: "control_character" }],
  ])("nombre %j", async (input, expected) => {
    const { validateInstitutionName } = await load()
    expect(validateInstitutionName(input)).toEqual(expected)
  })

  test.each([
    ["1", { value: 1 }], ["50", { value: 50 }], ["003", { value: 3 }],
    ["0", { error: "greater_than_equal" }], ["51", { error: "less_than_equal" }],
    ["3.5", { error: "int_type" }], ["3e0", { error: "int_type" }],
    ["true", { error: "int_type" }], ["", { error: "int_type" }],
  ])("página %j", async (input, expected) => {
    const { validateHistoryPageSize } = await load()
    expect(validateHistoryPageSize(input)).toEqual(expected)
  })

  test("los dos nuevos errores tienen mensaje específico y string_type conserva el suyo", () => {
    expect(validationMessage("institution_name_length")).toBe("El nombre no tiene la longitud admitida.")
    expect(validationMessage("control_character")).toBe("El nombre no admite caracteres de control, de formato ni separadores de línea.")
    expect(validationMessage("string_type")).toBe("Debe ser un texto.")
  })
})
