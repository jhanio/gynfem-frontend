import { apiRead } from "@/lib/api/client"
import type { EvaluationHistory } from "@/lib/api/types"

// Historial de evaluaciones (HU008), de la más reciente a la más antigua, con
// las corregidas. Sin `limit` rige el parámetro `history_default_page_size` y
// la respuesta dice cuál se aplicó: las páginas siguientes lo repiten, para que
// un cambio de configuración a mitad de consulta no desalinee los offsets.
export function listEvaluations(patientId: string, offset: number, limit?: number): Promise<EvaluationHistory> {
  const query = new URLSearchParams({ offset: String(offset) })
  if (limit !== undefined) query.set("limit", String(limit))
  return apiRead<EvaluationHistory>(`/patients/${patientId}/evaluations?${query}`)
}
