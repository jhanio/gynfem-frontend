"use client"

import { useRef, useState } from "react"
import { AlertCircle, ArrowLeft, TriangleAlert } from "lucide-react"
import { ApiError, isOutcomeUnknown, splitValidation } from "@/lib/api/errors"
import type { Measurement, Patient, PredictionView } from "@/lib/api/types"
import { canSubmitAssessment, getFieldStatus, hasPressureConflict, toClinicalValues } from "@/lib/clinical-validation"
import { type DescribedError, UNKNOWN_OUTCOME_MESSAGE, describeError } from "@/lib/error-messages"
import { fieldLabel } from "@/lib/field-labels"
import { formatNumber } from "@/lib/format"
import { correctMeasurement, quickAssessment, registerAssessment } from "@/services/assessments"
import { getPredictionSchema, invalidatePredictionSchema } from "@/services/prediction-schema"
import { ErrorNotice, FieldError, Loading, StatusNotice } from "@/components/ui/Notices"
import { useLoad } from "@/components/ui/use-load"
import { ResultCard } from "./ResultCard"

export type AssessmentMode =
  | { kind: "quick" }
  | { kind: "patient"; patient: Patient }
  | { kind: "correction"; patient: Patient; measurement: Measurement }

type Props = { mode: AssessmentMode; onBackToFile: () => void; onBackToPatients: () => void }

// Qué hacer tras un fallo al guardar: adónde mandar al médico a comprobarlo.
type Recovery = "none" | "check-file" | "patient-gone"

const COPY = {
  quick: { eyebrow: "Evaluación rápida", title: "Evaluación de riesgo", submit: "Calcular riesgo", busy: "Calculando…", done: "" },
  patient: { eyebrow: "Nueva evaluación clínica", title: "Evaluación de riesgo", submit: "Registrar y calcular riesgo", busy: "Registrando…", done: "Evaluación registrada en la ficha." },
  correction: { eyebrow: "Corrección", title: "Corregir evaluación", submit: "Guardar corrección y recalcular", busy: "Guardando…", done: "Corrección registrada. La evaluación original deja de estar vigente." },
}

function initialValues(mode: AssessmentMode): Record<string, string> {
  if (mode.kind !== "correction") return {}
  return Object.fromEntries(Object.entries(mode.measurement).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, String(v)]))
}

function describeMode(mode: AssessmentMode): string {
  if (mode.kind === "quick") return "Modo rápido: no se asocia a una paciente ni guarda información."
  const name = `${mode.patient.given_names} ${mode.patient.family_names}`
  return mode.kind === "patient"
    ? `Paciente: ${name}. La evaluación se registrará en su ficha.`
    : `Paciente: ${name}. La evaluación original no se edita: se guarda una nueva que la sustituye.`
}

// Formulario de evaluación clínica. Campos, unidades y rangos llegan de
// GET /prediction/schema: sin ese esquema no se puede evaluar (decisión B).
// Registrar es UNA operación: el backend guarda medición y predicción juntas.
export function AssessmentForm({ mode, onBackToFile, onBackToPatients }: Props) {
  const schema = useLoad(getPredictionSchema, "prediction-schema")
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(mode))
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<PredictionView | null>(null)
  const [error, setError] = useState<DescribedError | null>(null)
  const [recovery, setRecovery] = useState<Recovery>("none")
  const [isBusy, setIsBusy] = useState(false)
  const [isRecorded, setIsRecorded] = useState(false)
  const latestRequest = useRef(0)

  const copy = COPY[mode.kind]
  const isPersisted = mode.kind !== "quick"
  const fields = schema.data?.fields ?? []
  const isLocked = isRecorded || recovery !== "none" || (isPersisted && isBusy)
  const isInvalid = !canSubmitAssessment(fields, values)

  function handleChange(name: string, value: string) {
    setValues({ ...values, [name]: value })
    setServerErrors(Object.fromEntries(Object.entries(serverErrors).filter(([field]) => field !== name)))
    setResult(null)
    setError(null)
    latestRequest.current++ // descarta la respuesta de valores ya editados
  }

  function handleFailure(caught: unknown) {
    const { fields: fieldErrors, form } = splitValidation(caught)
    setServerErrors(fieldErrors)
    if (caught instanceof ApiError && caught.status === 422) {
      // El servidor rechazó algo que los rangos guardados dejaron pasar: se piden de nuevo.
      invalidatePredictionSchema()
      schema.reload()
      if (form.length > 0) setError({ message: form.join(" "), reference: null })
      else if (Object.keys(fieldErrors).length === 0) setError(describeError(caught))
      return
    }
    if (isPersisted && isOutcomeUnknown(caught)) {
      setRecovery("check-file")
      setError({ ...describeError(caught), message: UNKNOWN_OUTCOME_MESSAGE })
      return
    }
    if (caught instanceof ApiError && caught.code === "patient_not_found") setRecovery("patient-gone")
    setError(describeError(caught))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (isInvalid || isLocked || !schema.data) return
    const requestId = ++latestRequest.current
    setIsBusy(true)
    setError(null)
    try {
      const clinical = toClinicalValues(fields, values)
      const prediction: PredictionView =
        mode.kind === "quick" ? await quickAssessment(clinical)
        : mode.kind === "patient" ? (await registerAssessment(mode.patient.id, clinical)).prediction
        : (await correctMeasurement(mode.measurement.id, clinical)).prediction
      if (prediction.model_version !== schema.data.model_version) invalidatePredictionSchema()
      if (isPersisted) setIsRecorded(true)
      if (isPersisted || requestId === latestRequest.current) setResult(prediction)
    } catch (caught) {
      if (isPersisted || requestId === latestRequest.current) handleFailure(caught)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <>
      {isPersisted && (
        <button type="button" className="mb-6 flex items-center gap-2 text-sm font-bold text-[#0f5962]" onClick={onBackToFile}>
          <ArrowLeft className="size-4" />Volver a la ficha
        </button>
      )}
      <div className="mb-8">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="page-title">{copy.title}</h1>
        <p className="muted">{describeMode(mode)}</p>
      </div>

      {schema.error && (
        <ErrorNotice error={{ ...schema.error, message: `No se pudieron cargar los rangos del modelo; sin ellos no se puede evaluar. ${schema.error.message}` }}>
          <button type="button" className="btn-secondary" onClick={() => { invalidatePredictionSchema(); schema.reload() }}>Reintentar</button>
        </ErrorNotice>
      )}
      {!schema.error && !schema.data && <Loading>Cargando rangos del modelo…</Loading>}

      {!schema.error && schema.data && (
        <section className="card p-5 sm:p-7">
          <form onSubmit={handleSubmit} noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map((field) => {
                const status = getFieldStatus(field, values[field.name])
                const isImpossible = status === "impossible"
                const serverError = serverErrors[field.name]
                return (
                  <div key={field.name}>
                    <label className="label" htmlFor={field.name}>{fieldLabel(field.name)}</label>
                    <input
                      className={`input ${isImpossible || serverError ? "border-[#c53d3d]" : ""}`} id={field.name} type="number" step="any" inputMode="decimal" autoComplete="off"
                      value={values[field.name] ?? ""} onChange={(e) => handleChange(field.name, e.target.value)}
                      aria-invalid={isImpossible || Boolean(serverError)} disabled={isLocked}
                    />
                    <p className="mt-1 text-xs text-[#60727d]">
                      {field.unit} · rango del modelo: {formatNumber(field.training_range.min)} a {formatNumber(field.training_range.max)}
                    </p>
                    {isImpossible && <p className="mt-1 flex items-center gap-1 text-xs text-[#b42318]"><AlertCircle className="size-3" />Valor imposible; corrígelo para continuar.</p>}
                    {status === "warning" && <p className="mt-1 flex items-center gap-1 text-xs text-[#8a4b08]"><TriangleAlert className="size-3" />Fuera del rango de entrenamiento; el resultado será menos confiable.</p>}
                    <FieldError message={serverError} />
                  </div>
                )
              })}
            </div>
            {hasPressureConflict(values) && (
              <p className="mt-5 flex items-center gap-2 rounded-md bg-[#fff0f0] p-3 text-sm text-[#b42318]" role="alert">
                <AlertCircle className="size-4" />La presión diastólica debe ser menor que la sistólica.
              </p>
            )}
            {error && (
              <div className="mt-5">
                <ErrorNotice error={error}>
                  {recovery === "check-file" && <button type="button" className="btn-secondary" onClick={onBackToFile}>Ver evaluaciones de la paciente</button>}
                  {recovery === "patient-gone" && <button type="button" className="btn-secondary" onClick={onBackToPatients}>Volver a pacientes</button>}
                </ErrorNotice>
              </div>
            )}
            {!isRecorded && (
              <button className="btn-primary mt-7 w-full disabled:opacity-60 sm:w-auto" disabled={isBusy || isInvalid || isLocked}>{isBusy ? copy.busy : copy.submit}</button>
            )}
          </form>
        </section>
      )}

      {result && (
        <div className="mt-7 flex flex-col gap-4">
          {isRecorded && <StatusNotice>{copy.done}</StatusNotice>}
          <ResultCard prediction={result} />
        </div>
      )}
    </>
  )
}
