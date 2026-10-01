// Sesión vigente de una petición. El refresco ocurre AQUÍ, en el servidor y
// antes de reenviar: así ninguna petición —tampoco una escritura— tiene que
// repetirse por un 401 token_expired.
import type { ServerEnv } from "./env"
import { authUnavailable, notAuthenticated } from "./http"
import { clearedSessionCookies, readSessionCookies, secondsToExpiry, sessionCookies } from "./session-cookies"
import { AuthUnavailableError, refreshSession } from "./supabase-auth"

// Margen para refrescar: el doble de los 30 s de tolerancia de reloj del backend.
export const REFRESH_MARGIN_S = 60

export type ActiveSession = { accessToken: string; setCookies: string[] }

export async function resolveSession(request: Request, env: ServerEnv, requestId: string): Promise<ActiveSession | { rejection: Response }> {
  const { accessToken, refreshToken } = readSessionCookies(request)
  if (accessToken && secondsToExpiry(accessToken) > REFRESH_MARGIN_S) return { accessToken, setCookies: [] }
  if (!refreshToken) {
    const hadSession = accessToken !== null
    return { rejection: notAuthenticated(requestId, hadSession ? clearedSessionCookies(request) : []) }
  }
  try {
    const tokens = await refreshSession(env, refreshToken)
    if (!tokens) return { rejection: notAuthenticated(requestId, clearedSessionCookies(request)) }
    return { accessToken: tokens.accessToken, setCookies: sessionCookies(request, tokens) }
  } catch (error) {
    if (error instanceof AuthUnavailableError) return { rejection: authUnavailable(requestId) }
    throw error
  }
}
