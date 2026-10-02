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

// Porcentaje con un decimal y coma, para el reporte impreso: con enteros, tres
// probabilidades que suman 1 pueden sumar 101 %.
export function formatPercent(probability: number): string {
  return `${(Math.round(probability * 1000) / 10).toFixed(1).replace(".", ",")} %`
}

// Para el papel, que no tiene contexto: la fecha dice su zona horaria.
export function formatDateTimeWithZone(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("es-PE", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset" })
}
