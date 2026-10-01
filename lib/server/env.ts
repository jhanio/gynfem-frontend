// Configuración del BFF. Solo se lee en el servidor: ninguna de estas variables
// lleva el prefijo NEXT_PUBLIC_, así que no llegan al JavaScript del navegador.
import { publicOrigin } from "../security-headers"

export type ServerEnv = { apiBaseUrl: string; supabaseUrl: string; supabasePublishableKey: string }

// null si falta o es inválida alguna variable (por ejemplo, en una vista previa
// de Vercel, que se compila sin ellas): el BFF responde 503 not_configured.
export function readServerEnv(env: Record<string, string | undefined> = process.env): ServerEnv | null {
  try {
    const apiBaseUrl = publicOrigin("API_BASE_URL", env.API_BASE_URL)
    const supabaseUrl = publicOrigin("SUPABASE_URL", env.SUPABASE_URL)
    const supabasePublishableKey = env.SUPABASE_PUBLISHABLE_KEY
    if (!apiBaseUrl || !supabaseUrl || !supabasePublishableKey) return null
    return { apiBaseUrl, supabaseUrl, supabasePublishableKey }
  } catch {
    return null
  }
}

// Al compilar (next.config.ts): un origen mal formado detiene la compilación en
// vez de publicar un BFF que llama a un destino equivocado. El error nombra la
// variable, nunca su valor. Sin variables no falla: las vistas previas compilan sin ellas.
export function assertServerOrigins(env: Record<string, string | undefined> = process.env): void {
  publicOrigin("API_BASE_URL", env.API_BASE_URL)
  publicOrigin("SUPABASE_URL", env.SUPABASE_URL)
}
