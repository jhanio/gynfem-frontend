import { TriangleAlert } from "lucide-react"
import type { Limitation } from "@/lib/api/types"
import { LIMITATIONS_TITLE, SOURCE_LABEL } from "@/lib/metrics-text"

export const CLINICAL_DISCLAIMER_CODE = "clinical_disclaimer"

// Las limitaciones que publica la API, en su orden y con su texto literal. El
// título y el mensaje están siempre a la vista: este bloque no tiene estado ni
// controles, y nada lo recorta (tests/unit/phase16-guards.test.ts). Solo la
// fuente, que es una referencia técnica, va tras un desplegable nativo.
export function Limitations({ limitations, className }: { limitations: Limitation[]; className: string }) {
  return (
    <section aria-labelledby="limitations-title" className={className}>
      <h2 id="limitations-title" className="m-0 text-xl font-bold">{LIMITATIONS_TITLE}</h2>
      <ul className="m-0 mt-4 list-none p-0">
        {limitations.map((limitation) => {
          const isDisclaimer = limitation.code === CLINICAL_DISCLAIMER_CODE
          return (
            <li key={limitation.code} className={isDisclaimer ? "mt-4 rounded-md bg-[#fff4e5] p-3 text-[#8a4b08]" : "border-b border-[#d9e1e5] py-3"}>
              <h3 className="m-0 flex items-start gap-2 text-base font-bold">
                {isDisclaimer && <TriangleAlert className="mt-0.5 size-4 shrink-0" />}{limitation.title}
              </h3>
              <p className={`m-0 mt-1 text-sm leading-relaxed ${isDisclaimer ? "font-bold" : ""}`}>{limitation.message}</p>
              {limitation.sources.length > 0 && (
                <details className="mt-2 text-xs text-[#60727d]">
                  <summary className="cursor-pointer">{SOURCE_LABEL}</summary>
                  <ul className="m-0 mt-1 list-none p-0">
                    {limitation.sources.map((source) => <li key={source}>{source}</li>)}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
