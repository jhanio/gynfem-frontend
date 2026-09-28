import { describe, expect, test } from "vitest"
import { getFieldStatus, hasPressureConflict, canSubmitAssessment } from "@/lib/clinical-validation"
import type { ClinicalField } from "@/services/clinical"

const field: ClinicalField = { key: "age", label: "Edad", unit: "años", min: 18, max: 75, hardMin: 0, hardMax: 120 }
const pressureFields: ClinicalField[] = [
  { key: "systolic", label: "Presión sistólica", unit: "mmHg", min: 90, max: 160, hardMin: 40, hardMax: 300 },
  { key: "diastolic", label: "Presión diastólica", unit: "mmHg", min: 60, max: 100, hardMin: 20, hardMax: 200 },
]

describe("getFieldStatus (T4)", () => {
  test.each([
    [undefined, "empty"],
    ["", "empty"],
    ["-0.1", "impossible"],
    ["120.1", "impossible"],
    ["0", "warning"],
    ["120", "warning"],
    ["17.9", "warning"],
    ["75.1", "warning"],
    ["18", "ok"],
    ["75", "ok"],
    ["40", "ok"],
  ])("el valor %j tiene estado %s", (raw, status) => {
    expect(getFieldStatus(field, raw)).toBe(status)
  })
})

describe("hasPressureConflict (T5)", () => {
  test.each([
    [{ systolic: "120", diastolic: "80" }, false],
    [{ systolic: "120", diastolic: "120" }, true],
    [{ systolic: "110", diastolic: "120" }, true],
    [{ systolic: "120" }, false],
    [{ diastolic: "80" }, false],
  ])("%j → conflicto %s", (values, conflict) => {
    expect(hasPressureConflict(values)).toBe(conflict)
  })
})

describe("canSubmitAssessment", () => {
  test("permite enviar con todos los campos válidos, aunque alguno esté fuera de rango", () => {
    expect(canSubmitAssessment(pressureFields, { systolic: "170", diastolic: "80" })).toBe(true)
  })

  test.each([
    [{ systolic: "120" }],
    [{ systolic: "120", diastolic: "10" }],
    [{ systolic: "120", diastolic: "130" }],
  ])("no permite enviar con %j", (values) => {
    expect(canSubmitAssessment(pressureFields, values)).toBe(false)
  })
})
