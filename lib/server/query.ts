// Qué parámetros de URL reenvía el BFF, por ruta. Un criterio de búsqueda de
// pacientes nunca viaja en la URL (gynfem-backend/docs/API_SPEC.md §3.5); los
// filtros de la auditoría sí: no son datos clínicos, sino acciones e ids opacos.
import type { ErrorDetail } from "@/lib/api/errors"
import type { AllowedRoute } from "./allowed-routes"

const UNSIGNED_INTEGER = /^\d{1,6}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Fecha y hora con zona horaria obligatoria (`Z` o desplazamiento). Un `+` sin
// codificar llega aquí como un espacio y no pasa (API_SPEC §3.7.6, aviso 1).
const ZONED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/
const AUDIT_ACTION = /^(?=.{1,100}$)[a-z_]+\.[a-z_]+$/
const AUDIT_ENTITY_TYPE = /^(patient|clinical_measurement|prediction|user|system_setting)$/

type Rule = { pattern: RegExp; type: string }

const PAGINATION: ReadonlyMap<string, Rule> = new Map([
  ["limit", { pattern: UNSIGNED_INTEGER, type: "int_parsing" }],
  ["offset", { pattern: UNSIGNED_INTEGER, type: "int_parsing" }],
])

// Los filtros de GET /audit-log (API_SPEC §3.7.5), con el mismo formato que exige el backend.
const AUDIT: ReadonlyMap<string, Rule> = new Map([
  ...PAGINATION,
  ["action", { pattern: AUDIT_ACTION, type: "string_pattern_mismatch" }],
  ["entity_type", { pattern: AUDIT_ENTITY_TYPE, type: "literal_error" }],
  ["entity_id", { pattern: UUID, type: "uuid_parsing" }],
  ["actor_user_id", { pattern: UUID, type: "uuid_parsing" }],
  ["from", { pattern: ZONED_DATE_TIME, type: "timezone_aware" }],
  ["to", { pattern: ZONED_DATE_TIME, type: "timezone_aware" }],
])

export type ForwardedQuery = { query: string } | { invalid: ErrorDetail[] }

// Un parámetro que la ruta no declara nunca se reenvía. Uno declarado con un
// valor inválido se descarta, salvo en la auditoría: allí descartar un filtro
// devolvería filas sin filtrar, así que se rechaza (422) sin llamar al backend.
export function forwardedQuery(route: AllowedRoute, request: Request): ForwardedQuery {
  if (route.query === "none") return { query: "" }
  const isStrict = route.query === "audit"
  const incoming = new URL(request.url).searchParams
  const query = new URLSearchParams()
  const invalid: ErrorDetail[] = []
  for (const [name, rule] of isStrict ? AUDIT : PAGINATION) {
    const value = incoming.get(name)
    if (value === null) continue
    if (rule.pattern.test(value)) query.set(name, value)
    else if (isStrict) invalid.push({ loc: ["query", name], type: rule.type })
  }
  if (invalid.length > 0) return { invalid }
  const text = query.toString()
  return { query: text ? `?${text}` : "" }
}
