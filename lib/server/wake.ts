// GET /api/wake: despierta el backend del plan Free de Render, que se suspende
// tras 15 min sin tráfico (gynfem-backend/docs/DEPLOYMENT.md §7.10). Consulta
// /health, que es pública y no toca la base: sin credenciales y sin datos.
import { WAKE_UPSTREAM_TIMEOUT_MS, callBackend } from "./backend"
import { readServerEnv } from "./env"
import { errorResponse, json, notConfigured, requestIdOf } from "./http"

export async function wakeBackend(request: Request): Promise<Response> {
  const requestId = requestIdOf(request)
  const env = readServerEnv()
  if (!env) return notConfigured(requestId)
  const result = await callBackend(env, { method: "GET", path: "/health", requestId, timeoutMs: WAKE_UPSTREAM_TIMEOUT_MS })
  if ("failure" in result) return result.failure
  if (!result.response.ok) return errorResponse(502, "upstream_unreachable", "No se pudo conectar con el servidor.", requestId)
  return json(200, { status: "ok" }, requestId)
}
