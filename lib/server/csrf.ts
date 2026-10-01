// Con la sesión en cookies, el navegador las adjunta solo: hay que comprobar
// que la petición la originó esta misma aplicación. Tres barreras:
//   1. las cookies son SameSite=Strict (lib/server/session-cookies.ts);
//   2. toda escritura trae un Origin igual al host que la recibe;
//   3. toda escritura trae una cabecera propia, que un formulario HTML de otro
//      sitio no puede añadir sin un preflight CORS que este origen no concede.
const SAFE_METHODS = new Set(["GET", "HEAD"])
const CSRF_HEADER = "x-gynfem-request"

export function csrfRejection(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return false
  if (request.headers.get(CSRF_HEADER) !== "1") return true
  const origin = request.headers.get("origin")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (!origin || !host) return true
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}
