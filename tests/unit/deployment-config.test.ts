import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import nextConfig from "@/next.config"

// Las únicas variables que el navegador puede recibir (Fase 14, Decisión A).
const ALLOWED_PUBLIC_VARIABLES = ["NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
// Nada que suene a secreto puede llevar el prefijo público (Decisiones 3 y 4).
const FORBIDDEN_NAME_FRAGMENT = /SECRET|SERVICE|DATABASE|PASSWORD|PRIVATE|TOKEN/

const envExample = readFileSync(".env.example", "utf8")
const envLines = envExample.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"))
const vercelJson = JSON.parse(readFileSync("vercel.json", "utf8")) as Record<string, unknown>
const nextConfigSource = readFileSync("next.config.ts", "utf8")

describe(".env.example (Fase 14, Decisión A)", () => {
  test("declara exactamente las variables públicas permitidas", () => {
    expect(envLines.map((line) => line.split("=")[0].trim()).sort()).toEqual([...ALLOWED_PUBLIC_VARIABLES].sort())
  })

  test("no lleva ningún valor real", () => {
    for (const line of envLines) expect(line).toMatch(/^[A-Z_]+=$/)
  })

  test("ningún nombre público contiene un fragmento de secreto", () => {
    for (const name of ALLOWED_PUBLIC_VARIABLES) expect(name).not.toMatch(FORBIDDEN_NAME_FRAGMENT)
  })
})

describe("next.config.ts (Fase 14, Decisiones 5 y 6)", () => {
  test("no anuncia el framework con X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  test("no publica mapas de código para el navegador", () => {
    expect(nextConfig.productionBrowserSourceMaps).toBe(false)
  })

  test("aplica las cabeceras de seguridad a todas las rutas", async () => {
    const rules = await nextConfig.headers!()
    const all = rules.find((rule) => rule.source === "/:path*")
    expect(all).toBeDefined()
    const keys = all!.headers.map((h) => h.key)
    for (const key of ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(keys).toContain(key)
    }
  })

  test("solo lee variables públicas permitidas", () => {
    const read = [...nextConfigSource.matchAll(/NEXT_PUBLIC_[A-Z_]+/g)].map((m) => m[0])
    for (const name of read) expect(ALLOWED_PUBLIC_VARIABLES).toContain(name)
  })
})

describe("vercel.json (Fase 14)", () => {
  test("fija el framework y los comandos de instalación y compilación", () => {
    expect(vercelJson).toMatchObject({ framework: "nextjs", installCommand: "npm ci", buildCommand: "npm run build" })
  })

  test("no versiona variables de entorno ni duplica cabeceras de next.config.ts", () => {
    expect(vercelJson).not.toHaveProperty("env")
    expect(vercelJson).not.toHaveProperty("build")
    expect(vercelJson).not.toHaveProperty("headers")
  })
})
