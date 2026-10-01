// Supabase Auth, solo desde el servidor y con la clave PUBLICABLE. Tres llamadas
// a su API REST (las mismas que usa supabase-js) con `fetch`:
// supabase-js reintenta por su cuenta con esperas crecientes cuando Supabase no
// responde, y aquí cada espera tiene que estar acotada. Nada se guarda: la
// sesión vive en las cookies httpOnly que fija el BFF. La clave secreta de
// Supabase nunca entra en este repositorio.
import type { ServerEnv } from "./env"
import type { SessionTokens } from "./session-cookies"

export class AuthUnavailableError extends Error {}

// El mismo margen que da el backend a Supabase Auth (GYNFEM_AUTH_HTTP_TIMEOUT_S = 5), con holgura.
export const AUTH_TIMEOUT_MS = 10_000

async function authRequest(env: ServerEnv, path: string, bearer: string, body?: unknown): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  try {
    return await fetch(`${env.supabaseUrl}/auth/v1${path}`, {
      method: "POST",
      headers: { apikey: env.supabasePublishableKey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual",
    })
  } catch {
    throw new AuthUnavailableError()
  } finally {
    clearTimeout(timer)
  }
}

// null: Supabase rechazó la credencial (4xx). Lanza si Supabase no responde o
// falla (5xx): es una dependencia caída, no una credencial incorrecta.
async function tokens(env: ServerEnv, grantType: "password" | "refresh_token", body: unknown): Promise<SessionTokens | null> {
  const response = await authRequest(env, `/token?grant_type=${grantType}`, env.supabasePublishableKey, body)
  if (response.status >= 400 && response.status < 500) return null
  if (!response.ok) throw new AuthUnavailableError()
  let session: unknown
  try {
    session = await response.json()
  } catch {
    throw new AuthUnavailableError()
  }
  const { access_token, refresh_token, expires_in } = (session ?? {}) as Record<string, unknown>
  if (typeof access_token !== "string" || typeof refresh_token !== "string" || typeof expires_in !== "number") {
    throw new AuthUnavailableError()
  }
  return { accessToken: access_token, refreshToken: refresh_token, expiresIn: expires_in }
}

export function signIn(env: ServerEnv, email: string, password: string): Promise<SessionTokens | null> {
  return tokens(env, "password", { email, password })
}

export function refreshSession(env: ServerEnv, refreshToken: string): Promise<SessionTokens | null> {
  return tokens(env, "refresh_token", { refresh_token: refreshToken })
}

// Revoca la sesión en Supabase. Si falla no importa: las cookies se borran igual
// y el token de acceso caduca solo (≤ 1 h, gynfem-backend/docs/SECURITY.md §2.3).
export async function signOut(env: ServerEnv, accessToken: string): Promise<void> {
  try {
    await authRequest(env, "/logout?scope=local", accessToken)
  } catch {
    // Sin efecto: ver el comentario de arriba.
  }
}
