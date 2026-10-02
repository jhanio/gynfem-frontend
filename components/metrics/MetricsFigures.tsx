import type { ModelMetrics } from "@/lib/api/types"
import { datasetLabel } from "@/lib/dataset-labels"
import { fieldLabel } from "@/lib/field-labels"
import { formatDateTime, formatDecimal, formatPercent } from "@/lib/format"
import { DOES_NOT_MEAN_LABEL, EVALUATION, FIGURES, FIGURES_TITLE, type FigureText, HELD_OUT_SOURCE, MATRIX, MEANS_LABEL, MODEL, PER_LEVEL, PROCEDURE, RANGES, cases, detailUnavailable } from "@/lib/metrics-text"
import { ConfusionMatrix } from "./ConfusionMatrix"

const subtitle = "m-0 text-base font-bold"
const cell = "border border-[#d9e1e5] p-2"
const note = "m-0 mt-2 text-sm leading-relaxed text-[#49616a]"

// Una cifra con lo que significa y lo que no. Todas se pintan igual: ninguna se
// celebra ni se alarma con color, tampoco un recuento de errores igual a cero.
function Figure({ text, value }: { text: FigureText; value: string }) {
  return (
    <div role="group" aria-label={text.title} className="border-b border-[#d9e1e5] py-4">
      <h3 className={subtitle}>{text.title}</h3>
      <p className="m-0 mt-1 text-2xl font-bold">{value}</p>
      <p className={note}><strong>{MEANS_LABEL}</strong> {text.means}</p>
      <p className={note}><strong>{DOES_NOT_MEAN_LABEL}</strong> {text.doesNotMean}</p>
    </div>
  )
}

const count = (value: number) => cases(String(value), value === 1)

// Las cifras de GET /model/metrics. Una que no llega no se pinta (ni cero ni
// guion). El orden de niveles es el de `detail.labels`, nunca uno supuesto.
export function MetricsFigures({ metrics: response, className }: { metrics: ModelMetrics; className: string }) {
  const { model, evaluation, metrics, detail } = response
  const summary: Array<[FigureText, string | undefined]> = [
    [FIGURES.accuracy, metrics.accuracy === undefined ? undefined : formatPercent(metrics.accuracy)],
    [FIGURES.high_to_low_errors, metrics.high_to_low_errors === undefined ? undefined : count(metrics.high_to_low_errors)],
    [FIGURES.precision_macro, metrics.precision_macro === undefined ? undefined : formatPercent(metrics.precision_macro)],
    [FIGURES.recall_macro, metrics.recall_macro === undefined ? undefined : formatPercent(metrics.recall_macro)],
    [FIGURES.fScore, metrics.f1_macro === undefined ? undefined : formatPercent(metrics.f1_macro)],
  ]
  const modelLine = [
    MODEL.version(model.model_version), model.algorithm,
    model.variant === undefined ? undefined : MODEL.variant(model.variant),
    model.trained_at === undefined ? undefined : MODEL.trainedAt(formatDateTime(model.trained_at)),
  ].filter((part) => part !== undefined)
  const howEvaluated = [
    evaluation.dataset_rows === undefined ? undefined : EVALUATION.dataset(String(evaluation.dataset_rows)),
    evaluation.training_rows === undefined ? undefined : EVALUATION.split(String(evaluation.training_rows), evaluation.test_size === undefined ? null : formatPercent(evaluation.test_size)),
    detail ? EVALUATION.tested(String(detail.test_rows)) : undefined,
    evaluation.stratified ? EVALUATION.stratified : undefined,
    evaluation.source === undefined ? undefined : evaluation.source === HELD_OUT_SOURCE ? EVALUATION.heldOut : EVALUATION.otherSource(evaluation.source),
  ].filter((part) => part !== undefined)

  return (
    <section aria-labelledby="figures-title" className={className}>
      <h2 id="figures-title" className="m-0 text-xl font-bold">{FIGURES_TITLE}</h2>
      <p className="m-0 mt-3 text-sm text-[#49616a]">{modelLine.join(" · ")}</p>

      <div className="mt-4">
        <h3 className={subtitle}>{EVALUATION.title}</h3>
        <p className={note}>{howEvaluated.join(" ")}</p>
      </div>

      {summary.map(([text, value]) => value !== undefined && <Figure key={text.title} text={text} value={value} />)}

      {!detail && <p className="m-0 mt-4 rounded-md border border-[#d9e1e5] p-3 text-sm">{detailUnavailable(response.detail_unavailable_reason)}</p>}

      {detail && (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="mb-2 text-left text-base font-bold">{PER_LEVEL.title}</caption>
              <thead>
                <tr>
                  {Object.values(PER_LEVEL.columns).map((column) => <th key={column} scope="col" className={`${cell} text-left`}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {detail.labels.filter((label) => detail.per_class[label] !== undefined).map((label) => {
                  const level = detail.per_class[label]
                  return (
                    <tr key={label}>
                      <th scope="row" className={`${cell} text-left`}>{datasetLabel(label)}</th>
                      <td className={cell}>{formatPercent(level.precision)}</td>
                      <td className={cell}>{formatPercent(level.recall)}</td>
                      <td className={cell}>{formatPercent(level.f1)}</td>
                      <td className={cell}>{level.support}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className={note}>{PER_LEVEL.note}</p>

          <div className="mt-5">
            <h3 className={`${subtitle} mb-2`}>{MATRIX.title}</h3>
            <ConfusionMatrix labels={detail.labels} matrix={detail.confusion_matrix} />
            <p className={note}><strong>{DOES_NOT_MEAN_LABEL}</strong> {MATRIX.doesNotMean}</p>
          </div>
        </>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="mb-2 text-left text-base font-bold">{RANGES.title}</caption>
          <thead>
            <tr>
              {Object.values(RANGES.columns).map((column) => <th key={column} scope="col" className={`${cell} text-left`}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {response.training_ranges.map((range) => (
              <tr key={range.clinical_field}>
                <th scope="row" className={`${cell} text-left`}>{fieldLabel(range.clinical_field)}</th>
                <td className={cell}>{formatDecimal(range.clinical_min)} {range.clinical_unit}</td>
                <td className={cell}>{formatDecimal(range.clinical_max)} {range.clinical_unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={note}>{RANGES.note}</p>

      {detail?.procedure_estimate && (
        <div className="mt-5 rounded-md border border-dashed border-[#9eb8bc] p-3">
          <h3 className={subtitle}>{PROCEDURE.title}</h3>
          <p className="m-0 mt-1 text-sm italic">{PROCEDURE.notAMetric}</p>
          <p className="m-0 mt-2 text-sm font-bold">{detail.procedure_estimate.label}</p>
          <p className={note}>{detail.procedure_estimate.description}</p>
        </div>
      )}
    </section>
  )
}
