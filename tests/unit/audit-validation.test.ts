import { existsSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { validationMessage } from "@/lib/validation-messages"
import { forwardedQuery } from "@/lib/server/query"

const load = (path = "../../lib/audit-validation") => import(/* @vite-ignore */ path)

describe("validación de Auditoría", () => {
  test("existe el módulo de validación de filtros", () => {
    expect(existsSync("lib/audit-validation.ts")).toBe(true)
  })

  test.each(["date_range_inverted", "timezone_aware", "uuid_parsing", "string_pattern_mismatch"])("%s tiene mensaje específico", (type) => {
    expect(validationMessage(type)).not.toBe("Valor no válido.")
  })

  test.each([
    ["2026-10-03T10:00:00Z", true], ["2026-10-03T10:00:00.123456+05:30", true],
    ["2026-10-03T10:00:00-05:00", true], ["2024-02-29T10:00:00Z", true],
    ["2026-02-29T10:00:00Z", false], ["2026-02-30T10:00:00Z", false],
    ["2026-10-03T25:00:00Z", false], ["2026-10-03T10:00:00+24:00", false],
    ["2026-10-03T10:00:00", false], ["2026-10-03", false],
  ])("fecha %s válida=%s", async (from, valid) => {
    const { validateAuditFilters } = await load()
    const result = validateAuditFilters({ from })
    expect(result.errors).toEqual(valid ? {} : { from: "timezone_aware" })
    if (valid) expect(result.filters.from).toBe(from)
  })

  test("compara instantes con offsets y conserva precisión de microsegundos", async () => {
    const { validateAuditFilters } = await load()
    expect(validateAuditFilters({ from: "2026-10-03T10:00:00+05:30", to: "2026-10-03T04:30:00Z" }).errors).toEqual({})
    expect(validateAuditFilters({ from: "2026-10-03T10:00:00.000002Z", to: "2026-10-03T10:00:00.000001Z" }).errors).toEqual({ from: "date_range_inverted", to: "date_range_inverted" })
  })

  test("normaliza UUID, omite vacíos y solo produce las seis claves contractuales", async () => {
    const { validateAuditFilters } = await load()
    expect(validateAuditFilters({ entity_id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", action: " ", extra: "no debe salir" })).toEqual({ filters: { entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, errors: {} })
    expect(validateAuditFilters({ entity_type: "otra" }).errors).toEqual({ entity_type: "literal_error" })
  })

  test("las fechas que genera la interfaz pasan por el BFF heredado sin incompatibilidad", async () => {
    const { validateAuditFilters } = await load()
    for (const from of ["2026-10-03T10:00:00+00:00", "2026-10-03T10:00:00.123456+05:30", "2026-10-03T10:00:00-05:00"]) {
      const result = validateAuditFilters({ from })
      expect(result.errors).toEqual({})
      const query = new URLSearchParams({ ...result.filters, limit: "20", offset: "0" })
      const forwarded = forwardedQuery({ method: "GET", template: "/audit-log", write: false, query: "audit" }, new Request(`https://gynfem.test/api/v1/audit-log?${query}`))
      expect(forwarded).not.toHaveProperty("invalid")
      expect(new URLSearchParams("query" in forwarded ? forwarded.query : "").get("from")).toBe(from)
    }
  })
})
