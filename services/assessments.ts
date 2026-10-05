import { apiRead, apiWrite } from "@/lib/api/client"
import type { ClinicalValues, Evaluation, QuickPrediction } from "@/lib/api/types"

// Una sola operación: el backend guarda medición y predicción en una
// transacción y las devuelve juntas (API_SPEC §3.5, decisión B de la Fase 10).
export function registerAssessment(patientId: string, values: ClinicalValues): Promise<Evaluation> {
  return apiWrite<Evaluation>("POST", `/patients/${patientId}/measurements`, values)
}

// «Actualizar» una medición es crear otra que la sustituye (HU005).
export function correctMeasurement(measurementId: string, values: ClinicalValues): Promise<Evaluation> {
  return apiWrite<Evaluation>("POST", `/measurements/${measurementId}/corrections`, values)
}

// Evaluación rápida: /predict no guarda nada, así que repetirla es inocuo.
export function quickAssessment(values: ClinicalValues): Promise<QuickPrediction> {
  return apiRead<QuickPrediction>("/predict", values)
}
