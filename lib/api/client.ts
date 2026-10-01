// Único punto del navegador que hace peticiones (decisión 1). Habla solo con el
// propio origen: /api/session, /api/wake y /api/v1/* (BFF, lib/server/). El
// token vive en cookies httpOnly que este código no puede leer.
import { ApiError, parseErrorResponse } from "./errors"
import { retryRead } from "./retry"

// Tiempos anclados a gynfem-backend/docs/DEPLOYMENT.md §7.8 y §7.10. Cada uno
// supera en 5 s al del BFF (lib/server/backend.ts), para que el BFF responda
// antes con el formato uniforme.
export const READ_TIMEOUT_MS = 20_000
export const WRITE_TIMEOUT_MS = 35_000
export const WAKE_TIMEOUT_MS = 75_000
// Render suspende el servicio tras 15 min sin tráfico: pasado un minuto menos,
// se despierta antes de pedir nada.
export const IDLE_BEFORE_WAKE_MS = 14 * 60_000

export const CSRF_HEADER = "X-GynFem-Request"

type Method = "GET" | "POST" | "PATCH" | "DELETE"

let lastResponseAt: number | null = null
let unauthorizedHandler: (() => void) | null = null
const wakeListeners = new Set<(waking: boolean) => void>()

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

export function onWakeChange(listener: (waking: boolean) => void): () => void {
  wakeListeners.add(listener)
  return () => { wakeListeners.delete(listener) }
}

async function send<T>(method: Method, path: string, body: unknown, timeoutMs: number, notifyUnauthorized: boolean): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const headers: Record<string, string> = { "X-Request-ID": crypto.randomUUID(), [CSRF_HEADER]: "1" }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  let response: Response
  try {
    response = await fetch(new URL(path, window.location.origin), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    })
  } catch {
    const timedOut = controller.signal.aborted
    throw new ApiError({
      status: 0,
      code: timedOut ? "timeout" : "network_error",
      message: timedOut ? "El servidor tardó demasiado en responder." : "No se pudo conectar con el servidor.",
    })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    const error = await parseErrorResponse(response)
    if (error.status === 401 && notifyUnauthorized) unauthorizedHandler?.()
    throw error
  }
  lastResponseAt = Date.now()
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function attemptWake(): Promise<void> {
  await send("GET", "/api/wake", undefined, WAKE_TIMEOUT_MS, false)
}

let wakeInFlight: Promise<void> | null = null

// Despierta el backend (plan Free de Render). Es una lectura sin datos: un
// reintento. Los oyentes muestran «Iniciando el servicio…», nunca un error.
// Varias llamadas simultáneas comparten el mismo despertar.
export function wake(): Promise<void> {
  if (wakeInFlight) return wakeInFlight
  wakeListeners.forEach((listener) => listener(true))
  wakeInFlight = attemptWake().catch(attemptWake).finally(() => {
    wakeInFlight = null
    wakeListeners.forEach((listener) => listener(false))
  })
  return wakeInFlight
}

function isIdle(): boolean {
  return lastResponseAt !== null && Date.now() - lastResponseAt > IDLE_BEFORE_WAKE_MS
}

// Al abrir la aplicación y antes de iniciar sesión: despierta salvo que el
// backend haya respondido hace poco.
export function ensureAwake(): Promise<void> {
  return lastResponseAt !== null && !isIdle() ? Promise.resolve() : wake()
}

async function wakeIfIdle(): Promise<void> {
  if (isIdle()) await wake()
}

// Lectura de la API: GET, o POST /patients/search (el criterio viaja en el
// cuerpo, pero no escribe nada). Se reintenta ante fallos transitorios.
export async function apiRead<T>(path: string, searchBody?: unknown): Promise<T> {
  await wakeIfIdle()
  const method: Method = searchBody === undefined ? "GET" : "POST"
  return retryRead(() => send<T>(method, `/api/v1${path}`, searchBody, READ_TIMEOUT_MS, true))
}

// Escritura de la API: se envía UNA vez. Nunca se reintenta sola (decisión C).
export async function apiWrite<T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  await wakeIfIdle()
  return send<T>(method, `/api/v1${path}`, body, WRITE_TIMEOUT_MS, true)
}

// Sesión (/api/session). Un 401 aquí es la respuesta esperada, no una sesión caída.
export async function sessionRequest<T>(method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
  return send<T>(method, "/api/session", body, READ_TIMEOUT_MS, false)
}
