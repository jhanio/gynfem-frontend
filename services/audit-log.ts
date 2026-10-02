import { apiRead } from "@/lib/api/client"
import type { AuditEntry, AuditFilters, Page } from "@/lib/api/types"

// El de la API por defecto: la auditoría no usa `history_default_page_size`.
export const AUDIT_PAGE_SIZE = 20

// URLSearchParams codifica el `+` de una zona horaria como %2B; sin codificar
// llegaría como un espacio y la fecha daría 422 (API_SPEC §3.7.6, aviso 1).
export function listAuditLog(filters: AuditFilters, offset: number): Promise<Page<AuditEntry>> {
  const query = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), offset: String(offset) })
  for (const [name, value] of Object.entries(filters)) {
    if (value) query.set(name, value)
  }
  return apiRead<Page<AuditEntry>>(`/audit-log?${query}`)
}
