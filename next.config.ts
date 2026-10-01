import type { NextConfig } from "next"
import { buildSecurityHeaders } from "./lib/security-headers"
import { assertServerOrigins } from "./lib/server/env"

// Un origen mal formado detiene la compilación (docs/DEPLOYMENT.md, Sección 2).
assertServerOrigins()

const nextConfig: NextConfig = {
  // No anunciar el framework (Decisión 6).
  poweredByHeader: false,
  // Explícito aunque sea el valor por defecto: el código fuente no se publica.
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders(process.env.NODE_ENV === "development") }]
  },
}

export default nextConfig
