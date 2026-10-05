// Respuestas de ejemplo con la forma del contrato (gynfem-backend/docs/API_SPEC.md).
// Todo dato es evidentemente ficticio: el repositorio es público.
import type { AuditEntry, Evaluation, EvaluationStatus, FieldSchema, HistoryItem, ModelMetrics, Patient, PatientSummary, PredictionSchema, QuickPrediction, RiskLevel, SystemSettings, User } from "@/lib/api/types"

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

export const user = (n: number, overrides: Partial<User> = {}): User => ({
  id: `66666666-6666-4666-8666-${String(n).padStart(12, "0")}`,
  email: `usuario.ficticio${n}@gynfem.test`, full_name: `Usuario Ficticio ${["Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho"][n - 1] ?? "Otro"}`,
  role: "medico", is_active: true, created_at: "2026-09-27T00:00:00Z", updated_at: "2026-09-27T00:00:00Z",
  ...overrides,
})

export const uniformError = (code: string, message: string, details?: Array<{ loc: Array<string | number>; type: string }>) =>
  ({ error: { code, message, request_id: "ref-ficticia-1", ...(details ? { details } : {}) } })

// --- Fase 16 (gynfem-backend/docs/API_SPEC.md §3.7) ---

// Valores de prueba, distintos de los que rigen en producción: la interfaz debe
// mostrar los que lleguen.
export const SETTINGS: SystemSettings = {
  institution_name: { value: "Centro Ficticio", default: "Centro Ficticio", updated_at: null, updated_by: null },
  history_default_page_size: { value: 3, default: 3, updated_at: null, updated_by: null },
}

// Una evaluación del historial (§3.7.1). `n` la distingue; la fecha de la medición se da siempre.
export function historyItem(n: number, options: { measuredAt: string; risk?: RiskLevel; status?: EvaluationStatus; values?: Partial<typeof IN_RANGE_VALUES> }): HistoryItem {
  const id = (prefix: string) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`
  return {
    measurement: { id: id("a1a1a1a1"), patient_id: PATIENT.id, measured_at: options.measuredAt, ...IN_RANGE_VALUES, ...options.values },
    prediction: {
      id: id("b1b1b1b1"), risk_level: options.risk ?? "mid", probabilities: QUICK_PREDICTION.probabilities, extrapolation_warnings: [],
      model_version: "9.9.9", conversion_schema_version: "1.0.0", predicted_at: "2026-09-29T00:10:47.056192Z",
    },
    status: options.status ?? "current",
  }
}

export const GENERATED_AT = "2026-10-01T18:30:00.131416Z"

// Los nueve códigos del contrato, en su orden. La advertencia clínica es el último.
export const LIMITATION_CODES = [
  "metrics_scope", "accuracy_meaning", "high_risk_errors", "narrow_training_range", "dataset_not_local",
  "labels_not_verified", "variant_selection", "low_temperature_band", "clinical_disclaimer",
]

const limitation = (code: string, n: number) => ({
  code,
  title: code === "clinical_disclaimer" ? "Advertencia clínica" : `Limitación ficticia ${n}`,
  message: code === "clinical_disclaimer" ? DISCLAIMER : `Texto de prueba de la limitación ${n}: qué significa y qué no.`,
  sources: [`artefacto-ficticio-${n}.json: seccion.de.prueba`],
})

// Las cifras que un modelo tendría con esa matriz de confusión (filas: nivel
// real; columnas: nivel predicho), para que el dato de prueba sea coherente
// consigo mismo: exactitud, promedios y detalle por clase salen de la matriz.
function metricsFrom(labels: string[], matrix: number[][]) {
  const total = matrix.flat().reduce((a, b) => a + b, 0)
  const perClass = labels.map((_, i) => {
    const support = matrix[i].reduce((a, b) => a + b, 0)
    const predicted = matrix.reduce((sum, row) => sum + row[i], 0)
    const precision = matrix[i][i] / predicted
    const recall = matrix[i][i] / support
    return { precision, recall, f1: (2 * precision * recall) / (precision + recall), support }
  })
  const mean = (pick: (c: (typeof perClass)[number]) => number) => perClass.reduce((sum, c) => sum + pick(c), 0) / perClass.length
  return {
    test_rows: total,
    per_class: Object.fromEntries(labels.map((label, i) => [label, perClass[i]])),
    metrics: {
      accuracy: labels.reduce((sum, _, i) => sum + matrix[i][i], 0) / total,
      f1_macro: mean((c) => c.f1), precision_macro: mean((c) => c.precision), recall_macro: mean((c) => c.recall),
      high_to_low_errors: matrix[labels.indexOf("high risk")][labels.indexOf("low risk")],
    },
  }
}

// El orden de las etiquetas no es el de severidad: se lee de la respuesta.
const LABELS = ["high risk", "low risk", "mid risk"]
const MATRIX = [[41, 2, 7], [1, 44, 5], [3, 4, 43]]
const DERIVED = metricsFrom(LABELS, MATRIX)
const TRAINING_ROWS = 600

// Cifras deliberadamente irreales (ningún modelo las tiene): una pantalla que
// codificara las de producción no pasaría las pruebas.
export const MODEL_METRICS: ModelMetrics = {
  model: { model_version: "9.9.9", algorithm: "AlgoritmoFicticio", trained_at: "2026-09-23T12:43:32Z", variant: "variante-de-prueba" },
  evaluation: { source: "held_out_test", dataset_rows: TRAINING_ROWS + DERIVED.test_rows, training_rows: TRAINING_ROWS, test_size: DERIVED.test_rows / (TRAINING_ROWS + DERIVED.test_rows), stratified: true },
  metrics: DERIVED.metrics,
  training_ranges: SCHEMA.fields.map((f) => ({
    feature: f.model_feature, unit: f.model_unit, min: f.training_range_model_units.min, max: f.training_range_model_units.max,
    clinical_field: f.name, clinical_unit: f.unit, clinical_min: f.training_range.min, clinical_max: f.training_range.max,
  })),
  detail: {
    test_rows: DERIVED.test_rows,
    labels: LABELS,
    confusion_matrix: MATRIX,
    per_class: DERIVED.per_class,
    procedure_estimate: {
      label: "Estimación del procedimiento (validación cruzada anidada)", metric: "f1_macro",
      mean: 0.8412345678901234, std: 0.0212345678901234, outer_folds: 4, inner_folds: 3,
      description: "Estimación del procedimiento (validación cruzada anidada): texto de prueba. No es el rendimiento del modelo entregado.",
    },
  },
  detail_unavailable_reason: null,
  limitations: LIMITATION_CODES.map((code, i) => limitation(code, i + 1)),
}

// Segunda variante: otra matriz y otro orden de etiquetas, así que cambian todas las cifras.
const ALT_LABELS = ["low risk", "mid risk", "high risk"]
const ALT_MATRIX = [[38, 9, 3], [8, 36, 6], [6, 9, 35]]
const ALT_DERIVED = metricsFrom(ALT_LABELS, ALT_MATRIX)

export const MODEL_METRICS_ALT: ModelMetrics = {
  ...MODEL_METRICS,
  model: { ...MODEL_METRICS.model, model_version: "8.8.8" },
  metrics: ALT_DERIVED.metrics,
  detail: { ...MODEL_METRICS.detail!, labels: ALT_LABELS, confusion_matrix: ALT_MATRIX, per_class: ALT_DERIVED.per_class },
}

const AUDIT_SEED: Array<Pick<AuditEntry, "action" | "entity_type" | "changed_fields">> = [
  { action: "user.bootstrap_admin", entity_type: "user", changed_fields: null },
  { action: "user.create", entity_type: "user", changed_fields: null },
  { action: "patient.create", entity_type: "patient", changed_fields: null },
  { action: "patient.update", entity_type: "patient", changed_fields: ["given_names"] },
  { action: "clinical_measurement.create", entity_type: "clinical_measurement", changed_fields: null },
  { action: "prediction.create", entity_type: "prediction", changed_fields: null },
]

// 23 registros (más de una página), del más reciente al más antiguo, con horas distintas.
export const AUDIT_ENTRIES: AuditEntry[] = Array.from({ length: 23 }, (_, i) => {
  const seed = AUDIT_SEED[i % AUDIT_SEED.length]
  return {
    created_at: `2026-09-30T10:${String(i).padStart(2, "0")}:00.000000Z`,
    actor_user_id: seed.action === "user.bootstrap_admin" ? null : seed.entity_type === "user" ? ADMIN.id : MEDICA.id,
    action: seed.action, entity_type: seed.entity_type,
    entity_id: `77777777-7777-4777-8777-${String(i + 1).padStart(12, "0")}`,
    request_id: `88888888-8888-4888-8888-${String(i + 1).padStart(12, "0")}`,
    outcome: "success", changed_fields: seed.changed_fields,
  }
}).reverse()
