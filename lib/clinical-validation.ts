import type { ClinicalField } from "@/services/clinical"

export type FieldStatus = "empty" | "impossible" | "warning" | "ok"
export type AssessmentValues = Record<string, string | undefined>

export function getFieldStatus(field: ClinicalField, raw: string | undefined): FieldStatus {
  if (!raw) return "empty"
  const value = Number(raw)
  // NaN no es menor ni mayor que nada: sin esta guarda "abc" pasaría como "ok".
  if (!Number.isFinite(value)) return "impossible"
  if (value < field.hardMin || value > field.hardMax) return "impossible"
  if (value < field.min || value > field.max) return "warning"
  return "ok"
}

export function hasPressureConflict(values: AssessmentValues): boolean {
  if (!values.systolic || !values.diastolic) return false
  return Number(values.diastolic) >= Number(values.systolic)
}

export function canSubmitAssessment(fields: readonly ClinicalField[], values: AssessmentValues): boolean {
  // Sin campos cargados, every() sería true y se evaluaría sin datos.
  if (fields.length === 0) return false
  const allValid = fields.every((f) => {
    const status = getFieldStatus(f, values[f.key])
    return status !== "empty" && status !== "impossible"
  })
  return allValid && !hasPressureConflict(values)
}
