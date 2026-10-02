import { cleanup, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, test } from "vitest"
import type { ModelMetrics, Session } from "@/lib/api/types"
import { fieldLabel } from "@/lib/field-labels"
import * as format from "@/lib/format"
import { mockBff } from "../msw/bff"
import { ADMIN, DISCLAIMER, MEDICA, MODEL_METRICS, MODEL_METRICS_ALT, uniformError } from "../msw/fixtures"
import { server } from "../msw/server"
import { renderApp } from "./helpers"

// Métricas del modelo (HU010; gynfem-backend/docs/API_SPEC.md §3.7.3). Las
// cifras se muestran SIEMPRE junto a sus limitaciones, con la misma prominencia.
const NAV = "Métricas del modelo"
const LIMITATIONS = "Lo que estas cifras no dicen"
const FIGURES = "Lo que se midió"
const DETAIL = MODEL_METRICS.detail!
// Los niveles del dato de prueba, como deben verse. «mid risk» es «Moderado», como en el resultado.
const LEVEL = new Map([["high risk", "Alto"], ["mid risk", "Moderado"], ["low risk", "Bajo"]])
const FIGURE_TITLES = ["Exactitud", "Riesgo alto clasificado como bajo", "Precisión (valor predictivo positivo), promedio entre niveles", "Sensibilidad, promedio entre niveles", "F1, promedio entre niveles"]

const limitations = () => screen.getByRole("region", { name: LIMITATIONS })
const figures = () => screen.getByRole("region", { name: FIGURES })
const figure = (title: string) => within(figures()).getByRole("group", { name: title })
const matrix = () => within(figures()).getByRole("table", { name: /Cada fila es el nivel que figuraba en los datos/ })
const perLevel = () => within(figures()).getByRole("table", { name: "Por nivel de riesgo" })

async function openMetrics(metrics: ModelMetrics = MODEL_METRICS, account: Session = MEDICA) {
  const bff = mockBff({ signedIn: account, metrics })
  const user = await renderApp()
  await user.click(await screen.findByRole("button", { name: NAV }))
  await screen.findByRole("heading", { level: 1, name: NAV })
  return { bff, user }
}

const without = (...codes: string[]): ModelMetrics => ({ ...MODEL_METRICS, limitations: MODEL_METRICS.limitations.filter((l) => !codes.includes(l.code)) })

describe("métricas: las cifras van siempre con sus limitaciones", () => {
  test("cifras y limitaciones están en la misma pantalla, con encabezados del mismo nivel, y las limitaciones van primero", async () => {
    await openMetrics()
    const first = within(limitations()).getByRole("heading", { name: LIMITATIONS })
    const second = within(figures()).getByRole("heading", { name: FIGURES })
    expect(first.tagName).toBe(second.tagName)
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(limitations().parentElement).toBe(figures().parentElement)
    expect(limitations().className).toBe(figures().className)
  })

  test("la introducción dice de dónde salen las cifras y qué no miden", async () => {
    await openMetrics()
    expect(screen.getByText("Estas cifras describen cómo se comportó el modelo en una prueba con datos de otra población. No miden qué tan bien funcionará con las pacientes de GynFem. Léelas junto con las limitaciones.")).toBeVisible()
  })

  test("las limitaciones no se pueden ocultar ni colapsar: su contenedor y su envoltorio no recortan ni esconden nada", async () => {
    await openMetrics()
    const container = limitations()
    for (const element of [container, container.parentElement!]) {
      expect(element.tagName).not.toBe("DETAILS")
      expect(element).not.toHaveAttribute("hidden")
      expect(element).not.toHaveAttribute("aria-hidden", "true")
      expect(element.className).not.toMatch(/(^|\s|:)(hidden|max-h-|overflow-|line-clamp|truncate|sr-only|collapse|invisible)/)
    }
    expect(within(container).queryByRole("button")).not.toBeInTheDocument()
    expect(within(container).queryByRole("tab")).not.toBeInTheDocument()
  })

  test.each([
    ["las nueve", MODEL_METRICS],
    ["siete", without("accuracy_meaning", "high_risk_errors")],
  ])("pinta las limitaciones que llegan (%s), en su orden, con título y mensaje literales y visibles", async (_name, metrics) => {
    await openMetrics(metrics)
    const items = within(limitations()).getAllByRole("listitem").filter((item) => item.closest("details") === null)
    expect(items).toHaveLength(metrics.limitations.length)
    items.forEach((item, i) => {
      const { title, message } = metrics.limitations[i]
      expect(within(item).getByRole("heading", { name: title })).toBeVisible()
      expect(within(item).getByText(message)).toBeVisible()
    })
  })

  test("el título y el mensaje quedan fuera del desplegable «Fuente»; la fuente va dentro", async () => {
    await openMetrics()
    const items = within(limitations()).getAllByRole("listitem").filter((item) => item.closest("details") === null)
    items.forEach((item, i) => {
      const { title, message, sources } = MODEL_METRICS.limitations[i]
      const disclosure = item.querySelector("details")!
      expect(disclosure.querySelector("summary")).toHaveTextContent(/^Fuente$/)
      expect(disclosure).not.toHaveAttribute("open")
      for (const source of sources) expect(disclosure).toHaveTextContent(source)
      expect(within(item).getByRole("heading", { name: title }).closest("details")).toBeNull()
      expect(within(item).getByText(message).closest("details")).toBeNull()
    })
  })

  test("la advertencia clínica es la última limitación y lleva el texto de la API", async () => {
    await openMetrics()
    const items = within(limitations()).getAllByRole("listitem").filter((item) => item.closest("details") === null)
    expect(items.at(-1)).toHaveTextContent(DISCLAIMER)
  })

  test.each([
    ["sin la advertencia clínica", without("clinical_disclaimer")],
    ["sin ninguna limitación", { ...MODEL_METRICS, limitations: [] }],
  ])("%s no se muestra ninguna cifra", async (_name, metrics) => {
    await openMetrics(metrics)
    expect(await screen.findByRole("alert")).toHaveTextContent("Las métricas llegaron sin sus limitaciones y no se muestran.")
    expect(screen.queryByRole("region", { name: FIGURES })).not.toBeInTheDocument()
    expect(screen.queryByText(format.formatPercent(MODEL_METRICS.metrics.accuracy!))).not.toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})

describe("métricas: cada cifra con lo que significa y lo que no", () => {
  test("las cinco cifras muestran el valor de la API y sus dos explicaciones", async () => {
    await openMetrics()
    const { accuracy, precision_macro, recall_macro, f1_macro, high_to_low_errors } = MODEL_METRICS.metrics
    const values = [format.formatPercent(accuracy!), `${high_to_low_errors} casos`, format.formatPercent(precision_macro!), format.formatPercent(recall_macro!), format.formatPercent(f1_macro!)]
    FIGURE_TITLES.forEach((title, i) => {
      const block = figure(title)
      expect(block).toHaveTextContent(values[i])
      expect(within(block).getByText("Qué significa:")).toBeVisible()
      expect(within(block).getByText("Qué no significa:")).toBeVisible()
    })
    expect(figure("Exactitud")).toHaveTextContent("No es la probabilidad de que el resultado de una paciente concreta sea correcto, y no distingue un error leve de uno grave.")
  })

  test("una cifra que no llega no se pinta: ni cero, ni guion, ni su rótulo", async () => {
    const metrics = Object.fromEntries(Object.entries(MODEL_METRICS.metrics).filter(([name]) => name !== "f1_macro"))
    await openMetrics({ ...MODEL_METRICS, metrics })
    expect(within(figures()).queryByRole("group", { name: "F1, promedio entre niveles" })).not.toBeInTheDocument()
    expect(within(figures()).getAllByRole("group")).toHaveLength(FIGURE_TITLES.length - 1)
    expect(figure("Exactitud")).toBeVisible()
  })

  test("el recuento de riesgo alto clasificado como bajo no lleva ningún estilo de éxito, aunque sea cero", async () => {
    await openMetrics({ ...MODEL_METRICS, metrics: { ...MODEL_METRICS.metrics, high_to_low_errors: 0 } })
    const block = figure("Riesgo alto clasificado como bajo")
    expect(block).toHaveTextContent("0 casos")
    expect(block.querySelector("svg")).toBeNull()
    const classes = [block, ...block.querySelectorAll("*")].map((element) => element.getAttribute("class") ?? "").join(" ")
    expect(classes).not.toMatch(/green|emerald|lime|teal|success|check|0f5962|e9f1f1|eef7f6/i)
    // El mismo aspecto que con errores: el cero no se celebra.
    expect(classes).toBe([figure("Exactitud"), ...figure("Exactitud").querySelectorAll("*")].map((element) => element.getAttribute("class") ?? "").join(" "))
    expect(block).toHaveTextContent("No indica con qué frecuencia ocurrirá con pacientes reales, ni garantiza que no ocurra.")
  })

  test("con otras cifras en la respuesta cambian todos los valores: nada está codificado", async () => {
    await openMetrics(MODEL_METRICS_ALT)
    for (const name of ["accuracy", "precision_macro", "recall_macro", "f1_macro"] as const) {
      expect(figures()).toHaveTextContent(format.formatPercent(MODEL_METRICS_ALT.metrics[name]!))
      expect(figures()).not.toHaveTextContent(format.formatPercent(MODEL_METRICS.metrics[name]!))
    }
    expect(figure("Riesgo alto clasificado como bajo")).toHaveTextContent(`${MODEL_METRICS_ALT.metrics.high_to_low_errors} casos`)
    expect(figures()).toHaveTextContent(`Modelo ${MODEL_METRICS_ALT.model.model_version}`)
  })

  test("«Cómo se evaluó» usa los recuentos de la respuesta", async () => {
    await openMetrics()
    const { dataset_rows, training_rows, test_size } = MODEL_METRICS.evaluation
    const block = within(figures()).getByRole("heading", { name: "Cómo se evaluó" }).parentElement!
    expect(block).toHaveTextContent(`El conjunto de datos tiene ${dataset_rows} casos. ${training_rows} se usaron para entrenar el modelo y el resto (${format.formatPercent(test_size!)}) se apartó para probarlo. Se probó con ${DETAIL.test_rows} casos.`)
    expect(block).toHaveTextContent("La separación mantuvo la proporción de cada nivel de riesgo.")
    expect(block).toHaveTextContent("Las cifras se calcularon con casos apartados, que el modelo no vio durante el entrenamiento.")
  })

  test("sin estratificación su frase no sale, y un origen desconocido se muestra con su código", async () => {
    await openMetrics({ ...MODEL_METRICS, evaluation: { ...MODEL_METRICS.evaluation, stratified: false, source: "origen_ficticio" } })
    const block = within(figures()).getByRole("heading", { name: "Cómo se evaluó" }).parentElement!
    expect(block).not.toHaveTextContent("La separación mantuvo")
    expect(block).toHaveTextContent("Origen de las cifras: origen_ficticio")
    expect(block).not.toHaveTextContent("casos apartados, que el modelo no vio")
  })

  test("los rangos de entrenamiento muestran las ocho variables con su unidad clínica y coma decimal", async () => {
    await openMetrics()
    const table = within(figures()).getByRole("table", { name: "Rangos con los que se entrenó" })
    expect(MODEL_METRICS.training_ranges).toHaveLength(8)
    for (const range of MODEL_METRICS.training_ranges) {
      const row = within(table).getByRole("rowheader", { name: fieldLabel(range.clinical_field) }).closest("tr")!
      expect(row).toHaveTextContent(`${format.formatDecimal(range.clinical_min)} ${range.clinical_unit}`)
      expect(row).toHaveTextContent(`${format.formatDecimal(range.clinical_max)} ${range.clinical_unit}`)
    }
    expect(table.textContent).not.toMatch(/\d\.\d/)
    expect(figures()).toHaveTextContent("El modelo solo vio valores dentro de estos rangos. Fuera de ellos no tiene datos: cada evaluación lo avisa junto a su resultado.")
  })

  test("la estimación del procedimiento va rotulada como algo que no es una métrica del modelo, con el texto de la API", async () => {
    await openMetrics()
    const block = within(figures()).getByRole("heading", { name: "Estimación del procedimiento" }).parentElement!
    expect(block).toHaveTextContent("No es una métrica del modelo entregado.")
    expect(block).toHaveTextContent(DETAIL.procedure_estimate!.label)
    expect(block).toHaveTextContent(DETAIL.procedure_estimate!.description)
  })
})

describe("métricas: detalle por nivel", () => {
  test.each([
    ["training_metrics_missing", "El detalle por nivel no está disponible: falta el archivo con los resultados del entrenamiento."],
    ["training_metrics_invalid", "El detalle por nivel no está disponible: el archivo con los resultados del entrenamiento no se pudo leer."],
    ["training_metrics_mismatch", "El detalle por nivel no está disponible: el archivo con los resultados no corresponde al modelo en uso y por eso no se muestra."],
    ["motivo_ficticio", "El detalle por nivel no está disponible (motivo_ficticio)."],
  ])("sin detalle (%s) se dice el motivo, no hay tabla por nivel ni matriz, y el resumen y las limitaciones siguen", async (reason, text) => {
    await openMetrics({ ...MODEL_METRICS, detail: null, detail_unavailable_reason: reason })
    expect(within(figures()).getByText(text)).toBeVisible()
    expect(within(figures()).queryByRole("table", { name: "Por nivel de riesgo" })).not.toBeInTheDocument()
    expect(within(figures()).queryByRole("table", { name: /Cada fila es el nivel/ })).not.toBeInTheDocument()
    expect(within(figures()).queryByRole("heading", { name: "Estimación del procedimiento" })).not.toBeInTheDocument()
    expect(figure("Exactitud")).toHaveTextContent(format.formatPercent(MODEL_METRICS.metrics.accuracy!))
    expect(within(figures()).getByRole("table", { name: "Rangos con los que se entrenó" })).toBeVisible()
    expect(within(limitations()).getAllByRole("heading", { level: 3 })).toHaveLength(MODEL_METRICS.limitations.length)
  })

  test.each([
    ["el dato de prueba", MODEL_METRICS],
    ["la variante con las etiquetas permutadas", MODEL_METRICS_ALT],
  ])("la matriz y la tabla por nivel siguen el orden de detail.labels (%s)", async (_name, metrics) => {
    await openMetrics(metrics)
    const labels = metrics.detail!.labels.map((label) => LEVEL.get(label)!)
    expect(within(matrix()).getAllByRole("columnheader").slice(1).map((cell) => cell.textContent)).toEqual(labels.map((label) => `Asignó ${label}`))
    expect(within(matrix()).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(labels)
    expect(within(perLevel()).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(labels)
  })

  test("la tabla por nivel muestra precisión, sensibilidad, F1 y casos de cada nivel", async () => {
    await openMetrics()
    for (const [label, values] of Object.entries(DETAIL.per_class)) {
      const row = within(perLevel()).getByRole("rowheader", { name: LEVEL.get(label)! }).closest("tr")!
      expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([format.formatPercent(values.precision), format.formatPercent(values.recall), format.formatPercent(values.f1), String(values.support)])
    }
    expect(figures()).toHaveTextContent("Precisión (valor predictivo positivo): de los casos a los que el modelo asignó este nivel, cuántos lo tenían en los datos.")
  })

  test("la matriz distingue aciertos y errores con texto, no solo con color: «Coincide», «Error» y «Error más grave» solo en alto→bajo", async () => {
    await openMetrics()
    const body = within(matrix()).getAllByRole("row").slice(1)
    DETAIL.labels.forEach((real, r) => {
      const cells = within(body[r]).getAllByRole("cell")
      DETAIL.labels.forEach((assigned, c) => {
        const word = real === assigned ? "Coincide" : real === "high risk" && assigned === "low risk" ? "Error más grave" : "Error"
        expect(cells[c].textContent).toBe(`${DETAIL.confusion_matrix[r][c]}${word}`)
      })
    })
    expect(within(matrix()).getAllByText("Error más grave")).toHaveLength(1)
  })

  test("alto→bajo con cero casos sigue siendo Error más grave, sin estilo, icono ni semántica de éxito", async () => {
    const high = DETAIL.labels.indexOf("high risk")
    const low = DETAIL.labels.indexOf("low risk")
    const confusion_matrix = DETAIL.confusion_matrix.map((row, r) => row.map((count, c) => r === high && c === low ? 0 : count))
    await openMetrics({
      ...MODEL_METRICS,
      metrics: { ...MODEL_METRICS.metrics, high_to_low_errors: 0 },
      detail: { ...DETAIL, confusion_matrix },
    })
    const cell = within(matrix()).getByRole("cell", { name: "0 casos de riesgo Alto clasificados como riesgo Bajo: error más grave." })
    expect(cell).toHaveTextContent(/^0Error más grave$/)
    expect(cell.querySelector("svg")).toBeNull()
    const classes = [cell, ...cell.querySelectorAll("*")].map((element) => element.getAttribute("class") ?? "").join(" ")
    expect(classes).not.toMatch(/green|emerald|lime|teal|success|check|0f5962|e9f1f1|eef7f6/i)
    expect(cell.innerHTML).not.toMatch(/Coincide|éxito|acierto|success|check|✓|✔/i)
    // El recuento no cambia la presentación de un error alto→bajo.
    const zeroClass = cell.className
    cleanup()
    await openMetrics()
    expect(within(matrix()).getByRole("cell", { name: "2 casos de riesgo Alto clasificados como riesgo Bajo: error más grave." }).className).toBe(zeroClass)
  })

  test("cada celda tiene un nombre accesible completo, en singular cuando es un solo caso", async () => {
    await openMetrics()
    expect(within(matrix()).getByRole("cell", { name: "41 casos de riesgo Alto clasificados como riesgo Alto: coincide." })).toBeInTheDocument()
    expect(within(matrix()).getByRole("cell", { name: "2 casos de riesgo Alto clasificados como riesgo Bajo: error más grave." })).toBeInTheDocument()
    expect(within(matrix()).getByRole("cell", { name: "1 caso de riesgo Bajo clasificado como riesgo Alto: error." })).toBeInTheDocument()
    expect(within(matrix()).getByRole("cell", { name: "7 casos de riesgo Alto clasificados como riesgo Moderado: error." })).toBeInTheDocument()
    expect(figures()).toHaveTextContent("Son recuentos de la prueba, no pacientes de este consultorio.")
  })

  test("«mid risk» es «Moderado», como en el resultado: «Medio» no aparece en ningún lugar de la pantalla", async () => {
    await openMetrics()
    expect(within(perLevel()).getByRole("rowheader", { name: "Moderado" })).toBeVisible()
    expect(within(matrix()).getByRole("columnheader", { name: "Asignó Moderado" })).toBeVisible()
    expect(document.body.textContent).not.toMatch(/\bMedi[oa]s?\b/i)
    expect(document.body.innerHTML).not.toMatch(/\bMedi[oa]s?\b/i)
    expect(document.body.textContent).not.toMatch(/mid risk|high risk|low risk/)
  })

  test("una etiqueta desconocida se muestra tal cual y la matriz sigue siendo legible", async () => {
    const UNKNOWN = "riesgo ficticio extremo"
    const labels = ["high risk", UNKNOWN, "low risk"]
    await openMetrics({ ...MODEL_METRICS, detail: { ...DETAIL, labels, per_class: { ...DETAIL.per_class, [UNKNOWN]: DETAIL.per_class["mid risk"] } } })
    expect(within(matrix()).getByRole("columnheader", { name: `Asignó ${UNKNOWN}` })).toBeVisible()
    expect(within(matrix()).getByRole("rowheader", { name: UNKNOWN })).toBeVisible()
    expect(within(perLevel()).getByRole("rowheader", { name: UNKNOWN })).toBeVisible()
    const cells = within(matrix()).getAllByRole("cell")
    expect(cells).toHaveLength(9)
    for (const cell of cells) expect(cell.textContent).toMatch(/^\d+(Coincide|Error|Error más grave)$/)
    expect(within(matrix()).getByRole("cell", { name: `2 casos de riesgo Alto clasificados como «${UNKNOWN}»: error.` })).toBeInTheDocument()
    // Alto→bajo sigue marcado; nada de la fila o columna desconocida es «más grave».
    const severe = within(matrix()).getAllByText("Error más grave")
    expect(severe).toHaveLength(1)
    expect(severe[0].closest("td")).toHaveAccessibleName("7 casos de riesgo Alto clasificados como riesgo Bajo: error más grave.")
  })
})

describe("métricas: acceso y estados", () => {
  test("médica y administradora ven la misma pantalla, con las mismas limitaciones", async () => {
    await openMetrics(MODEL_METRICS, MEDICA)
    const asMedica = { limitations: limitations().textContent, figures: figures().textContent }
    cleanup()
    await openMetrics(MODEL_METRICS, ADMIN)
    expect(limitations().textContent).toBe(asMedica.limitations)
    expect(figures().textContent).toBe(asMedica.figures)
    expect(asMedica.limitations).toContain(DISCLAIMER)
  })

  test("la administradora llega desde su navegación y sigue sin ver nada clínico", async () => {
    const { bff } = await openMetrics(MODEL_METRICS, ADMIN)
    expect(screen.getByRole("button", { name: "Usuarios" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Pacientes" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Evaluación rápida" })).not.toBeInTheDocument()
    expect(bff.calls.filter((call) => /patients|predict|measurements|evaluations/.test(call))).toEqual([])
  })

  test("pide las métricas una sola vez y sin parámetros", async () => {
    let search: string | null = null
    const bff = mockBff({ signedIn: MEDICA })
    server.use(http.get("*/api/v1/model/metrics", ({ request }) => { bff.calls.push("GET metrics"); search = new URL(request.url).search; return HttpResponse.json(MODEL_METRICS) }))
    const user = await renderApp()
    await user.click(await screen.findByRole("button", { name: NAV }))
    await screen.findByRole("region", { name: FIGURES })
    expect(bff.calls.filter((call) => call === "GET metrics")).toHaveLength(1)
    expect(search).toBe("")
  })

  test("si la lectura falla, muestra el error con su referencia y «Reintentar» la repite", async () => {
    mockBff({ signedIn: MEDICA })
    server.use(http.get("*/api/v1/model/metrics", () => HttpResponse.json(uniformError("internal_error", "Error interno."), { status: 500 }), { once: true }))
    const user = await renderApp()
    await user.click(await screen.findByRole("button", { name: NAV }))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Código de referencia: ref-ficticia-1")
    expect(screen.queryByRole("region", { name: FIGURES })).not.toBeInTheDocument()
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }))
    await waitFor(() => expect(figures()).toBeVisible())
    expect(limitations()).toBeVisible()
  })
})
