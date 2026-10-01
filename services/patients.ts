import { apiRead, apiWrite } from "@/lib/api/client"
import type { DocumentType, Page, Patient, PatientInput, PatientSummary } from "@/lib/api/types"

export const PATIENTS_PAGE_SIZE = 20

// Exactamente un criterio: la API no tiene listado general de pacientes.
export type SearchCriterion =
  | { kind: "document"; documentType: DocumentType; documentNumber: string }
  | { kind: "name"; name: string }

// El backend compara el número tal cual y solo admite mayúsculas y dígitos:
// escrito en minúsculas respondía 422 y no encontraba a la paciente.
const normalizeDocumentNumber = (value: string): string => value.trim().toUpperCase()

function withNormalizedDocument<T extends Partial<PatientInput>>(input: T): T {
  return input.document_number === undefined ? input : { ...input, document_number: normalizeDocumentNumber(input.document_number) }
}

export function searchPatients(criterion: SearchCriterion, offset: number): Promise<Page<PatientSummary>> {
  const filter = criterion.kind === "document"
    ? { document_type: criterion.documentType, document_number: normalizeDocumentNumber(criterion.documentNumber) }
    : { name: criterion.name }
  // El criterio va en el cuerpo, nunca en la URL (API_SPEC §3.5).
  return apiRead<Page<PatientSummary>>("/patients/search", { ...filter, limit: PATIENTS_PAGE_SIZE, offset })
}

export function createPatient(input: PatientInput): Promise<Patient> {
  return apiWrite<Patient>("POST", "/patients", withNormalizedDocument(input))
}

export function getPatient(id: string): Promise<Patient> {
  return apiRead<Patient>(`/patients/${id}`)
}

export function updatePatient(id: string, changes: Partial<PatientInput>): Promise<Patient> {
  return apiWrite<Patient>("PATCH", `/patients/${id}`, withNormalizedDocument(changes))
}

// Baja lógica: la paciente deja de aparecer, su historial se conserva.
export function deactivatePatient(id: string): Promise<void> {
  return apiWrite<void>("DELETE", `/patients/${id}`)
}
