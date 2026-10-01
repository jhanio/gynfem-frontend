// Evita artefactos de coma flotante: 0.58 * 100 = 57.99999999999999.
export function formatProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`
}

// Solo para mostrar: la validación compara contra el valor exacto de la API.
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" })
}
