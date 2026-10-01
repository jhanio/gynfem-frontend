import { apiRead, apiWrite } from "@/lib/api/client"
import type { DocumentType, Page, Patient, PatientInput, PatientSummary } from "@/lib/api/types"

export const PATIENTS_PAGE_SIZE = 20

// Exactamente un criterio: la API no tiene listado general de pacientes.
export type SearchCriterion =
  | { kind: "document"; documentType: DocumentType; documentNumber: string }
  | { kind: "name"; name: string }

export function searchPatients(criterion: SearchCriterion, offset: number): Promise<Page<PatientSummary>> {
  const filter = criterion.kind === "document"
    ? { document_type: criterion.documentType, document_number: criterion.documentNumber }
    : { name: criterion.name }
  // El criterio va en el cuerpo, nunca en la URL (API_SPEC §3.5).
  return apiRead<Page<PatientSummary>>("/patients/search", { ...filter, limit: PATIENTS_PAGE_SIZE, offset })
}

export function createPatient(input: PatientInput): Promise<Patient> {
  return apiWrite<Patient>("POST", "/patients", input)
}

export function getPatient(id: string): Promise<Patient> {
  return apiRead<Patient>(`/patients/${id}`)
}

export function updatePatient(id: string, changes: Partial<PatientInput>): Promise<Patient> {
  return apiWrite<Patient>("PATCH", `/patients/${id}`, changes)
}

// Baja lógica: la paciente deja de aparecer, su historial se conserva.
export function deactivatePatient(id: string): Promise<void> {
  return apiWrite<void>("DELETE", `/patients/${id}`)
}
