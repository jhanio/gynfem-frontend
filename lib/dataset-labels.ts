import type { RiskLevel } from "@/lib/api/types"
import { riskLabel } from "@/lib/risk"

// Las etiquetas de `detail.labels` de /model/metrics son las del dataset
// («high risk», «mid risk», «low risk»), no los niveles del resto de la API
// (gynfem-backend/docs/API_SPEC.md §3.7.6, aviso 8). Se nombran igual que en un
// resultado, con lib/risk.ts como única fuente de los nombres.
// Map y no un objeto literal: una etiqueta como "toString" no debe resolverse por el prototipo.
const LEVELS = new Map<string, RiskLevel>([
  ["high risk", "high"],
  ["mid risk", "mid"],
  ["low risk", "low"],
])

export function datasetLevel(label: string): RiskLevel | null {
  return LEVELS.get(label) ?? null
}

// Una etiqueta que el backend añada después se muestra tal cual: nunca se oculta.
export function datasetLabel(label: string): string {
  const level = datasetLevel(label)
  return level === null ? label : riskLabel(level)
}
