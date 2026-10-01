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
