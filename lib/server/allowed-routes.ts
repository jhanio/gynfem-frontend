// Lista cerrada de lo que el BFF reenvía a la API: el BFF no es un proxy
// abierto. Es la matriz rol × endpoint de gynfem-backend/docs/API_SPEC.md §3.6
// menos las rutas de EXCLUDED_FROM_PROXY; tests/contract/rbac.test.ts falla si
// esta lista y la matriz dejan de coincidir.
//
// `write: false` marca lo que no escribe en la base (también dos POST: la
// búsqueda, cuyo criterio viaja en el cuerpo, y /predict, sin persistencia).
// El reporte sí escribe: cada generación deja su registro de auditoría.
//
// `query` dice qué parámetros de URL se reenvían (lib/server/query.ts): por
// defecto solo la paginación; "none", ninguno; "audit", además los filtros de
// la auditoría, validados.
export type AllowedRoute = { method: "GET" | "POST" | "PATCH" | "DELETE"; template: string; write: boolean; query?: "none" | "audit" }

export const ALLOWED_ROUTES: readonly AllowedRoute[] = [
  { method: "POST", template: "/predict", write: false },
  { method: "GET", template: "/prediction/schema", write: false },
  { method: "GET", template: "/model/metrics", write: false, query: "none" },
  { method: "POST", template: "/patients", write: true },
  { method: "POST", template: "/patients/search", write: false },
  { method: "GET", template: "/patients/{patient_id}", write: false },
  { method: "PATCH", template: "/patients/{patient_id}", write: true },
  { method: "DELETE", template: "/patients/{patient_id}", write: true },
  { method: "POST", template: "/patients/{patient_id}/measurements", write: true },
  { method: "GET", template: "/patients/{patient_id}/measurements", write: false },
  { method: "GET", template: "/patients/{patient_id}/evaluations", write: false },
  { method: "POST", template: "/measurements/{measurement_id}/corrections", write: true },
  { method: "GET", template: "/predictions/{prediction_id}", write: false },
  { method: "POST", template: "/predictions/{prediction_id}/report", write: true },
  { method: "POST", template: "/users", write: true },
  { method: "GET", template: "/users", write: false },
  { method: "GET", template: "/users/{user_id}", write: false },
  { method: "PATCH", template: "/users/{user_id}", write: true },
  { method: "POST", template: "/users/{user_id}/deactivate", write: true },
  { method: "POST", template: "/users/{user_id}/activate", write: true },
  { method: "GET", template: "/settings", write: false, query: "none" },
  { method: "PATCH", template: "/settings", write: true, query: "none" },
  { method: "GET", template: "/audit-log", write: false, query: "audit" },
]

// Rutas de la matriz que el navegador no alcanza a través de /api/v1, y por qué.
export const EXCLUDED_FROM_PROXY: ReadonlyMap<string, string> = new Map([
  ["GET /health", "Solo la usa /api/wake, sin credenciales."],
  ["GET /health/ready", "Diagnóstico de operación: no es de la interfaz."],
  ["GET /me", "Solo la usa /api/session, que añade el correo."],
  ["GET /openapi.json", "No existe en producción."],
  ["GET /docs", "No existe en producción."],
])

// Los identificadores de la API son UUID opacos: cualquier otra cosa en su
// lugar (`..`, un documento, un nombre) no se reenvía.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PARAMETER = /^\{\w+\}$/

export function matchRoute(method: string, segments: readonly string[]): AllowedRoute | null {
  return ALLOWED_ROUTES.find((route) => {
    if (route.method !== method) return false
    const template = route.template.split("/").filter(Boolean)
    return template.length === segments.length
      && template.every((part, i) => (PARAMETER.test(part) ? UUID.test(segments[i]) : part === segments[i]))
  }) ?? null
}
