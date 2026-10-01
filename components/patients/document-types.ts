import type { DocumentType } from "@/lib/api/types"

// Los tres tipos que admite el contrato (API_SPEC §3.5). El formato de cada uno
// lo valida el backend; la interfaz no lo repite.
export const DOCUMENT_TYPES: ReadonlyArray<{ value: DocumentType; label: string }> = [
  { value: "DNI", label: "DNI" },
  { value: "CE", label: "Carné de extranjería" },
  { value: "PASAPORTE", label: "Pasaporte" },
]
