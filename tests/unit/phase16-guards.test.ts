import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

// Guardas de la Fase 16, sobre el código que se compila (no las pruebas). Como
// las de la Fase 15, cada una fija una decisión aprobada.
const SOURCE_FILE = /\.(ts|tsx)$/

function sourceFiles(path: string): string[] {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return SOURCE_FILE.test(path) ? [path.replaceAll("\\", "/")] : []
  return readdirSync(path).flatMap((entry) => sourceFiles(join(path, entry)))
}

// Sin comentarios: una regla puede nombrarse en un comentario sin incumplirse.
const code = (file: string) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
const browserFiles = ["app", "components"].flatMap(sourceFiles)

describe("decisión 5: el reporte solo se genera por una acción explícita", () => {
  const callers = browserFiles.filter((file) => /\bgenerateReport\b/.test(code(file)))

  test("un único archivo de la interfaz llama a generateReport", () => {
    expect(callers).toEqual(["components/report/GenerateReportButton.tsx"])
  })

  test("ese archivo no tiene efectos ni cargas automáticas: la llamada solo puede salir de un clic", () => {
    for (const file of callers) expect(code(file)).not.toMatch(/\b(useEffect|useLayoutEffect|useEffectEvent|useLoad|useInsertionEffect)\b/)
    expect(callers.length).toBeGreaterThan(0)
  })

  test("generateReport es una escritura: usa apiWrite y nunca la vía de lecturas, que reintenta", () => {
    const service = code("services/reports.ts")
    expect(service).toMatch(/\bapiWrite\b/)
    expect(service).not.toMatch(/\bapiRead\b|\bretryRead\b/)
  })

  test("el servicio del reporte no guarda nada entre llamadas", () => {
    expect(code("services/reports.ts")).not.toMatch(/\blet\b|\bvar\b|\bMap\b|\bSet\b|cache/i)
  })

  test("no hay ninguna librería que guarde respuestas en caché o las persista", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    expect(names.filter((name) => /^(@tanstack\/(react-)?query.*|swr|react-query|@apollo\/client|redux-persist|localforage|idb(-keyval)?)$/.test(name))).toEqual([])
  })
})

describe("decisión 4: las limitaciones de las métricas no se pueden ocultar", () => {
  const LIMITATIONS = "components/metrics/Limitations.tsx"
  const metricsFiles = [...sourceFiles("components/metrics"), "lib/metrics-text.ts"]

  test("el bloque de limitaciones no tiene estado, ni botones, ni nada que lo esconda", () => {
    expect(existsSync(LIMITATIONS)).toBe(true)
    expect(code(LIMITATIONS)).not.toMatch(/\b(useState|useReducer|onClick|hidden|aria-hidden)\b/)
  })

  test("la pantalla de métricas no contiene ninguna cifra propia: todas llegan de la API", () => {
    expect(metricsFiles.filter(existsSync).length).toBeGreaterThan(3)
    for (const file of metricsFiles.filter(existsSync)) expect(code(file)).not.toMatch(/\b0\.\d{2,}|\b\d{2,}(,|\.)\d\s?%/)
  })

  test("un único componente pinta cifras y limitaciones: nadie más usa el servicio de métricas", () => {
    expect(browserFiles.filter((file) => /\bgetModelMetrics\b/.test(code(file)))).toEqual(["components/metrics/ModelMetrics.tsx"])
  })
})
