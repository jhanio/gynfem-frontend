import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import nextConfig from "@/next.config"

// Desde la Fase 15 (BFF) el navegador no recibe NINGUNA variable: las tres son de servidor.
const ALLOWED_PUBLIC_VARIABLES: string[] = []
const SERVER_VARIABLES = ["API_BASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"]
// Los únicos archivos que pueden leer el entorno. Ningún componente ni servicio del navegador.
const ENV_READERS = ["lib/server/env.ts", "next.config.ts"]
// Nada que suene a secreto puede llevar el prefijo público (Decisiones 3 y 4).
const FORBIDDEN_NAME_FRAGMENT = /SECRET|SERVICE|DATABASE|PASSWORD|PRIVATE|TOKEN/

const envExample = readFileSync(".env.example", "utf8")
const envLines = envExample.split(/\r?\n/).filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"))
const vercelJson = JSON.parse(readFileSync("vercel.json", "utf8")) as Record<string, unknown>
// Todo el código que llega a compilarse o a ejecutarse (no las pruebas).
const SOURCE_ROOTS = ["app", "components", "lib", "services", "scripts", "next.config.ts"]
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/

function sourceFiles(path: string): string[] {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return SOURCE_FILE.test(path) ? [path] : []
  return readdirSync(path).flatMap((entry) => sourceFiles(join(path, entry)))
}

// Cada variable NEXT_PUBLIC_ que menciona el código fuente, con el archivo donde aparece.
function publicVariablesInSource(roots: readonly string[]): Array<{ file: string; name: string }> {
  return roots.flatMap(sourceFiles).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)].map((m) => ({ file, name: m[0] })),
  )
}

describe(".env.example (Fase 14, Decisión A)", () => {
  test("declara exactamente las tres variables de servidor, ninguna pública", () => {
    expect(envLines.map((line) => line.split("=")[0].trim()).sort()).toEqual([...SERVER_VARIABLES].sort())
    expect(envExample).not.toMatch(/^NEXT_PUBLIC_/m)
  })

  test("no lleva ningún valor real", () => {
    for (const line of envLines) expect(line).toMatch(/^[A-Z_]+=$/)
  })

  test("ninguna variable tiene nombre de secreto: en Vercel no vive ninguna clave secreta", () => {
    for (const name of SERVER_VARIABLES) expect(name).not.toMatch(FORBIDDEN_NAME_FRAGMENT)
  })
})

describe("variables NEXT_PUBLIC_ en todo el código fuente (Fase 14, Decisiones 3 y 4)", () => {
  const found = publicVariablesInSource(SOURCE_ROOTS)

  test("el código fuente solo usa las variables públicas permitidas", () => {
    expect(found.filter(({ name }) => !ALLOWED_PUBLIC_VARIABLES.includes(name))).toEqual([])
  })

  test("ninguna variable pública del código fuente tiene nombre de secreto", () => {
    expect(found.filter(({ name }) => FORBIDDEN_NAME_FRAGMENT.test(name))).toEqual([])
  })

  test("el entorno solo se lee en el servidor: lib/server/env.ts y next.config.ts", () => {
    const readers = SOURCE_ROOTS.flatMap(sourceFiles).filter((file) => /process\.env/.test(readFileSync(file, "utf8"))).map((file) => file.replaceAll("\\", "/"))
    expect(readers.sort()).toEqual([...ENV_READERS].sort())
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
})

describe("vercel.json (Fase 14)", () => {
  test("fija la región de las funciones junto a Render (Oregon): pdx1", () => {
    expect(vercelJson.regions).toEqual(["pdx1"])
  })

  test("fija el framework y los comandos de instalación y compilación", () => {
    expect(vercelJson).toMatchObject({ framework: "nextjs", installCommand: "npm ci", buildCommand: "npm run build" })
  })

  test("no versiona variables de entorno ni duplica cabeceras de next.config.ts", () => {
    expect(vercelJson).not.toHaveProperty("env")
    expect(vercelJson).not.toHaveProperty("build")
    expect(vercelJson).not.toHaveProperty("headers")
  })
})
