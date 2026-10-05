"use client"

import { INTRO, NO_LIMITATIONS, TITLE } from "@/lib/metrics-text"
import { getModelMetrics } from "@/services/model-metrics"
import { ErrorNotice, Loading } from "@/components/ui/Notices"
import { useLoad } from "@/components/ui/use-load"
import { CLINICAL_DISCLAIMER_CODE, Limitations } from "./Limitations"
import { MetricsFigures } from "./MetricsFigures"

// Las dos mitades de la pantalla llevan exactamente el mismo estilo: misma tarjeta, misma prominencia.
const HALF = "card p-5"

// Métricas del modelo (HU010), para médico y administrador. Este componente
// pinta las cifras y sus limitaciones juntas, o ninguna de las dos: no existe
// una vista de solo cifras. Las limitaciones van primero en el documento (y a
// la izquierda en escritorio), así que en un móvil se leen antes que las cifras.
export function ModelMetrics() {
  const metrics = useLoad(getModelMetrics, "model-metrics")
  const data = metrics.data
  // La advertencia clínica es la limitación `clinical_disclaimer` (API_SPEC §3.7.6, aviso 2).
  const hasLimitations = data?.limitations.some((limitation) => limitation.code === CLINICAL_DISCLAIMER_CODE && limitation.message.trim() !== "") ?? false

  return (
    <>
      <p className="eyebrow">Modelo de predicción</p>
      <h1 className="page-title">{TITLE}</h1>
      <p className="muted max-w-[70ch]">{INTRO}</p>
      <div className="mt-6">
        {metrics.error && <ErrorNotice error={metrics.error}><button type="button" className="btn-secondary" onClick={metrics.reload}>Reintentar</button></ErrorNotice>}
        {!metrics.error && !data && <Loading>Cargando las métricas…</Loading>}
        {!metrics.error && data && !hasLimitations && <ErrorNotice error={{ message: NO_LIMITATIONS, reference: null }} />}
        {!metrics.error && data && hasLimitations && (
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <Limitations limitations={data.limitations} className={HALF} />
            <MetricsFigures metrics={data} className={HALF} />
          </div>
        )}
      </div>
    </>
  )
}
