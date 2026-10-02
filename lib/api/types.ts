// Tipos del contrato de la API (gynfem-backend/docs/API_SPEC.md y app/schemas/).
// Los nombres de campo son los del contrato, sin traducir.

export type Role = "medico" | "administrador"

// GET /me más el correo del token (lo añade /api/session).
export type Session = { id: string; role: Role; email: string | null }

export type Page<T> = { items: T[]; limit: number; offset: number; has_more: boolean }

export type DocumentType = "DNI" | "CE" | "PASAPORTE"

export type PatientInput = { document_type: DocumentType; document_number: string; given_names: string; family_names: string }
export type Patient = PatientInput & { id: string; created_at: string; updated_at: string }
// Resultado de búsqueda: el documento llega enmascarado.
export type PatientSummary = { id: string; document_type: DocumentType; document_number_masked: string; given_names: string; family_names: string }

// Las 8 variables en unidad clínica; sus nombres salen de /prediction/schema.
export type ClinicalValues = Record<string, number>

export type RiskLevel = "high" | "mid" | "low"
export type Probabilities = Record<RiskLevel, number>
export type ExtrapolationWarning = { field: string; direction: "below" | "above"; unit: string; training_min: number; training_max: number; message: string }

// Lo común a toda predicción, guardada o no: lo que muestra la tarjeta de resultado.
export type PredictionView = {
  risk_level: RiskLevel
  probabilities: Probabilities
  extrapolation_warnings: ExtrapolationWarning[]
  clinical_disclaimer: string
  model_version: string
  conversion_schema_version: string
  predicted_at: string
}

export type QuickPrediction = PredictionView & { input: ClinicalValues; model_input: ClinicalValues }
export type StoredPrediction = PredictionView & { id: string }
export type PredictionDetail = StoredPrediction & { measurement_id: string; input: ClinicalValues; model_input: ClinicalValues }

export type Measurement = { id: string; patient_id: string; measured_at: string } & { [field: string]: number | string }
export type MeasurementListItem = Measurement & { prediction_id: string | null }
export type Evaluation = { measurement: Measurement; prediction: StoredPrediction }

export type Range = { min: number; max: number }
export type FieldSchema = {
  name: string
  unit: string
  model_feature: string
  model_unit: string
  physiological_limits: Range & { status: "provisional" | "validated"; rationale: string }
  training_range: Range
  training_range_model_units: Range
}
export type PredictionSchema = { model_version: string; conversion_schema_version: string; fields: FieldSchema[] }

export type User = { id: string; email: string | null; full_name: string; role: Role; is_active: boolean; created_at: string; updated_at: string }
export type UserInput = { email: string; password: string; full_name: string; role: Role }

// --- Fase 16: administración (gynfem-backend/docs/API_SPEC.md §3.7) ---

export type EvaluationStatus = "current" | "corrected"
// En el historial y en el reporte la advertencia clínica va una vez en la raíz,
// no en cada predicción.
export type HistoryPrediction = Omit<StoredPrediction, "clinical_disclaimer">
export type HistoryItem = { measurement: Measurement; prediction: HistoryPrediction; status: EvaluationStatus }
export type EvaluationHistory = Page<HistoryItem> & { clinical_disclaimer: string }

// `generated_at` es la hora del servidor, no un identificador del reporte.
export type Report = {
  institution_name: string
  generated_at: string
  patient: PatientInput & { id: string }
  measurement: { id: string; measured_at: string } & { [field: string]: number | string }
  prediction: HistoryPrediction & { status: EvaluationStatus }
  clinical_disclaimer: string
}

export type TrainingRange = {
  feature: string; unit: string; min: number; max: number
  clinical_field: string; clinical_unit: string; clinical_min: number; clinical_max: number
}
export type ClassMetrics = { precision: number; recall: number; f1: number; support: number }
export type ProcedureEstimate = { label: string; metric: string; mean: number; std: number; outer_folds: number; inner_folds: number; description: string }
// `labels` da el orden de filas y columnas de la matriz: son las etiquetas del
// dataset y su orden no es el de severidad. Nunca se supone.
export type MetricsDetail = {
  test_rows: number
  labels: string[]
  confusion_matrix: number[][]
  per_class: Record<string, ClassMetrics>
  procedure_estimate?: ProcedureEstimate
}
export type Limitation = { code: string; title: string; message: string; sources: string[] }
// Una cifra que no existe en los artefactos no llega (ni null ni cero): todas
// son opcionales. La advertencia clínica es la limitación `clinical_disclaimer`.
export type ModelMetrics = {
  model: { model_version: string; algorithm?: string; trained_at?: string; variant?: string }
  evaluation: { source?: string; dataset_rows?: number; training_rows?: number; test_size?: number; stratified?: boolean }
  metrics: { accuracy?: number; f1_macro?: number; precision_macro?: number; recall_macro?: number; high_to_low_errors?: number }
  training_ranges: TrainingRange[]
  detail: MetricsDetail | null
  detail_unavailable_reason: string | null
  limitations: Limitation[]
}

export type Setting<T> = { value: T; default: T; updated_at: string | null; updated_by: string | null }
export type SystemSettings = { institution_name: Setting<string>; history_default_page_size: Setting<number> }
export type SettingsChange = { institution_name?: string; history_default_page_size?: number }

// `entity_id` es opaco: se muestra tal cual, sin resolverlo.
export type AuditEntry = {
  created_at: string
  actor_user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  request_id: string | null
  outcome: string
  changed_fields: string[] | null
}
// `from` (inclusivo) y `to` (exclusivo): fecha y hora con zona horaria.
export type AuditFilters = { action?: string; entity_type?: string; entity_id?: string; actor_user_id?: string; from?: string; to?: string }
