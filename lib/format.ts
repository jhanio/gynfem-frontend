// Evita artefactos de coma flotante: 0.58 * 100 = 57.99999999999999.
export function formatProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`
}
