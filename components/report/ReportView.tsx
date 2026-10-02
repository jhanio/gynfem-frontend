"use client"

import { useEffect, useRef } from "react"
import { Printer } from "lucide-react"
import type { PredictionSchema, Report } from "@/lib/api/types"
import { fieldLabel } from "@/lib/field-labels"
import { formatDateTimeWithZone, formatPercent } from "@/lib/format"
import { riskLabel } from "@/lib/risk"
import { getPredictionSchema } from "@/services/prediction-schema"
import { DOCUMENT_TYPES } from "@/components/patients/document-types"
import { useLoad } from "@/components/ui/use-load"

type Props = { report: Report; onClose: () => void }

// La unidad de cada campo, de /prediction/schema. Solo si el esquema publicado
// es de la misma versión de conversión que la del reporte: el esquema describe
// el modelo actual y el reporte puede ser de una predicción anterior.
function unitsFor(schema: PredictionSchema | null, report: Report): Map<string, string> | null {
  if (!schema || schema.conversion_schema_version !== report.prediction.conversion_schema_version) return null
  return new Map(schema.fields.map((field) => [field.name, field.unit]))
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 border-b border-[#d9e1e5] py-1">
      <dt className="text-[#49616a]">{term}</dt><dd className="m-0 text-right font-semibold">{children}</dd>
    </div>
  )
}

const blockTitle = "m-0 mb-2 text-sm font-bold uppercase tracking-wide"
const boxed = "report-block mt-5 rounded border-2 border-[#17242b] p-3"

// Vista de impresión del reporte de una evaluación (HU009). El backend entrega
// datos y esta vista compone el papel: «Imprimir → Guardar como PDF». No pide el
// reporte ni lo guarda: lo recibe ya generado y vive solo mientras está en pantalla.
// Todo texto de la API se muestra como texto.
export function ReportView({ report, onClose }: Props) {
  const title = useRef<HTMLHeadingElement>(null)
  // Al abrirse, el foco pasa al título para que un lector de pantalla lo anuncie.
  useEffect(() => { title.current?.focus() }, [])
  // Lectura con caché, sin auditoría. Si falla, el reporte se imprime igual.
  const schema = useLoad(getPredictionSchema, "report-units")

  const { patient, measurement, prediction } = report
  const units = unitsFor(schema.data, report)
  const hasNoUnits = units === null && !schema.isLoading
  const documentType = DOCUMENT_TYPES.find((type) => type.value === patient.document_type)?.label ?? patient.document_type
  const values = Object.entries(measurement).filter(([, value]) => typeof value === "number")
  const { probabilities } = prediction

  return (
    <article aria-labelledby="report-title" className="report mx-auto max-w-[760px] bg-white p-6 text-[#17242b]">
      <div className="mb-6 flex flex-wrap gap-3 print:hidden">
        <button type="button" className="btn-primary flex items-center gap-2" onClick={() => window.print()}><Printer className="size-4" />Imprimir o guardar como PDF</button>
        <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
      </div>

      <div className="border-b-2 border-[#17242b] pb-3">
        <p className="m-0 text-lg font-bold">{report.institution_name}</p>
        <h1 id="report-title" ref={title} tabIndex={-1} className="m-0 mt-1 text-2xl font-bold outline-none">Reporte de evaluación de riesgo</h1>
      </div>

      {prediction.status === "corrected" && (
        <section className={boxed}>
          <h2 className={blockTitle}>Evaluación corregida</h2>
          <p className="m-0">Esta evaluación fue corregida después: no es la vigente de la paciente.</p>
        </section>
      )}

      <section className="report-block mt-5">
        <h2 className={blockTitle}>Paciente</h2>
        <dl className="m-0">
          <Row term="Nombres y apellidos">{patient.given_names} {patient.family_names}</Row>
          <Row term="Documento">{documentType} {patient.document_number}</Row>
        </dl>
      </section>

      <section className="report-block mt-5">
        <h2 className={blockTitle}>Medición</h2>
        <dl className="m-0">
          <Row term="Fecha de la medición">{formatDateTimeWithZone(measurement.measured_at)}</Row>
          {values.map(([name, value]) => {
            const unit = units?.get(name)
            // Sin unidad publicada, el nombre de campo de la API la lleva consigo.
            return <Row key={name} term={unit === undefined ? `${fieldLabel(name)} (${name})` : fieldLabel(name)}>{unit === undefined ? value : `${value} ${unit}`}</Row>
          })}
        </dl>
        {hasNoUnits && <p className="m-0 mt-2 text-sm">Las unidades no están disponibles. Cada valor se muestra con el nombre del campo, que incluye su unidad.</p>}
      </section>

      <section className="report-block mt-5">
        <h2 className={blockTitle}>Resultado</h2>
        <dl className="m-0">
          <Row term="Nivel de riesgo">{riskLabel(prediction.risk_level)}</Row>
          <Row term="Probabilidades">Bajo {formatPercent(probabilities.low)} · Moderado {formatPercent(probabilities.mid)} · Alto {formatPercent(probabilities.high)}</Row>
          <Row term="Calculado el">{formatDateTimeWithZone(prediction.predicted_at)}</Row>
        </dl>
      </section>

      {prediction.extrapolation_warnings.length > 0 && (
        <section className="report-block mt-5">
          <h2 className={blockTitle}>Avisos</h2>
          {prediction.extrapolation_warnings.map((warning) => (
            <p key={warning.field} className="m-0 mt-1">{fieldLabel(warning.field)}: {warning.message}</p>
          ))}
        </section>
      )}

      <section className={boxed}>
        <h2 className={blockTitle}>Advertencia clínica</h2>
        <p className="m-0 font-bold">{report.clinical_disclaimer}</p>
      </section>

      <footer className="report-block mt-6 border-t-2 border-[#17242b] pt-3 text-sm">
        <p className="m-0">Predicción {prediction.id}</p>
        <p className="m-0">Modelo {prediction.model_version} · Esquema de conversión {prediction.conversion_schema_version}</p>
        <p className="m-0">Reporte generado el {formatDateTimeWithZone(report.generated_at)}</p>
        {/* Se firma a mano: la interfaz no lo rellena con ningún dato. */}
        <p className="m-0 mt-10">Profesional responsable: <span aria-hidden="true" className="inline-block w-72 border-b border-[#17242b]" /></p>
      </footer>
    </article>
  )
}
