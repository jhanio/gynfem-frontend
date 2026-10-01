// Respuestas del BFF. Los errores propios usan el mismo formato uniforme que la
// API (gynfem-backend/docs/API_SPEC.md §2.5), para que la interfaz los trate igual.
import type { ErrorDetail } from "@/lib/api/errors"

export const REQUEST_ID_HEADER = "X-Request-ID"
// El mismo formato que acepta el backend (app/core/middleware.py).
const VALID_REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/

export function requestIdOf(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER)
  return incoming && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID()
}

export function baseHeaders(requestId: string, setCookies: readonly string[] = []): Headers {
  // no-store: ninguna respuesta con datos clínicos o de sesión se guarda en cachés.
  const headers = new Headers({ "Cache-Control": "no-store", [REQUEST_ID_HEADER]: requestId })
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie)
  return headers
}

export function json(status: number, body: unknown, requestId: string, setCookies: readonly string[] = []): Response {
  const headers = baseHeaders(requestId, setCookies)
  headers.set("Content-Type", "application/json")
  return new Response(JSON.stringify(body), { status, headers })
}

export function errorResponse(
  status: number, code: string, message: string, requestId: string,
  options: { details?: ErrorDetail[]; setCookies?: readonly string[] } = {},
): Response {
  const error = { code, message, request_id: requestId, ...(options.details ? { details: options.details } : {}) }
  return json(status, { error }, requestId, options.setCookies)
}

export const notConfigured = (requestId: string) =>
  errorResponse(503, "not_configured", "El servicio no está configurado en este entorno.", requestId)
export const csrfRejected = (requestId: string) =>
  errorResponse(403, "csrf_rejected", "Solicitud rechazada.", requestId)
export const notAuthenticated = (requestId: string, setCookies: readonly string[] = []) =>
  errorResponse(401, "not_authenticated", "Se requiere autenticación.", requestId, { setCookies })
export const authUnavailable = (requestId: string) =>
  errorResponse(503, "auth_unavailable", "El servicio de autenticación no está disponible.", requestId)
