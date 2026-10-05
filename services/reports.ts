import { apiWrite } from "@/lib/api/client"
import type { Report } from "@/lib/api/types"

// Reporte de una evaluación (HU009). Es una escritura: cada llamada deja un
// registro de auditoría (`prediction.report`). Se envía UNA vez, por una acción
// explícita del médico; nunca al cargar una pantalla y nunca se reintenta.
export function generateReport(predictionId: string): Promise<Report> {
  return apiWrite<Report>("POST", `/predictions/${predictionId}/report`)
}
