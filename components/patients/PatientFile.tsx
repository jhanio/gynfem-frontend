"use client"

import { useState } from "react"
import { ArrowLeft, FileText } from "lucide-react"
import { isOutcomeUnknown } from "@/lib/api/errors"
import type { MeasurementListItem, Patient, PredictionDetail } from "@/lib/api/types"
import { type DescribedError, UNKNOWN_OUTCOME_MESSAGE, describeError } from "@/lib/error-messages"
import { fieldLabel } from "@/lib/field-labels"
import { formatDateTime } from "@/lib/format"
import { MEASUREMENTS_PAGE_SIZE, getPrediction, listMeasurements } from "@/services/assessments"
import { deactivatePatient, getPatient } from "@/services/patients"
import { ResultCard } from "@/components/assessment/ResultCard"
import { ErrorNotice, Loading, Pager } from "@/components/ui/Notices"
import { useLoad } from "@/components/ui/use-load"

type Props = {
  patientId: string
  onBack: () => void
  onAssess: (patient: Patient) => void
  onCorrect: (patient: Patient, measurement: MeasurementListItem) => void
  onEdit: (patient: Patient) => void
  onDeactivated: () => void
}

type OpenResult = { measurementId: string; prediction: PredictionDetail | null; error: DescribedError | null }

const BackButton = ({ onBack }: { onBack: () => void }) => (
  <button type="button" className="mb-6 flex items-center gap-2 text-sm font-bold text-[#0f5962]" onClick={onBack}>
    <ArrowLeft className="size-4" />Volver a pacientes
  </button>
)

// Ficha de la paciente (HU004): sus datos, sus evaluaciones vigentes y el
// resultado guardado de cada una. La lista no trae el nivel de riesgo: se
// consulta bajo demanda con GET /predictions/{id}.
export function PatientFile({ patientId, onBack, onAssess, onCorrect, onEdit, onDeactivated }: Props) {
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<OpenResult | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState<DescribedError | null>(null)
  const patient = useLoad(() => getPatient(patientId), `patient:${patientId}`)
  const measurements = useLoad(() => listMeasurements(patientId, offset), `measurements:${patientId}:${offset}`)

  async function showResult(measurement: MeasurementListItem) {
    if (!measurement.prediction_id) return
    if (open?.measurementId === measurement.id) { setOpen(null); return }
    setOpen({ measurementId: measurement.id, prediction: null, error: null })
    try {
      const prediction = await getPrediction(measurement.prediction_id)
      setOpen((current) => (current?.measurementId === measurement.id ? { ...current, prediction } : current))
    } catch (caught) {
      setOpen((current) => (current?.measurementId === measurement.id ? { ...current, error: describeError(caught) } : current))
    }
  }

  async function confirmDeactivation() {
    setDeactivateError(null)
    setIsDeactivating(true)
    try {
      await deactivatePatient(patientId)
      onDeactivated()
    } catch (caught) {
      setDeactivateError(isOutcomeUnknown(caught) ? { ...describeError(caught), message: UNKNOWN_OUTCOME_MESSAGE } : describeError(caught))
      setIsDeactivating(false)
    }
  }

  if (patient.error) {
    return (
      <>
        <BackButton onBack={onBack} />
        <ErrorNotice error={patient.error}><button type="button" className="btn-secondary" onClick={patient.reload}>Reintentar</button></ErrorNotice>
      </>
    )
  }
  if (!patient.data) return <><BackButton onBack={onBack} /><Loading>Cargando la ficha…</Loading></>

  const data = patient.data
  return (
    <>
      <BackButton onBack={onBack} />
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Ficha de paciente</p>
          <h1 className="page-title">{data.given_names} {data.family_names}</h1>
          <p className="muted">Paciente activa</p>
        </div>
        <button type="button" className="btn-primary flex items-center justify-center gap-2" onClick={() => onAssess(data)}><FileText className="size-4" />Nueva evaluación</button>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">Datos personales</h2>
        <p className="m-0 font-semibold">{data.document_type} · {data.document_number}</p>
        <p className="muted">Registrada el {formatDateTime(data.created_at)}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" onClick={() => onEdit(data)}>Editar datos</button>
          <button type="button" className="btn-secondary" onClick={() => setIsConfirming(true)}>Dar de baja</button>
        </div>
        {isConfirming && (
          <div className="mt-5 rounded-lg border border-[#e3b4ae] bg-[#fff7f6] p-4" role="alertdialog" aria-labelledby="deactivate-title" aria-describedby="deactivate-text">
            <h3 id="deactivate-title" className="m-0 text-base font-bold">¿Dar de baja a esta paciente?</h3>
            <p id="deactivate-text" className="muted">
              Dejará de aparecer en búsquedas y consultas. Su historial se conserva y la baja no se puede deshacer.
            </p>
            {deactivateError && <div className="mt-3"><ErrorNotice error={deactivateError} /></div>}
            <div className="mt-4 flex gap-3">
              <button type="button" className="btn-primary disabled:opacity-60" disabled={isDeactivating} onClick={() => void confirmDeactivation()}>{isDeactivating ? "Dando de baja…" : "Confirmar baja"}</button>
              <button type="button" className="btn-secondary" disabled={isDeactivating} onClick={() => { setIsConfirming(false); setDeactivateError(null) }}>Cancelar</button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Evaluaciones registradas</h2>
            <p className="muted">Las evaluaciones no se editan. Para cambiar una, corrígela: se guarda una nueva que la sustituye.</p>
          </div>
          {measurements.data && (offset > 0 || measurements.data.has_more) && (
            <Pager offset={offset} hasMore={measurements.data.has_more} pageSize={MEASUREMENTS_PAGE_SIZE} isBusy={measurements.isLoading} onChange={setOffset} />
          )}
        </div>
        <div className="mt-4">
          {measurements.error && <ErrorNotice error={measurements.error}><button type="button" className="btn-secondary" onClick={measurements.reload}>Reintentar</button></ErrorNotice>}
          {!measurements.error && !measurements.data && <Loading>Cargando evaluaciones…</Loading>}
          {!measurements.error && measurements.data?.items.length === 0 && <p className="muted">Aún no hay evaluaciones registradas.</p>}
          {!measurements.error && measurements.data && measurements.data.items.length > 0 && (
            <div className="card overflow-hidden">
              {measurements.data.items.map((measurement) => (
                <div key={measurement.id} className="border-b border-[#d9e1e5] p-4 last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>{formatDateTime(measurement.measured_at)}</span>
                    <span className="flex gap-4">
                      {measurement.prediction_id && (
                        <button type="button" className="font-bold text-[#0f5962]" aria-expanded={open?.measurementId === measurement.id} onClick={() => void showResult(measurement)}>
                          {open?.measurementId === measurement.id ? "Ocultar resultado" : "Ver resultado"}
                        </button>
                      )}
                      <button type="button" className="font-bold text-[#0f5962]" onClick={() => onCorrect(data, measurement)}>Corregir</button>
                    </span>
                  </div>
                  {open?.measurementId === measurement.id && (
                    <div className="mt-4">
                      {open.error && <ErrorNotice error={open.error} />}
                      {!open.error && !open.prediction && <Loading>Cargando resultado…</Loading>}
                      {open.prediction && (
                        <ResultCard prediction={open.prediction}>
                          <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                            {Object.entries(open.prediction.input).map(([name, value]) => (
                              <div key={name} className="flex justify-between gap-3 border-b border-[#eef2f3] py-1">
                                <dt className="text-[#60727d]">{fieldLabel(name)}</dt><dd className="m-0 font-semibold">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </ResultCard>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
