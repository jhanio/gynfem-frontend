import { vi } from "vitest"

// Orígenes en dominios reservados (RFC 2606): ninguno existe.
export const APP_ORIGIN = "https://gynfem-frontend.example"
export const API = "https://api-ficticia.example"
export const SUPABASE = "https://proyecto-ficticio.example"
export const PUBLISHABLE_KEY = "sb_publishable_clave-de-prueba"

export const USER_ID = "11111111-1111-4111-8111-111111111111"
export const PATIENT_ID = "22222222-2222-4222-8222-222222222222"

export function stubServerEnv(): void {
  vi.stubEnv("API_BASE_URL", API)
  vi.stubEnv("SUPABASE_URL", SUPABASE)
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY)
}

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")

// JWT sin firma válida: el BFF nunca verifica el token, solo lee `exp` y `email`.
export function fakeJwt(secondsFromNow: number, email = "medica.ficticia@gynfem.test"): string {
  const exp = Math.floor(Date.now() / 1000) + secondsFromNow
  return `${b64url({ alg: "ES256", typ: "JWT" })}.${b64url({ exp, email, sub: USER_ID })}.firma-ficticia`
}

type RequestOptions = { cookies?: Record<string, string>; body?: unknown; rawBody?: string; origin?: string | null; csrf?: boolean; headers?: Record<string, string> }

export function bffRequest(method: string, path: string, options: RequestOptions = {}): Request {
  const { cookies = {}, body, rawBody, origin = APP_ORIGIN, csrf = true, headers = {} } = options
  const all = new Headers({ host: new URL(APP_ORIGIN).host, ...headers })
  if (origin !== null) all.set("origin", origin)
  if (csrf) all.set("x-gynfem-request", "1")
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ")
  if (cookieHeader) all.set("cookie", cookieHeader)
  const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
  if (payload !== undefined) all.set("content-type", "application/json")
  return new Request(`${APP_ORIGIN}${path}`, { method, headers: all, body: payload })
}

export const ACCESS_COOKIE = "__Host-gf_at"
export const REFRESH_COOKIE = "__Host-gf_rt"

export function supabaseSession(accessToken: string, refreshToken = "refresh-nuevo") {
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: refreshToken,
    user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "medica.ficticia@gynfem.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-27T00:00:00Z" },
  }
}
