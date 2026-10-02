import { describe, expect, test } from "vitest"
import { formatDateTimeWithZone, formatPercent, formatProbability } from "@/lib/format"

describe("formatProbability (T2, hallazgo 1)", () => {
  test.each([
    [0.58, "58%"],
    [0.04, "4%"],
    [0.7, "70%"],
    [0.08, "8%"],
    [0, "0%"],
    [1, "100%"],
  ])("%f → %s", (p, text) => {
    expect(formatProbability(p)).toBe(text)
  })
})

describe("formatPercent: un decimal y coma, para el papel", () => {
  test.each([
    [0.245, "24,5 %"],
    [0.705, "70,5 %"],
    [0.05, "5,0 %"],
    [0.58, "58,0 %"],
    [0.0049, "0,5 %"],
    [0, "0,0 %"],
    [1, "100,0 %"],
  ])("%f → %s", (p, text) => {
    expect(formatPercent(p)).toBe(text)
  })

  test("las tres probabilidades del ejemplo del contrato suman 100,0 y no 101", () => {
    const total = [0.245, 0.705, 0.05].map((p) => Number(formatPercent(p).replace(" %", "").replace(",", "."))).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(100, 5)
  })
})

describe("formatDateTimeWithZone: una fecha en papel dice su zona horaria", () => {
  test("incluye el día, la hora y la zona", () => {
    const text = formatDateTimeWithZone("2026-10-01T18:30:00Z")
    expect(text).toMatch(/2026/)
    // Desplazamiento respecto a UTC (GMT-5, GMT, GMT+5:30), no una sigla que haya que conocer.
    expect(text).toMatch(/GMT([+-]\d{1,2}(:\d{2})?)?$/)
    expect(text).toMatch(/\d{1,2}:\d{2}/)
  })

  test("una fecha inválida se devuelve tal cual", () => {
    expect(formatDateTimeWithZone("no-es-una-fecha")).toBe("no-es-una-fecha")
  })
})
