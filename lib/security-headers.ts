// Cabeceras de seguridad (docs/DEPLOYMENT.md, Sección 3). Las aplica
// next.config.ts a todas las rutas. Desde la Fase 15 no dependen de ninguna
// variable: el navegador solo habla con su propio origen (BFF).

export type SecurityHeader = { key: string; value: string }

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"])

// Devuelve el origen de una variable de entorno, o null si no está definida.
// Exige un origen exacto (sin ruta, barra final, query ni credenciales), https
// salvo hacia localhost, y nunca comodines. El error nombra la variable pero no
// su valor, igual que la validación de configuración del backend.
export function publicOrigin(name: string, value: string | undefined): string | null {
  if (value === undefined || value === "") return null
  const fail = (reason: string): never => {
    throw new Error(`${name}: ${reason}`)
  }
  if (value.includes("*")) fail("no admite comodines")
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return fail("no es una URL válida")
  }
  const isLocal = LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) fail("debe usar https (http solo hacia localhost)")
  if (url.username || url.password) fail("no admite credenciales")
  if (value !== url.origin) fail("debe ser un origen exacto: esquema y host en minúsculas, sin ruta ni barra final")
  return url.origin
}

export function buildContentSecurityPolicy({ isDev }: { isDev: boolean }): string {
  // 'unsafe-inline' en script-src: Next inserta sus scripts de arranque en línea
  // y la página es estática, así que no hay nonce posible (Decisión C).
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Solo el propio origen: a Render y a Supabase los llama el servidor (lib/server/).
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // En next dev la app se sirve por http://localhost: pedir https rompería la carga.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ")
}

export function buildSecurityHeaders(isDev: boolean): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy({ isDev }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ]
}
