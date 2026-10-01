import { apiRead } from "@/lib/api/client"
import type { PredictionSchema } from "@/lib/api/types"

// Caché en memoria, nunca en almacenamiento del navegador. 10 min: un
// despliegue del backend puede cambiar el modelo o sus límites, y así la
// interfaz no arrastra rangos viejos más allá de ese tiempo.
export const SCHEMA_TTL_MS = 10 * 60_000

let cached: { schema: PredictionSchema; fetchedAt: number } | null = null

export async function getPredictionSchema(): Promise<PredictionSchema> {
  if (cached && Date.now() - cached.fetchedAt < SCHEMA_TTL_MS) return cached.schema
  const schema = await apiRead<PredictionSchema>("/prediction/schema")
  cached = { schema, fetchedAt: Date.now() }
  return schema
}

// Se llama al cerrar sesión, y cuando el servidor contradice al esquema guardado
// (un 422 en un campo que la interfaz dio por válido, u otra versión del modelo).
export function invalidatePredictionSchema(): void {
  cached = null
}
