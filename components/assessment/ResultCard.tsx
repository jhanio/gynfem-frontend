import { TriangleAlert } from "lucide-react"
import type { PredictionView } from "@/lib/api/types"
import { fieldLabel } from "@/lib/field-labels"
import { formatDateTime, formatProbability } from "@/lib/format"
import { riskLabel } from "@/lib/risk"
import { ErrorNotice } from "@/components/ui/Notices"

type Props = { prediction: PredictionView; children?: React.ReactNode }

// Resultado de una predicción (HU007): nivel de riesgo, probabilidades, avisos
// de extrapolación, versión del modelo, fecha y advertencia clínica. Todo el
// texto clínico (avisos y advertencia) es el de la API, sin reinterpretar.
export function ResultCard({ prediction, children }: Props) {
  // La advertencia clínica es obligatoria en todo resultado (decisión 8): si la
  // API no la enviara, el resultado no se muestra.
  if (!prediction.clinical_disclaimer?.trim()) {
    return <ErrorNotice error={{ message: "El resultado llegó sin la advertencia clínica obligatoria y no se muestra.", reference: null }} />
  }
  const { probabilities } = prediction
  return (
    <section className="card p-5">
      <div className="rounded-lg border-2 border-[#b9d2d3] bg-[#eef7f6] p-4">
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-[#0f5962]">Resultado de la evaluación</p>
        <h2 className="mt-1 text-2xl font-bold">Riesgo {riskLabel(prediction.risk_level)}</h2>
        <p className="muted">
          Bajo {formatProbability(probabilities.low)} · Moderado {formatProbability(probabilities.mid)} · Alto {formatProbability(probabilities.high)}
        </p>
      </div>
      <p className="mt-4 text-sm text-[#60727d]">{formatDateTime(prediction.predicted_at)} · Modelo {prediction.model_version}</p>
      {prediction.extrapolation_warnings.map((warning) => (
        <p key={warning.field} className="mt-3 flex gap-2 text-sm text-[#8a4b08]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{fieldLabel(warning.field)}: {warning.message}</span>
        </p>
      ))}
      {children}
      <p className="mt-5 flex items-start gap-2 rounded-md bg-[#fff4e5] p-3 text-sm font-bold text-[#8a4b08]">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />{prediction.clinical_disclaimer}
      </p>
    </section>
  )
}
