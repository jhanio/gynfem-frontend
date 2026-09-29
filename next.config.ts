import type { NextConfig } from "next"
import { buildSecurityHeaders } from "./lib/security-headers"

const nextConfig: NextConfig = {
  // No anunciar el framework (Decisión 6).
  poweredByHeader: false,
  // Explícito aunque sea el valor por defecto: el código fuente no se publica.
  productionBrowserSourceMaps: false,
  async headers() {
    // Solo estas dos variables públicas; en las vistas previas no existen y la
    // CSP se queda en 'self' (docs/DEPLOYMENT.md, Sección 3).
    const env = {
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    }
    return [{ source: "/:path*", headers: buildSecurityHeaders(env, process.env.NODE_ENV === "development") }]
  },
}

export default nextConfig
