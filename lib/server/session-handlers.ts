// /api/session: inicio, consulta y cierre de sesión. Supabase Auth emite el
// token; el rol lo decide el backend en GET /me (nunca la interfaz ni el token).
// No registra nada: por aquí pasan la contraseña y los tokens.
import type { ErrorDetail } from "@/lib/api/errors"
import { READ_UPSTREAM_TIMEOUT_MS, callBackend } from "./backend"
import { csrfRejection } from "./csrf"
import { type ServerEnv, readServerEnv } from "./env"
import { authUnavailable, baseHeaders, csrfRejected, errorResponse, json, notConfigured, requestIdOf } from "./http"
import { resolveSession } from "./session"
import { clearedSessionCookies, emailOf, readSessionCookies, sessionCookies } from "./session-cookies"
import { AuthUnavailableError, signIn, signOut } from "./supabase-auth"

type Credentials = { email: string; password: string }

async function readCredentials(request: Request): Promise<Credentials | ErrorDetail[]> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return [{ loc: ["body"], type: "json_invalid" }]
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  const missing = (["email", "password"] as const).filter((field) => typeof record[field] !== "string" || record[field] === "")
  if (missing.length > 0) return missing.map((field) => ({ loc: ["body", field], type: "missing" }))
  return { email: record.email as string, password: record.password as string }
}

// GET /me con el token: `{id, role}` más el correo del token, o la respuesta de
// error del backend tal cual (403 account_disabled, 401, 503…).
async function identity(env: ServerEnv, accessToken: string, requestId: string, setCookies: readonly string[], onUnauthorized: readonly string[]): Promise<Response> {
  const result = await callBackend(env, { method: "GET", path: "/me", accessToken, requestId, timeoutMs: READ_UPSTREAM_TIMEOUT_MS })
  if ("failure" in result) return result.failure
  const { response } = result
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const record = typeof body === "object" && body !== null ? (body as { error?: { code?: unknown; message?: unknown } }).error : undefined
    const code = typeof record?.code === "string" ? record.code : "http_error"
    const message = typeof record?.message === "string" ? record.message : "La solicitud no se pudo procesar."
    return errorResponse(response.status, code, message, requestId, { setCookies: response.status === 401 ? onUnauthorized : [] })
  }
  const me = body as { id: string; role: string }
  return json(200, { id: me.id, role: me.role, email: emailOf(accessToken) }, requestId, setCookies)
}

export async function login(request: Request): Promise<Response> {
  const requestId = requestIdOf(request)
  const env = readServerEnv()
  if (!env) return notConfigured(requestId)
  if (csrfRejection(request)) return csrfRejected(requestId)
  const credentials = await readCredentials(request)
  if (Array.isArray(credentials)) {
    return errorResponse(422, "validation_error", "La solicitud no es válida.", requestId, { details: credentials })
  }
  try {
    const tokens = await signIn(env, credentials.email, credentials.password)
    // Un solo mensaje para correo inexistente y contraseña errónea: no revela cuál falló.
    if (!tokens) return errorResponse(401, "invalid_credentials", "Correo o contraseña incorrectos.", requestId)
    return identity(env, tokens.accessToken, requestId, sessionCookies(request, tokens), [])
  } catch (error) {
    if (error instanceof AuthUnavailableError) return authUnavailable(requestId)
    throw error
  }
}

export async function currentSession(request: Request): Promise<Response> {
  const requestId = requestIdOf(request)
  const env = readServerEnv()
  if (!env) return notConfigured(requestId)
  const session = await resolveSession(request, env, requestId)
  if ("rejection" in session) return session.rejection
  return identity(env, session.accessToken, requestId, session.setCookies, clearedSessionCookies(request))
}

export async function logout(request: Request): Promise<Response> {
  const requestId = requestIdOf(request)
  if (csrfRejection(request)) return csrfRejected(requestId)
  const env = readServerEnv()
  const { accessToken } = readSessionCookies(request)
  if (env && accessToken) await signOut(env, accessToken)
  return new Response(null, { status: 204, headers: baseHeaders(requestId, clearedSessionCookies(request)) })
}
