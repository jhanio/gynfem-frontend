// @vitest-environment node
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { ALLOWED_ROUTES, EXCLUDED_FROM_PROXY } from "@/lib/server/allowed-routes"

// Copia versionada de la matriz rol × endpoint de gynfem-backend/docs/API_SPEC.md
// §3.6 (entre los marcadores matriz-rbac), tomada del commit e6825eb del backend.
// Al cambiar la matriz en el backend: volver a copiarla aquí y ajustar el BFF.
const SNAPSHOT = "tests/contract/rbac-matrix.snapshot.md"
const BACKEND_SPEC = "../gynfem-backend/docs/API_SPEC.md"
const API_PREFIX = "/api/v1"

type Row = { key: string; anonymous: string; medico: string; administrador: string }

function parseMatrix(markdown: string): Row[] {
  return markdown.split(/\r?\n/)
    .filter((line) => /^\| `(GET|POST|PATCH|DELETE)` \|/.test(line))
    .map((line) => {
      const [method, route, anonymous, medico, administrador] = line.split("|").slice(1).map((cell) => cell.trim().replaceAll("`", ""))
      return { key: `${method} ${route.replace(API_PREFIX, "")}`, anonymous, medico, administrador }
    })
}

const matrix = parseMatrix(readFileSync(SNAPSHOT, "utf8"))

describe("el BFF reenvía exactamente la matriz del contrato", () => {
  test("la copia de la matriz se lee de verdad (28 rutas)", () => {
    expect(matrix).toHaveLength(28)
    expect(matrix.map((r) => r.key)).toContain("POST /patients/search")
    expect(matrix.map((r) => r.key)).toContain("POST /predictions/{prediction_id}/report")
  })

  test("rutas permitidas + rutas excluidas con motivo = todas las rutas de la matriz, sin sobrantes", () => {
    const covered = [...ALLOWED_ROUTES.map((r) => `${r.method} ${r.template}`), ...EXCLUDED_FROM_PROXY.keys()].sort()
    expect(covered).toEqual(matrix.map((r) => r.key).sort())
  })

  test("ninguna ruta pública pasa por el proxy autenticado, y toda exclusión declara su motivo", () => {
    const publicRoutes = matrix.filter((r) => r.anonymous === "✔").map((r) => r.key)
    for (const key of publicRoutes) expect(EXCLUDED_FROM_PROXY.has(key)).toBe(true)
    for (const reason of EXCLUDED_FROM_PROXY.values()) expect(reason.trim().length).toBeGreaterThan(10)
  })

  test("toda ruta reenviada exige sesión según la matriz (401 para anónimo)", () => {
    const byKey = new Map(matrix.map((r) => [r.key, r]))
    for (const route of ALLOWED_ROUTES) expect(byKey.get(`${route.method} ${route.template}`)?.anonymous).toBe("401")
  })

  test("GET nunca se marca como escritura; PATCH y DELETE siempre", () => {
    for (const route of ALLOWED_ROUTES) {
      if (route.method === "GET") expect(route.write).toBe(false)
      if (route.method === "PATCH" || route.method === "DELETE") expect(route.write).toBe(true)
    }
  })

  // El reporte no crea nada clínico, pero cada generación escribe su registro de
  // auditoría: es una escritura (30 s de espera y nunca se reintenta).
  test("los únicos POST que no escriben son la búsqueda y /predict", () => {
    const readOnlyPosts = ALLOWED_ROUTES.filter((r) => r.method === "POST" && !r.write).map((r) => r.template).sort()
    expect(readOnlyPosts).toEqual(["/patients/search", "/predict"])
  })
})

// Con el repositorio del backend al lado (desarrollo local) se comprueba que la
// copia sigue al día. En CI no está: la prueba se omite a la vista, no pasa en falso.
describe.skipIf(!existsSync(BACKEND_SPEC))("la copia coincide con gynfem-backend (solo en local)", () => {
  test("la matriz de API_SPEC.md es la misma que la copia versionada", () => {
    expect(parseMatrix(readFileSync(BACKEND_SPEC, "utf8"))).toEqual(matrix)
  })
})
