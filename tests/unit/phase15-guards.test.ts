import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

// Guardas de la Fase 15 sobre TODO el código que se compila o ejecuta (no las
// pruebas). Cada una fija una decisión aprobada que un cambio futuro no puede
// romper sin que la suite falle.
const SOURCE_ROOTS = ["app", "components", "lib", "services", "scripts", "next.config.ts"]
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/

function sourceFiles(path: string): string[] {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return SOURCE_FILE.test(path) ? [path.replaceAll("\\", "/")] : []
  return readdirSync(path).flatMap((entry) => sourceFiles(join(path, entry)))
}

const files = SOURCE_ROOTS.flatMap(sourceFiles).map((file) => ({ file, source: readFileSync(file, "utf8") }))
// Sin comentarios: una regla puede nombrarse en un comentario sin incumplirse.
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
const offenders = (pattern: RegExp, allowed: (file: string) => boolean = () => false) =>
  files.filter(({ file, source }) => !allowed(file) && pattern.test(code(source))).map(({ file }) => file)

describe("el escaneo recorre el código de verdad", () => {
  test("incluye la capa de API, el BFF, los servicios y los componentes", () => {
    const names = files.map(({ file }) => file)
    expect(names).toEqual(expect.arrayContaining(["lib/api/client.ts", "lib/server/proxy.ts", "services/patients.ts", "components/assessment/AssessmentForm.tsx", "app/page.tsx"]))
    expect(names.length).toBeGreaterThan(30)
  })

  test("la limpieza de comentarios conserva el código", () => {
    expect(code('const url = "https://x.example" // nota con localStorage')).toBe('const url = "https://x.example" ')
    expect(code("/* localStorage */ fetch(x)")).toBe(" fetch(x)")
  })
})

describe("decisión 1: ningún componente hace peticiones por su cuenta", () => {
  test("fetch solo aparece en el cliente de la API, en el BFF y en el guion de verificación", () => {
    const allowed = (file: string) => file === "lib/api/client.ts" || file.startsWith("lib/server/") || file === "scripts/verify-deployment.ts"
    expect(offenders(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource/, allowed)).toEqual([])
  })

  test("los componentes y la página no importan el cliente de bajo nivel salvo para la sesión y el despertar", () => {
    const importers = files.filter(({ file, source }) => (file.startsWith("components/") || file.startsWith("app/")) && /from "@\/lib\/api\/client"/.test(source))
    for (const { source } of importers) {
      expect(source).not.toMatch(/\b(apiRead|apiWrite|sessionRequest)\b/)
    }
  })

  test("el navegador nunca importa código del servidor (lib/server)", () => {
    const browser = (file: string) => file.startsWith("components/") || file.startsWith("services/") || file.startsWith("lib/api/") || file === "app/page.tsx"
    expect(files.filter(({ file, source }) => browser(file) && /lib\/server/.test(code(source))).map(({ file }) => file)).toEqual([])
  })
})

describe("decisión 10 y sesión: nada en almacenamiento local ni en la consola", () => {
  test("ningún archivo usa localStorage, sessionStorage, indexedDB ni document.cookie", () => {
    expect(offenders(/localStorage|sessionStorage|indexedDB|document\.cookie/)).toEqual([])
  })

  test("ningún archivo escribe en la consola", () => {
    expect(offenders(/\bconsole\.\w+/)).toEqual([])
  })

  test("ningún archivo inyecta HTML", () => {
    expect(offenders(/dangerouslySetInnerHTML|innerHTML/)).toEqual([])
  })

  test("no queda rastro del modo simulado", () => {
    expect(offenders(/resolveSimulatedRole|DATOS SIMULADOS|simulatedUsers|simulatedFields/, (file) => file === "lib/deployment-checks.ts")).toEqual([])
  })

  test("no hay ningún cliente de Supabase en el navegador ni dependencia que guarde la sesión", () => {
    const dependencies = Object.keys((JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string> }).dependencies)
    expect(dependencies.filter((name) => name.startsWith("@supabase/"))).toEqual([])
  })
})

describe("decisión 2: ningún rango, límite ni umbral clínico codificado", () => {
  const FIELD_NAME = /\b(age_years|temperature_c|heart_rate_bpm|systolic_bp_mmhg|diastolic_bp_mmhg|bmi_kg_m2|hba1c_percent|fasting_glucose_mg_dl)\b/
  const FIELD_FILES = ["lib/clinical-validation.ts", "lib/field-labels.ts"]

  test("los nombres de los campos clínicos solo aparecen en la validación y en las etiquetas", () => {
    expect(offenders(FIELD_NAME, (file) => FIELD_FILES.includes(file))).toEqual([])
  })

  test("esos dos archivos no contienen ningún número: los límites solo pueden venir del esquema", () => {
    for (const file of FIELD_FILES) {
      const withoutNames = code(readFileSync(file, "utf8")).replace(new RegExp(FIELD_NAME, "g"), "")
      expect(withoutNames.match(/\d+(\.\d+)?/g) ?? []).toEqual([])
    }
  })

  test("el formulario de evaluación no compara contra números propios", () => {
    // Las únicas comparaciones con un número son de longitud de listas (`.length > 0`).
    const form = code(readFileSync("components/assessment/AssessmentForm.tsx", "utf8")).replace(/\.length\s*[<>]\s*\d/g, "")
    expect(form).not.toMatch(/[<>]=?\s*\d/)
    expect(form).toMatch(/getPredictionSchema/)
  })
})
