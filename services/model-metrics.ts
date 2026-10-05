import { apiRead } from "@/lib/api/client"
import type { ModelMetrics } from "@/lib/api/types"

// Métricas del modelo (HU010). La ruta no admite parámetros: las cifras llegan
// siempre con sus limitaciones, en la misma respuesta.
export function getModelMetrics(): Promise<ModelMetrics> {
  return apiRead<ModelMetrics>("/model/metrics")
}
