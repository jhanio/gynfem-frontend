export type Role = "Médico" | "Administrador"
export type Patient = { id: string; documentType: "DNI" | "CE" | "Pasaporte"; documentNumber: string; names: string; surnames: string; active: boolean }
export type Measurement = { id: string; date: string; risk: "Bajo" | "Moderado" | "Alto"; status: "Vigente" | "Corregida" }

const patients: Patient[] = [
  { id: "p-001", documentType: "DNI", documentNumber: "00000001", names: "Paciente de Ejemplo", surnames: "García Quispe", active: true },
  { id: "p-002", documentType: "DNI", documentNumber: "45678901", names: "María Elena", surnames: "Salazar Torres", active: true },
  { id: "p-003", documentType: "CE", documentNumber: "001234567", names: "Ana Lucía", surnames: "Flores Mendoza", active: true },
]

export async function searchPatients(query: string, mode: "document" | "name") {
  await new Promise((resolve) => setTimeout(resolve, 350))
  if (!query) return []
  const normalized = query.toLowerCase()
  return patients.filter((p) => mode === "document" ? p.documentNumber === query : `${p.names} ${p.surnames}`.toLowerCase().includes(normalized))
}

export async function getPatient(id: string) {
  await new Promise((resolve) => setTimeout(resolve, 250))
  return patients.find((p) => p.id === id) ?? null
}

export async function getMeasurements() {
  await new Promise((resolve) => setTimeout(resolve, 250))
  return [
    { id: "m-001", date: "12 sep. 2026, 10:42 a. m.", risk: "Moderado" as const, status: "Vigente" as const },
    { id: "m-002", date: "30 ago. 2026, 09:15 a. m.", risk: "Bajo" as const, status: "Vigente" as const },
  ]
}

export function maskDocument(documentNumber: string) { return `*****${documentNumber.slice(-3)}` }
