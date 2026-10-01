// La sesión vive en dos cookies httpOnly: el JavaScript del navegador no puede
// leerlas (docs/DEPLOYMENT.md, «Sesión»). Nunca en localStorage ni sessionStorage.

export type SessionTokens = { accessToken: string; refreshToken: string; expiresIn: number }

const ACCESS = "gf_at"
const REFRESH = "gf_rt"

// En https (producción) se usa el prefijo __Host-: el navegador solo acepta la
// cookie si es Secure, con Path=/ y sin Domain, así que un subdominio no puede
// fijarla. En http://localhost (next start en local) no hay Secure ni prefijo.
function isHttps(request: Request): boolean {
  return request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:"
}

function names(request: Request): { access: string; refresh: string; attributes: string } {
  const secure = isHttps(request)
  const prefix = secure ? "__Host-" : ""
  return {
    access: `${prefix}${ACCESS}`,
    refresh: `${prefix}${REFRESH}`,
    attributes: `Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`,
  }
}

export function sessionCookies(request: Request, tokens: SessionTokens): string[] {
  const { access, refresh, attributes } = names(request)
  return [
    `${access}=${tokens.accessToken}; ${attributes}; Max-Age=${tokens.expiresIn}`,
    // Sin Max-Age ni Expires: cookie de sesión, se pierde al cerrar el navegador.
    `${refresh}=${tokens.refreshToken}; ${attributes}`,
  ]
}

export function clearedSessionCookies(request: Request): string[] {
  const { access, refresh, attributes } = names(request)
  return [`${access}=; ${attributes}; Max-Age=0`, `${refresh}=; ${attributes}; Max-Age=0`]
}

export function readSessionCookies(request: Request): { accessToken: string | null; refreshToken: string | null } {
  const { access, refresh } = names(request)
  const jar = new Map<string, string>()
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=")
    if (separator > 0) jar.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim())
  }
  return { accessToken: jar.get(access) || null, refreshToken: jar.get(refresh) || null }
}

function claims(token: string): Record<string, unknown> | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"))
    return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// Lee `exp` SIN verificar la firma: solo decide si conviene refrescar antes de
// reenviar. Quien verifica el token es el backend, en cada petición.
export function secondsToExpiry(token: string): number {
  const exp = claims(token)?.exp
  return typeof exp === "number" ? Math.max(0, exp - Date.now() / 1000) : 0
}

// Correo del token, solo para mostrarlo en la cabecera. No autoriza nada.
export function emailOf(token: string): string | null {
  const email = claims(token)?.email
  return typeof email === "string" ? email : null
}
