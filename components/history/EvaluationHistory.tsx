"use client"

import { useState } from "react"
import type { HistoryItem, Measurement, Report } from "@/lib/api/types"
import { fieldLabel } from "@/lib/field-labels"
import { formatDateTime } from "@/lib/format"
import { riskLabel } from "@/lib/risk"
import { listEvaluations } from "@/services/history"
import { ResultCard } from "@/components/assessment/ResultCard"
import { GenerateReportButton } from "@/components/report/GenerateReportButton"
import { ErrorNotice, Loading, Pager } from "@/components/ui/Notices"
import { useLoad } from "@/components/ui/use-load"

type OnReport = (report: Report, trigger: HTMLElement | null) => void

type Props = { patientId: string; onCorrect: (measurement: Measurement) => void; onReport: OnReport }

type RowProps = { item: HistoryItem; disclaimer: string; isOpen: boolean; onToggle: () => void; onCorrect: (measurement: Measurement) => void; onReport: OnReport }

// Una evaluación: su fecha, su riesgo y su estado, siempre con texto. El
// resultado completo se despliega sin pedir nada: ya vino en la página.
function EvaluationRow({ item, disclaimer, isOpen, onToggle, onCorrect, onReport }: RowProps) {
  const { measurement, prediction } = item
  const isCorrected = item.status === "corrected"
  const summaryId = `evaluation-${measurement.id}`
  const panelId = `evaluation-result-${measurement.id}`
  const values = Object.entries(measurement).filter(([, value]) => typeof value === "number")
  return (
    <li className="border-b border-[#d9e1e5] p-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={summaryId} className="m-0">
          {formatDateTime(measurement.measured_at)} · <span className="font-bold">Riesgo {riskLabel(prediction.risk_level)}</span> ·{" "}
          <span className={`rounded border px-2 py-0.5 text-xs font-bold ${isCorrected ? "border-dashed border-[#8a4b08] text-[#8a4b08]" : "border-[#9eb8bc] text-[#0f5962]"}`}>
            {isCorrected ? "Corregida" : "Vigente"}
          </span>
        </p>
        <span className="flex gap-4">
          <button type="button" className="font-bold text-[#0f5962]" aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined} aria-describedby={summaryId} onClick={onToggle}>
            {isOpen ? "Ocultar resultado" : "Ver resultado"}
          </button>
          {/* Una corregida no se vuelve a corregir (409): se corrige la que la sustituyó. */}
          {!isCorrected && <button type="button" className="font-bold text-[#0f5962]" onClick={() => onCorrect(measurement)}>Corregir</button>}
        </span>
      </div>
      {isCorrected && <p className="muted">Fue sustituida por una corrección. Se conserva porque pudo usarse para decidir.</p>}
      {isOpen && (
        <div id={panelId} className="mt-4">
          <ResultCard prediction={{ ...prediction, clinical_disclaimer: disclaimer }}>
            <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {values.map(([name, value]) => (
                <div key={name} className="flex justify-between gap-3 border-b border-[#eef2f3] py-1">
                  <dt className="text-[#60727d]">{fieldLabel(name)}</dt><dd className="m-0 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </ResultCard>
          {/* También de una corregida: el médico pudo decidir con ella. */}
          <GenerateReportButton predictionId={prediction.id} onReport={onReport} />
        </div>
      )}
    </li>
  )
}

// Historial de evaluaciones de la paciente (HU008): solo lo almacenado, en el
// orden que da la API y con las corregidas marcadas. No compara evaluaciones
// entre sí: el backend no respalda ninguna lectura de evolución.
export function EvaluationHistory({ patientId, onCorrect, onReport }: Props) {
  const [offset, setOffset] = useState(0)
  // El tamaño de página lo decide la API (parámetro del sistema). Al paginar se
  // repite el que aplicó, para que un cambio de configuración no desalinee los offsets.
  const [limit, setLimit] = useState<number | undefined>(undefined)
  const [openId, setOpenId] = useState<string | null>(null)
  const page = useLoad(() => listEvaluations(patientId, offset, limit), `evaluations:${patientId}:${offset}:${limit ?? "default"}`)
  const data = page.data

  function changePage(nextOffset: number) {
    if (!data) return
    setOpenId(null)
    setLimit(data.limit)
    setOffset(nextOffset)
  }

  return (
    <section className="mt-7" aria-labelledby="history-title">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="history-title" className="text-xl font-bold">Historial de evaluaciones</h2>
          <p className="muted">
            De la más reciente a la más antigua. Las evaluaciones no se editan: para cambiar una, corrígela; la original se conserva, marcada como corregida.
          </p>
        </div>
        {data && (offset > 0 || data.has_more) && (
          <Pager offset={offset} hasMore={data.has_more} pageSize={data.limit} isBusy={page.isLoading} onChange={changePage} />
        )}
      </div>
      <div className="mt-4">
        {page.error && <ErrorNotice error={page.error}><button type="button" className="btn-secondary" onClick={page.reload}>Reintentar</button></ErrorNotice>}
        {!page.error && !data && <Loading>Cargando evaluaciones…</Loading>}
        {!page.error && data?.items.length === 0 && <p className="muted">Aún no hay evaluaciones registradas.</p>}
        {!page.error && data && data.items.length > 0 && (
          <ul className="card m-0 list-none overflow-hidden p-0">
            {data.items.map((item) => (
              <EvaluationRow
                key={item.measurement.id} item={item} disclaimer={data.clinical_disclaimer}
                isOpen={openId === item.measurement.id}
                onToggle={() => setOpenId((current) => (current === item.measurement.id ? null : item.measurement.id))}
                onCorrect={onCorrect} onReport={onReport}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
