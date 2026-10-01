import { describe, expect, test } from "vitest"
import type { FieldSchema } from "@/lib/api/types"
import { canSubmitAssessment, getFieldStatus, hasPressureConflict, toClinicalValues } from "@/lib/clinical-validation"
import { SCHEMA } from "../msw/fixtures"

const fieldOf = (name: string) => SCHEMA.fields.find((f) => f.name === name)!
const temperature = fieldOf("temperature_c")

const VALID: Record<string, string> = {
  age_years: "28", temperature_c: "36.8", heart_rate_bpm: "80", systolic_bp_mmhg: "118",
  diastolic_bp_mmhg: "76", bmi_kg_m2: "22.5", hba1c_percent: "5.2", fasting_glucose_mg_dl: "85",
}

describe("getFieldStatus: los tres estados salen del esquema de la API (decisiones 2 y 7)", () => {
  test.each([
    ["vacío", "", "empty"], ["sin definir", undefined, "empty"],
    ["dentro del rango de entrenamiento", "36.8", "ok"],
    ["en el mínimo de entrenamiento exacto, sin redondear", "33.888888888888886", "ok"],
    ["apenas por debajo del mínimo de entrenamiento", "33.88", "warning"],
    ["en el máximo de entrenamiento", "40", "ok"],
    ["por encima del rango de entrenamiento", "41", "warning"],
    ["en el límite fisiológico inferior (inclusivo)", "30", "warning"],
    ["en el límite fisiológico superior (inclusivo)", "43", "warning"],
    ["por debajo del límite fisiológico", "29.9", "impossible"],
    ["por encima del límite fisiológico (°F escrito en °C)", "98.6", "impossible"],
    ["texto", "abc", "impossible"], ["infinito", "Infinity", "impossible"],
  ])("%s → %s", (_name, raw, status) => {
    expect(getFieldStatus(temperature, raw)).toBe(status)
  })

  test("si la API publica otros límites, el mismo valor cambia de estado", () => {
    const wider: FieldSchema = { ...temperature, physiological_limits: { ...temperature.physiological_limits, max: 120 }, training_range: { min: 90, max: 105 } }
    expect(getFieldStatus(temperature, "98.6")).toBe("impossible")
    expect(getFieldStatus(wider, "98.6")).toBe("ok")
    expect(getFieldStatus(wider, "36.8")).toBe("warning")
  })
})

describe("hasPressureConflict", () => {
  test.each([
    ["diastólica menor", "118", "76", false], ["iguales", "118", "118", true], ["diastólica mayor", "90", "118", true],
    ["falta la sistólica", "", "76", false], ["falta la diastólica", "118", undefined, false],
  ])("%s", (_name, systolic, diastolic, conflict) => {
    expect(hasPressureConflict({ systolic_bp_mmhg: systolic, diastolic_bp_mmhg: diastolic })).toBe(conflict)
  })
})

describe("canSubmitAssessment", () => {
  test("sin esquema cargado no se puede evaluar (decisión B)", () => {
    expect(canSubmitAssessment([], VALID)).toBe(false)
  })
  test("con todos los campos válidos se puede enviar", () => {
    expect(canSubmitAssessment(SCHEMA.fields, VALID)).toBe(true)
  })
  test("un aviso de extrapolación no bloquea", () => {
    expect(canSubmitAssessment(SCHEMA.fields, { ...VALID, bmi_kg_m2: "32" })).toBe(true)
  })
  test.each([
    ["un campo vacío", { age_years: "" }], ["un valor imposible", { temperature_c: "98.6" }], ["conflicto de presión", { diastolic_bp_mmhg: "118" }],
  ])("%s bloquea", (_name, change) => {
    expect(canSubmitAssessment(SCHEMA.fields, { ...VALID, ...change })).toBe(false)
  })
})

describe("toClinicalValues", () => {
  test("convierte a números solo los campos del esquema", () => {
    expect(toClinicalValues(SCHEMA.fields, { ...VALID, intruso: "9" })).toEqual({
      age_years: 28, temperature_c: 36.8, heart_rate_bpm: 80, systolic_bp_mmhg: 118,
      diastolic_bp_mmhg: 76, bmi_kg_m2: 22.5, hba1c_percent: 5.2, fasting_glucose_mg_dl: 85,
    })
  })
})
