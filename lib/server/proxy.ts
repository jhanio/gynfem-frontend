// /api/v1/* del propio origen → API de Render. El navegador nunca ve el token:
// viaja en cookies httpOnly y aquí se convierte en `Authorization: Bearer`.
// No registra nada: por aquí pasan datos clínicos (decisión 10).
import { matchRoute } from "./allowed-routes"
import { READ_UPSTREAM_TIMEOUT_MS, WRITE_UPSTREAM_TIMEOUT_MS, callBackend } from "./backend"
import { csrfRejection } from "./csrf"
import { readServerEnv } from "./env"
import { baseHeaders, csrfRejected, errorResponse, notConfigured, requestIdOf } from "./http"
import { resolveSession } from "./session"
import { clearedSessionCookies } from "./session-cookies"

// Ningún cuerpo del contrato se acerca a este tamaño.
const MAX_BODY_BYTES = 16 * 1024
// Los únicos parámetros de URL del contrato (paginación). Un criterio de
// búsqueda nunca viaja en la URL (gynfem-backend/docs/API_SPEC.md §3.5).
const QUERY_PARAMETERS = ["limit", "offset"]

function forwardedQuery(request: Request): string {
  const incoming = new URL(request.url).searchParams
  const query = new URLSearchParams()
  for (const name of QUERY_PARAMETERS) {
    const value = incoming.get(name)
    if (value !== null && /^\d{1,6}$/.test(value)) query.set(name, value)
  }
  const text = query.toString()
  return text ? `?${text}` : ""
}

// Reenvía la respuesta del backend. Un cuerpo que no es JSON (la página de error
// de un proxy intermedio) nunca llega al navegador.
async function relay(upstream: Response, requestId: string, setCookies: readonly string[]): Promise<Response> {
  const upstreamRequestId = upstream.headers.get("X-Request-ID") ?? requestId
  if (upstream.status === 204) return new Response(null, { status: 204, headers: baseHeaders(upstreamRequestId, setCookies) })
  if (!(upstream.headers.get("content-type") ?? "").includes("application/json")) {
    return errorResponse(502, "upstream_unreachable", "No se pudo conectar con el servidor.", requestId, { setCookies })
  }
  const headers = baseHeaders(upstreamRequestId, setCookies)
  headers.set("Content-Type", "application/json")
  return new Response(await upstream.text(), { status: upstream.status, headers })
}

export async function proxyToBackend(request: Request, segments: readonly string[]): Promise<Response> {
  const requestId = requestIdOf(request)
  const env = readServerEnv()
  if (!env) return notConfigured(requestId)
  const route = matchRoute(request.method, segments)
  if (!route) return errorResponse(404, "not_found", "Recurso no encontrado.", requestId)
  if (csrfRejection(request)) return csrfRejected(requestId)

  let body: string | undefined
  if (request.method !== "GET" && request.method !== "DELETE") {
    body = await request.text()
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return errorResponse(413, "http_error", "La solicitud no se pudo procesar.", requestId)
    }
  }

  const session = await resolveSession(request, env, requestId)
  if ("rejection" in session) return session.rejection

  const result = await callBackend(env, {
    method: request.method,
    path: `/${segments.join("/")}${forwardedQuery(request)}`,
    accessToken: session.accessToken,
    body,
    requestId,
    timeoutMs: route.write ? WRITE_UPSTREAM_TIMEOUT_MS : READ_UPSTREAM_TIMEOUT_MS,
  })
  if ("failure" in result) return result.failure
  // 401: el backend ya no acepta el token. Se borra la sesión del navegador.
  const setCookies = result.response.status === 401 ? clearedSessionCookies(request) : session.setCookies
  return relay(result.response, requestId, setCookies)
}
