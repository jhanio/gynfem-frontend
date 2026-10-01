import type { ClinicalValues, FieldSchema } from "@/lib/api/types"

// Los tres estados del formulario clínico (gynfem-backend/docs/API_SPEC.md §2.3).
// Todo límite llega de GET /prediction/schema: aquí no hay ningún número.
export type FieldStatus = "empty" | "impossible" | "warning" | "ok"
export type AssessmentValues = Record<string, string | undefined>

export function getFieldStatus(field: FieldSchema, raw: string | undefined): FieldStatus {
  if (!raw) return "empty"
  const value = Number(raw)
  // NaN no es menor ni mayor que nada: sin esta guarda "abc" pasaría como "ok".
  if (!Number.isFinite(value)) return "impossible"
  // Límites fisiológicos inclusivos; se compara contra los valores exactos, sin redondear.
  if (value < field.physiological_limits.min || value > field.physiological_limits.max) return "impossible"
  if (value < field.training_range.min || value > field.training_range.max) return "warning"
  return "ok"
}

// Misma regla que el backend (`diastolic_not_below_systolic`): se adelanta para
// no enviar algo que el servidor rechazará; el servidor sigue siendo quien decide.
export function hasPressureConflict(values: AssessmentValues): boolean {
  if (!values.systolic_bp_mmhg || !values.diastolic_bp_mmhg) return false
  return Number(values.diastolic_bp_mmhg) >= Number(values.systolic_bp_mmhg)
}

export function canSubmitAssessment(fields: readonly FieldSchema[], values: AssessmentValues): boolean {
  // Sin esquema cargado, every() sería true y se evaluaría sin rangos (decisión B).
  if (!fields.length) return false
  const allValid = fields.every((f) => {
    const status = getFieldStatus(f, values[f.name])
    return status !== "empty" && status !== "impossible"
  })
  return allValid && !hasPressureConflict(values)
}

export function toClinicalValues(fields: readonly FieldSchema[], values: AssessmentValues): ClinicalValues {
  return Object.fromEntries(fields.map((f) => [f.name, Number(values[f.name])]))
}
