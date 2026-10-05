import { datasetLabel, datasetLevel } from "@/lib/dataset-labels"
import { MATRIX } from "@/lib/metrics-text"

type Props = { labels: string[]; matrix: number[][] }

type Outcome = "match" | "error" | "severe"

// Alto clasificado como bajo es el único error que la API señala como
// clínicamente grave. Con una etiqueta que no se reconoce, nunca se gradúa.
function outcomeOf(real: string, assigned: string): Outcome {
  if (real === assigned) return "match"
  return datasetLevel(real) === "high" && datasetLevel(assigned) === "low" ? "severe" : "error"
}

const CELL_STYLE: Record<Outcome, string> = {
  match: "bg-[#eef7f6]",
  error: "bg-white",
  severe: "bg-[#fff4e5] outline outline-2 -outline-offset-2 outline-[#8a4b08]",
}

const spoken = (label: string) => (datasetLevel(label) === null ? MATRIX.unknownLevel(label) : MATRIX.knownLevel(datasetLabel(label)))

// Matriz de confusión: filas, el nivel que figuraba en los datos; columnas, el
// que asignó el modelo. El orden es el de `labels`, que no es el de severidad.
// Cada celda dice con texto si es un acierto o un error: el color solo acompaña.
export function ConfusionMatrix({ labels, matrix }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="mb-2 text-left text-sm text-[#60727d]">{MATRIX.caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="border border-[#d9e1e5] p-2 text-left">{MATRIX.corner}</th>
            {labels.map((label) => <th key={label} scope="col" className="border border-[#d9e1e5] p-2">{MATRIX.assigned(datasetLabel(label))}</th>)}
          </tr>
        </thead>
        <tbody>
          {labels.map((real, row) => (
            <tr key={real}>
              <th scope="row" className="border border-[#d9e1e5] p-2 text-left">{datasetLabel(real)}</th>
              {labels.map((assigned, column) => {
                const count = matrix[row]?.[column] ?? 0
                const outcome = outcomeOf(real, assigned)
                return (
                  <td key={assigned} className={`border border-[#d9e1e5] p-2 text-center ${CELL_STYLE[outcome]}`} aria-label={MATRIX.cell(String(count), count === 1, spoken(real), spoken(assigned), MATRIX[outcome])}>
                    <span className="block text-lg font-bold">{count}</span><span className="block text-xs">{MATRIX[outcome]}</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
