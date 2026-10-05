"use client"

import { useState } from "react"
import { flushSync } from "react-dom"
import { ArrowLeft, FileText } from "lucide-react"
import { isOutcomeUnknown } from "@/lib/api/errors"
import type { Measurement, Patient, Report } from "@/lib/api/types"
import { type DescribedError, UNKNOWN_OUTCOME_MESSAGE, describeError } from "@/lib/error-messages"
import { formatDateTime } from "@/lib/format"
import { deactivatePatient, getPatient } from "@/services/patients"
import { EvaluationHistory } from "@/components/history/EvaluationHistory"
import { ReportView } from "@/components/report/ReportView"
import { ErrorNotice, Loading } from "@/components/ui/Notices"
import { useLoad } from "@/components/ui/use-load"

type Props = {
  patientId: string
  onBack: () => void
  onAssess: (patient: Patient) => void
  onCorrect: (patient: Patient, measurement: Measurement) => void
  onEdit: (patient: Patient) => void
  onDeactivated: () => void
}

const BackButton = ({ onBack }: { onBack: () => void }) => (
  <button type="button" className="mb-6 flex items-center gap-2 text-sm font-bold text-[#0f5962]" onClick={onBack}>
    <ArrowLeft className="size-4" />Volver a pacientes
  </button>
)

// El reporte abierto y el botón que lo generó, para devolverle el foco al cerrar.
type OpenReport = { report: Report; trigger: HTMLElement | null }

// Ficha de la paciente (HU004): sus datos y su historial de evaluaciones (HU008).
// Un reporte generado (HU009) se muestra en su lugar: vive solo en este estado,
// nunca en la URL ni en almacenamiento, y se descarta al cerrarlo.
export function PatientFile({ patientId, onBack, onAssess, onCorrect, onEdit, onDeactivated }: Props) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState<DescribedError | null>(null)
  const [openReport, setOpenReport] = useState<OpenReport | null>(null)
  const patient = useLoad(() => getPatient(patientId), `patient:${patientId}`)

  function closeReport() {
    const trigger = openReport?.trigger
    // Síncrono: la ficha tiene que volver a ser visible antes de devolverle el foco.
    flushSync(() => setOpenReport(null))
    trigger?.focus()
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
      {openReport && <ReportView report={openReport.report} onClose={closeReport} />}
      {/* Oculta, no desmontada: al cerrar el reporte conserva la página y la fila abierta. */}
      <div hidden={openReport !== null}>
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

      <EvaluationHistory patientId={patientId} onCorrect={(measurement) => onCorrect(data, measurement)} onReport={(report, trigger) => setOpenReport({ report, trigger })} />
      </div>
    </>
  )
}
