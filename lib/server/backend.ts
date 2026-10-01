// Llamadas del BFF a la API de Render. Tiempos anclados a las latencias medidas
// (gynfem-backend/docs/DEPLOYMENT.md §7.8 y §7.10):
// - lectura 15 s: el peor caso del backend antes de responder 503 por su cuenta
//   (5 s de conexión + 5 s de pool + 5 s de sentencia);
// - escritura 30 s: una escritura clínica mide 2–3 s; el doble de ese peor caso;
// - despertar 70 s: el arranque en frío más lento medido fue 53.1 s (× 1.3).
import type { ServerEnv } from "./env"
import { REQUEST_ID_HEADER, errorResponse } from "./http"

export const READ_UPSTREAM_TIMEOUT_MS = 15_000
export const WRITE_UPSTREAM_TIMEOUT_MS = 30_000
export const WAKE_UPSTREAM_TIMEOUT_MS = 70_000

export const API_PREFIX = "/api/v1"

type BackendCall = { method: string; path: string; requestId: string; timeoutMs: number; accessToken?: string; body?: string }

// La respuesta del backend, o `failure` (502/504 uniforme) si no la hubo.
export async function callBackend(env: ServerEnv, call: BackendCall): Promise<{ response: Response } | { failure: Response }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), call.timeoutMs)
  const headers: Record<string, string> = { [REQUEST_ID_HEADER]: call.requestId, Accept: "application/json" }
  if (call.accessToken) headers.Authorization = `Bearer ${call.accessToken}`
  if (call.body !== undefined) headers["Content-Type"] = "application/json"
  try {
    const response = await fetch(`${env.apiBaseUrl}${API_PREFIX}${call.path}`, {
      method: call.method, headers, body: call.body, signal: controller.signal, cache: "no-store", redirect: "manual",
    })
    return { response }
  } catch {
    return {
      failure: controller.signal.aborted
        ? errorResponse(504, "upstream_timeout", "El servidor tardó demasiado en responder.", call.requestId)
        : errorResponse(502, "upstream_unreachable", "No se pudo conectar con el servidor.", call.requestId),
    }
  } finally {
    clearTimeout(timer)
  }
}
