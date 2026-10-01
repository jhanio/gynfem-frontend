import { validationMessage } from "@/lib/validation-messages"

// Formato de error uniforme de la API (gynfem-backend/docs/API_SPEC.md §2.5).
export type ErrorDetail = { loc: Array<string | number>; type: string }

type ApiErrorInit = { status: number; code: string; message: string; requestId?: string | null; details?: ErrorDetail[] }

// status 0: la petición no obtuvo respuesta (network_error o timeout).
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | null
  readonly details: readonly ErrorDetail[]

  constructor({ status, code, message, requestId = null, details = [] }: ApiErrorInit) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

const NO_UNIFORM_BODY_MESSAGE = "La solicitud no se pudo procesar."

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseDetails(value: unknown): ErrorDetail[] {
  if (!Array.isArray(value)) return []
  return value.filter((d): d is ErrorDetail => isRecord(d) && Array.isArray(d.loc) && typeof d.type === "string")
}

// Nunca muestra un cuerpo que no sea el formato uniforme: un proxy intermedio
// puede responder HTML o texto con detalles internos.
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  const headerRequestId = response.headers.get("X-Request-ID")
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  const error = isRecord(body) ? body.error : null
  if (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string") {
    return new ApiError({ status: response.status, code: "http_error", message: NO_UNIFORM_BODY_MESSAGE, requestId: headerRequestId })
  }
  return new ApiError({
    status: response.status,
    code: error.code,
    message: error.message,
    requestId: typeof error.request_id === "string" ? error.request_id : headerRequestId,
    details: parseDetails(error.details),
  })
}

const TRANSIENT_STATUS = new Set([0, 502, 503, 504])

// Transitorio: puede resolverse solo. Solo las lecturas se reintentan (lib/api/retry.ts).
export function isTransient(error: unknown): boolean {
  return error instanceof ApiError && TRANSIENT_STATUS.has(error.status)
}

// Sin respuesta del backend (red, espera agotada o el BFF no llegó a recibirla)
// no se sabe si una escritura se aplicó. Un 503 del backend sí es una respuesta:
// su transacción no se confirmó.
const UNKNOWN_OUTCOME_STATUS = new Set([0, 502, 504])

export function isOutcomeUnknown(error: unknown): boolean {
  return error instanceof ApiError && UNKNOWN_OUTCOME_STATUS.has(error.status)
}

// 422 del dominio que llegan sin `details`: el código dice a qué campo pertenecen.
const FIELD_OF_CODE = new Map<string, string>([["weak_password", "password"]])

export type ValidationErrors = { fields: Record<string, string>; form: string[] }

// Reparte un 422 entre los campos que lo causaron y el formulario (decisión 6).
export function splitValidation(error: unknown): ValidationErrors {
  const result: ValidationErrors = { fields: {}, form: [] }
  if (!(error instanceof ApiError) || error.status !== 422) return result
  if (error.details.length === 0) {
    const field = FIELD_OF_CODE.get(error.code)
    if (field) result.fields[field] = error.message
    else result.form.push(error.message)
    return result
  }
  for (const detail of error.details) {
    const field = detail.loc[0] === "body" && typeof detail.loc[1] === "string" ? detail.loc[1] : null
    const message = validationMessage(detail.type)
    if (field === null) result.form.push(message)
    else if (!(field in result.fields)) result.fields[field] = message
  }
  return result
}
