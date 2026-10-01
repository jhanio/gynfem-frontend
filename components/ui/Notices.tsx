import type { ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import type { DescribedError } from "@/lib/error-messages"

type ErrorNoticeProps = { error: DescribedError; children?: ReactNode }

// Error visible, con el código de referencia de la petición (su X-Request-ID)
// para poder buscarla en los registros del servidor. Nunca muestra datos.
export function ErrorNotice({ error, children }: ErrorNoticeProps) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-[#fff0f0] p-3 text-sm text-[#b42318]" role="alert">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="m-0">{error.message}</p>
        {error.reference && <p className="m-0 mt-1 text-xs text-[#8f3a31]">Código de referencia: {error.reference}</p>}
        {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  )
}

export function StatusNotice({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-md bg-[#e9f1f1] p-3 text-sm text-[#0f5962]" role="status">{children}</p>
}

// Carga en curso: nunca se presenta como un error.
export function Loading({ children }: { children: ReactNode }) {
  return <p className="muted animate-pulse" role="status">{children}</p>
}

export function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null
  return <p className="mt-1 flex items-center gap-1 text-xs text-[#b42318]"><AlertCircle className="size-3" />{message}</p>
}

type PagerProps = { offset: number; hasMore: boolean; pageSize: number; isBusy: boolean; onChange: (offset: number) => void }

// La API pagina con limit/offset y `has_more`, sin total.
export function Pager({ offset, hasMore, pageSize, isBusy, onChange }: PagerProps) {
  return (
    <div className="flex gap-2">
      <button type="button" className="btn-secondary disabled:opacity-50" disabled={isBusy || offset === 0} onClick={() => onChange(Math.max(0, offset - pageSize))}>Anterior</button>
      <button type="button" className="btn-secondary disabled:opacity-50" disabled={isBusy || !hasMore} onClick={() => onChange(offset + pageSize)}>Siguiente</button>
    </div>
  )
}
