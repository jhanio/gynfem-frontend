import type { RiskLevel } from "@/lib/api/types"

const LABELS: Record<RiskLevel, string> = { high: "Alto", mid: "Moderado", low: "Bajo" }

export function riskLabel(level: RiskLevel): string {
  return LABELS[level]
}
