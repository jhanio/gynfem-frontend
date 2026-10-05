"use client"

import { useRef, useState } from "react"
import { isOutcomeUnknown } from "@/lib/api/errors"
import type { Report } from "@/lib/api/types"
import { type DescribedError, describeError } from "@/lib/error-messages"
import { generateReport } from "@/services/reports"
import { ErrorNotice } from "@/components/ui/Notices"

type Props = { predictionId: string; onReport: (report: Report, trigger: HTMLElement | null) => void }

const UNKNOWN_OUTCOME = "No sabemos si el reporte llegó a generarse. Si lo generas de nuevo quedará otro registro en la auditoría."
const NO_DISCLAIMER = "El reporte llegó sin la advertencia clínica obligatoria y no se muestra."

// Único punto de la interfaz que genera un reporte (HU009). Cada generación deja
// un registro de auditoría, así que solo ocurre por un clic del médico: este
// archivo no tiene efectos ni cargas automáticas (tests/unit/phase16-guards.test.ts),
// y la petición no se reintenta sola.
export function GenerateReportButton({ predictionId, onReport }: Props) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<DescribedError | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  // Candado síncrono: el estado tarda un render y dejaría pasar clics seguidos.
  const isLocked = useRef(false)

  async function generate() {
    if (isLocked.current) return
    isLocked.current = true
    setIsGenerating(true)
    setError(null)
    try {
      const report = await generateReport(predictionId)
      // La advertencia clínica es obligatoria en todo resultado: sin ella no hay reporte.
      if (!report.clinical_disclaimer?.trim()) setError({ message: NO_DISCLAIMER, reference: null })
      else onReport(report, button.current)
    } catch (caught) {
      setError(isOutcomeUnknown(caught) ? { ...describeError(caught), message: UNKNOWN_OUTCOME } : describeError(caught))
    } finally {
      isLocked.current = false
      setIsGenerating(false)
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* aria-disabled y no disabled: el botón no pierde el foco mientras genera. */}
        <button ref={button} type="button" className="btn-secondary aria-disabled:opacity-60" aria-disabled={isGenerating} onClick={() => void generate()}>
          {isGenerating ? "Generando…" : "Generar reporte"}
        </button>
        <p className="m-0 text-sm text-[#60727d]">Cada generación queda registrada en la auditoría.</p>
      </div>
      {error && <div className="mt-3"><ErrorNotice error={error} /></div>}
    </div>
  )
}
