import { ApiError } from "@/lib/api/errors"

export const UNKNOWN_ERROR_MESSAGE = "No se pudo completar la operación. Inténtalo de nuevo."
// No dice sobre qué recurso: un 403 no revela si existe (decisión 5).
export const FORBIDDEN_MESSAGE = "No tienes permiso para esta operación."
export const UNKNOWN_OUTCOME_MESSAGE = "No sabemos si la operación se guardó. Compruébalo antes de repetirla."
const NETWORK_MESSAGE = "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."
const TIMEOUT_MESSAGE = "El servidor tardó demasiado en responder."
export const SESSION_EXPIRED_MESSAGE = "Tu sesión expiró. Vuelve a iniciar sesión para continuar."

// Estados cuyo `message` de la API está escrito para mostrarse tal cual.
const SHOWS_SERVER_MESSAGE = new Set([401, 404, 409, 422, 503])

export type DescribedError = { message: string; reference: string | null }

function messageOf(error: ApiError): string {
  if (error.code === "network_error") return NETWORK_MESSAGE
  if (error.code === "timeout" || error.status === 504) return TIMEOUT_MESSAGE
  if (error.status === 401 && error.code !== "invalid_credentials") return SESSION_EXPIRED_MESSAGE
  if (error.status === 403) return error.code === "account_disabled" ? error.message : FORBIDDEN_MESSAGE
  if (error.code !== "http_error" && SHOWS_SERVER_MESSAGE.has(error.status)) return error.message
  return UNKNOWN_ERROR_MESSAGE
}

// Texto para el usuario y código de referencia (el X-Request-ID de la petición).
// Un error que no viene de la API nunca muestra su mensaje interno.
export function describeError(error: unknown): DescribedError {
  if (!(error instanceof ApiError)) return { message: UNKNOWN_ERROR_MESSAGE, reference: null }
  return { message: messageOf(error), reference: error.requestId }
}
