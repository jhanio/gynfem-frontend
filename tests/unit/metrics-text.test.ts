import { existsSync, readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { riskLabel } from "@/lib/risk"

// Los dos módulos de texto de la pantalla de métricas (HU010). Se cargan por
// ruta en cada prueba: si el módulo no existe, falla la prueba, no el archivo.
const load = (path: string) => import(/* @vite-ignore */ path)
const TEXT = "lib/metrics-text.ts"
const LABELS = "lib/dataset-labels.ts"
const code = (file: string) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
// «F1» es el nombre de una métrica, no una cifra.
const withoutMetricNames = (text: string) => text.replaceAll("F1", "")

describe("lib/metrics-text.ts: el texto que acompaña a las cifras no contiene ninguna cifra", () => {
  test("el archivo existe y su código no tiene ningún dígito", () => {
    expect(existsSync(TEXT)).toBe(true)
    expect(withoutMetricNames(code(TEXT)).match(/\d/g) ?? []).toEqual([])
  })

  test("ningún texto exportado contiene un dígito, ni los que se componen con valores de la API", async () => {
    const text = await load("../../lib/metrics-text")
    const strings: string[] = []
    const collect = (value: unknown) => {
      if (typeof value === "string") strings.push(value)
      // Las plantillas reciben marcadores sin dígitos: lo que devuelven es solo texto propio.
      else if (typeof value === "function") collect(value(...Array.from({ length: value.length }, () => "«valor»")))
      else if (value instanceof Map) [...value.values()].forEach(collect)
      else if (value && typeof value === "object") Object.values(value).forEach(collect)
    }
    collect(text)
    expect(strings.length).toBeGreaterThan(20)
    for (const string of strings) expect(withoutMetricNames(string)).not.toMatch(/\d/)
  })

  test("cada cifra del resumen tiene título, qué significa y qué no significa", async () => {
    const { FIGURES } = await load("../../lib/metrics-text")
    expect(Object.keys(FIGURES).sort()).toEqual(["accuracy", "fScore", "high_to_low_errors", "precision_macro", "recall_macro"])
    for (const figure of Object.values(FIGURES) as Array<{ title: string; means: string; doesNotMean: string }>) {
      expect(figure.title.length).toBeGreaterThan(1)
      expect(figure.means.length).toBeGreaterThan(20)
      expect(figure.doesNotMean.length).toBeGreaterThan(20)
    }
  })
})

describe("lib/dataset-labels.ts: los niveles del dataset se nombran como en el resultado", () => {
  test("high, mid y low risk son Alto, Moderado y Bajo: los mismos nombres que riskLabel", async () => {
    expect(existsSync(LABELS)).toBe(true)
    const { datasetLabel } = await load("../../lib/dataset-labels")
    expect(datasetLabel("high risk")).toBe("Alto")
    expect(datasetLabel("mid risk")).toBe("Moderado")
    expect(datasetLabel("low risk")).toBe("Bajo")
    expect([datasetLabel("high risk"), datasetLabel("mid risk"), datasetLabel("low risk")]).toEqual([riskLabel("high"), riskLabel("mid"), riskLabel("low")])
  })

  test("«Medio» no existe como nombre de nivel", () => {
    expect(existsSync(LABELS)).toBe(true)
    expect(code(LABELS)).not.toMatch(/Medi[oa]/i)
    expect(code("lib/risk.ts")).not.toMatch(/Medi[oa]/i)
  })

  test("una etiqueta desconocida se devuelve tal cual, y no se resuelve por el prototipo", async () => {
    const { datasetLabel, datasetLevel } = await load("../../lib/dataset-labels")
    expect(datasetLabel("riesgo ficticio extremo")).toBe("riesgo ficticio extremo")
    expect(datasetLevel("riesgo ficticio extremo")).toBeNull()
    expect(datasetLabel("toString")).toBe("toString")
    expect(datasetLevel("high risk")).toBe("high")
  })
})
