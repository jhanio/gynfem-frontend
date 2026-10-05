import type { AuditFilters } from "@/lib/api/types"

// API_SPEC §3.7.5. Catálogo de filtros, nunca campos clínicos ni valores de entidades.
export const AUDIT_ENTITY_TYPES = ["patient", "clinical_measurement", "prediction", "user", "system_setting"] as const
export const AUDIT_FILTER_KEYS = ["action", "entity_type", "entity_id", "actor_user_id", "from", "to"] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTION = /^(?=.{1,100}$)[a-z_]+\.[a-z_]+$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|([+-])(\d{2}):(\d{2}))$/

// Conserva microsegundos: Date por sí solo truncaría la precisión del contrato.
export function auditInstant(value: string): bigint | null {
  const match = DATE.exec(value)
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] ?? 0)
  const offsetHour = Number(match[10] ?? 0), offsetMinute = Number(match[11] ?? 0)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  const offset = (offsetHour * 60 + offsetMinute) * (match[9] === "-" ? -1 : 1)
  return BigInt(date.getTime() - offset * 60_000) * BigInt(1000) + BigInt((match[7] ?? "").padEnd(6, "0"))
}

export function validateAuditFilters(draft: AuditFilters): { filters: AuditFilters; errors: Record<string, string> } {
  const filters: AuditFilters = {}
  const errors: Record<string, string> = {}
  for (const key of AUDIT_FILTER_KEYS) {
    const value = draft[key]?.trim()
    if (!value) continue
    if (key === "action" && !ACTION.test(value)) errors[key] = "string_pattern_mismatch"
    else if (key === "entity_type" && !AUDIT_ENTITY_TYPES.some((type) => type === value)) errors[key] = "literal_error"
    else if ((key === "entity_id" || key === "actor_user_id") && !UUID.test(value)) errors[key] = "uuid_parsing"
    else if ((key === "from" || key === "to") && auditInstant(value) === null) errors[key] = "timezone_aware"
    else filters[key] = key === "entity_id" || key === "actor_user_id" ? value.toLowerCase() : value
  }
  if (filters.from && filters.to && auditInstant(filters.from)! > auditInstant(filters.to)!) {
    errors.from = errors.to = "date_range_inverted"
  }
  return { filters, errors }
}

// La hora de la API conserva el desplazamiento original y todos sus decimales.
export function auditDateLabel(value: string): string {
  return value.replace("T", " ").replace(/Z$/, " UTC")
}
