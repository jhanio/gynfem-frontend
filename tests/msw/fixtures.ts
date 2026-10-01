// Respuestas de ejemplo con la forma del contrato (gynfem-backend/docs/API_SPEC.md).
// Todo dato es evidentemente ficticio: el repositorio es público.
import type { Evaluation, FieldSchema, MeasurementListItem, Patient, PatientSummary, PredictionDetail, PredictionSchema, QuickPrediction, User } from "@/lib/api/types"

const limits = (min: number, max: number) => ({ min, max, status: "provisional" as const, rationale: "Provisional, pendiente de validación clínica con GynFem." })
const field = (name: string, unit: string, hard: [number, number], training: [number, number]): FieldSchema => ({
  name, unit, model_feature: name, model_unit: unit,
  physiological_limits: limits(hard[0], hard[1]),
  training_range: { min: training[0], max: training[1] },
  training_range_model_units: { min: training[0], max: training[1] },
})

// Los números son de prueba: la interfaz debe seguirlos sean cuales sean.
export const SCHEMA: PredictionSchema = {
  model_version: "9.9.9",
  conversion_schema_version: "1.0.0",
  fields: [
    field("age_years", "años", [10, 60], [15, 47]),
    field("temperature_c", "°C", [30, 43], [33.888888888888886, 40]),
    field("heart_rate_bpm", "lpm", [30, 220], [58, 92]),
    field("systolic_bp_mmhg", "mmHg", [60, 250], [90, 149]),
    field("diastolic_bp_mmhg", "mmHg", [30, 150], [60, 99]),
    field("bmi_kg_m2", "kg/m²", [12, 70], [14.9, 27.9]),
    field("hba1c_percent", "%", [3, 20], [4.896990392533626, 6.726983987556044]),
    field("fasting_glucose_mg_dl", "mg/dl", [20, 600], [54, 162]),
  ],
}

export const DISCLAIMER = "Herramienta de apoyo a la decisión clínica. No es un diagnóstico y no sustituye el criterio del profesional de salud."

export const IN_RANGE_VALUES = {
  age_years: 28, temperature_c: 36.8, heart_rate_bpm: 80, systolic_bp_mmhg: 118,
  diastolic_bp_mmhg: 76, bmi_kg_m2: 22.5, hba1c_percent: 5.2, fasting_glucose_mg_dl: 85,
}

export const MEDICA = { id: "11111111-1111-4111-8111-111111111111", role: "medico" as const, email: "medica.ficticia@gynfem.test" }
export const ADMIN = { id: "33333333-3333-4333-8333-333333333333", role: "administrador" as const, email: "admin.ficticia@gynfem.test" }

export const PATIENT: Patient = {
  id: "22222222-2222-4222-8222-222222222222",
  document_type: "PASAPORTE", document_number: "FICTICIO001",
  given_names: "Paciente Ficticia", family_names: "Ejemplo Uno",
  created_at: "2026-09-26T01:00:00Z", updated_at: "2026-09-26T01:00:00Z",
}

export const summaryOf = (patient: Patient): PatientSummary => ({
  id: patient.id, document_type: patient.document_type,
  document_number_masked: "*".repeat(Math.max(patient.document_number.length - 3, 0)) + patient.document_number.slice(-3),
  given_names: patient.given_names, family_names: patient.family_names,
})

export const MEASUREMENT_ID = "44444444-4444-4444-8444-444444444444"
export const PREDICTION_ID = "55555555-5555-4555-8555-555555555555"

const WARNING_MESSAGE = "Valor por encima del rango de entrenamiento. Para el modelo, cualquier valor por encima del máximo equivale al máximo: la predicción no refleja cuánto se aleja."

export const QUICK_PREDICTION: QuickPrediction = {
  risk_level: "mid",
  probabilities: { high: 0.255, mid: 0.695, low: 0.05 },
  extrapolation_warnings: [],
  clinical_disclaimer: DISCLAIMER,
  input: IN_RANGE_VALUES, model_input: IN_RANGE_VALUES,
  model_version: "9.9.9", conversion_schema_version: "1.0.0",
  predicted_at: "2026-09-26T01:21:37.045038Z",
}

export const WARNED_PREDICTION: QuickPrediction = {
  ...QUICK_PREDICTION,
  risk_level: "high",
  probabilities: { high: 0.715, mid: 0.28, low: 0.005 },
  extrapolation_warnings: [
    { field: "bmi_kg_m2", direction: "above", unit: "kg/m²", training_min: 14.9, training_max: 27.9, message: WARNING_MESSAGE },
  ],
}

export const EVALUATION: Evaluation = {
  measurement: { id: MEASUREMENT_ID, patient_id: PATIENT.id, measured_at: "2026-09-26T01:21:37.192880Z", ...IN_RANGE_VALUES },
  prediction: {
    id: PREDICTION_ID, risk_level: "mid", probabilities: { high: 0.255, mid: 0.695, low: 0.05 }, extrapolation_warnings: [],
    clinical_disclaimer: DISCLAIMER, model_version: "9.9.9", conversion_schema_version: "1.0.0", predicted_at: "2026-09-26T01:21:37.045038Z",
  },
}

export const MEASUREMENT_ITEM: MeasurementListItem = { ...EVALUATION.measurement, prediction_id: PREDICTION_ID }

export const PREDICTION_DETAIL: PredictionDetail = { ...EVALUATION.prediction, measurement_id: MEASUREMENT_ID, input: IN_RANGE_VALUES, model_input: IN_RANGE_VALUES }

export const user = (n: number, overrides: Partial<User> = {}): User => ({
  id: `66666666-6666-4666-8666-${String(n).padStart(12, "0")}`,
  email: `usuario.ficticio${n}@gynfem.test`, full_name: `Usuario Ficticio ${["Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho"][n - 1] ?? "Otro"}`,
  role: "medico", is_active: true, created_at: "2026-09-27T00:00:00Z", updated_at: "2026-09-27T00:00:00Z",
  ...overrides,
})

export const uniformError = (code: string, message: string, details?: Array<{ loc: Array<string | number>; type: string }>) =>
  ({ error: { code, message, request_id: "ref-ficticia-1", ...(details ? { details } : {}) } })
