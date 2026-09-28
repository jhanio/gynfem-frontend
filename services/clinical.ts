export type Role = "Médico" | "Administrador"
export type Patient = { id: string; documentType: "DNI" | "CE" | "Pasaporte"; documentNumber: string; names: string; surnames: string; active: boolean }
export type Measurement = { id: string; date: string; risk: "Bajo" | "Moderado" | "Alto"; status: "Vigente" | "Corregida" }
export type ClinicalField = { key: string; label: string; unit: string; min: number; max: number; hardMin: number; hardMax: number }
export type RiskResult = { risk: "Bajo" | "Moderado" | "Alto"; probabilities: Record<"Bajo" | "Moderado" | "Alto", number>; generatedAt: string; modelVersion: string; extrapolated: string[]; disclaimer: string }

const patients: Patient[] = [
  { id: "p-001", documentType: "DNI", documentNumber: "00000001", names: "Paciente de Ejemplo", surnames: "García Quispe", active: true },
  { id: "p-002", documentType: "DNI", documentNumber: "45678901", names: "María Elena", surnames: "Salazar Torres", active: true },
  { id: "p-003", documentType: "CE", documentNumber: "001234567", names: "Ana Lucía", surnames: "Flores Mendoza", active: true },
]

// Simulación aislada: los valores clínicos viven únicamente en esta capa de servicios.
const simulatedFields: ClinicalField[] = [
  { key: "age", label: "Edad", unit: "años", min: 18, max: 75, hardMin: 0, hardMax: 120 },
  { key: "temperature", label: "Temperatura", unit: "°C", min: 35, max: 39, hardMin: 25, hardMax: 45 },
  { key: "heartRate", label: "Frecuencia cardíaca", unit: "lpm", min: 50, max: 110, hardMin: 20, hardMax: 250 },
  { key: "systolic", label: "Presión sistólica", unit: "mmHg", min: 90, max: 160, hardMin: 40, hardMax: 300 },
  { key: "diastolic", label: "Presión diastólica", unit: "mmHg", min: 60, max: 100, hardMin: 20, hardMax: 200 },
  { key: "bmi", label: "IMC", unit: "kg/m²", min: 18.5, max: 35, hardMin: 5, hardMax: 100 },
  { key: "hba1c", label: "Hemoglobina glicosilada", unit: "%", min: 4, max: 8, hardMin: 1, hardMax: 30 },
  { key: "fastingGlucose", label: "Glucosa en ayunas", unit: "mg/dl", min: 70, max: 140, hardMin: 20, hardMax: 800 },
]

export async function getClinicalFields() { await new Promise((r) => setTimeout(r, 180)); return simulatedFields }
export async function evaluateClinical(values: Record<string, number>): Promise<RiskResult> { await new Promise((r) => setTimeout(r, 400)); const extrapolated = simulatedFields.filter((f) => values[f.key] < f.min || values[f.key] > f.max).map((f) => f.label); const score = extrapolated.length; const risk = score >= 4 ? "Alto" : score >= 2 ? "Moderado" : "Bajo"; return { risk, probabilities: risk === "Alto" ? { Bajo: 0.08, Moderado: 0.22, Alto: 0.70 } : risk === "Moderado" ? { Bajo: 0.24, Moderado: 0.58, Alto: 0.18 } : { Bajo: 0.78, Moderado: 0.18, Alto: 0.04 }, generatedAt: new Date().toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }), modelVersion: "GynFem-RC 1.0", extrapolated, disclaimer: "Este resultado es apoyo a la decisión clínica y no sustituye el criterio profesional." } }
export async function searchPatients(query: string, mode: "document" | "name") { await new Promise((r) => setTimeout(r, 250)); const q = query.toLowerCase(); return patients.filter((p) => mode === "document" ? p.documentNumber === query : `${p.names} ${p.surnames}`.toLowerCase().includes(q)) }
export async function getMeasurements() { await new Promise((r) => setTimeout(r, 180)); return [{ id: "m-001", date: "12 sep. 2026, 10:42 a. m.", risk: "Moderado" as const, status: "Vigente" as const }, { id: "m-002", date: "30 ago. 2026, 09:15 a. m.", risk: "Bajo" as const, status: "Vigente" as const }] }
export function maskDocument(n: string) { return `*****${n.slice(-3)}` }

// Mantiene la firma disponible para consumidores existentes.
export async function getPatient(id: string) { return patients.find((p) => p.id === id) ?? null }
export { simulatedFields }
export const clinicalFields = simulatedFields
export const clinicalDisclaimer = "Este resultado es apoyo a la decisión clínica y no sustituye el criterio profesional."
export type { ClinicalField as AssessmentField }

// Valores de ejemplo para la simulación, no usados por componentes.
export const simulatedExampleValues = { age: 32, temperature: 36.7, heartRate: 78, systolic: 118, diastolic: 76, bmi: 24.1, hba1c: 5.4, fastingGlucose: 92 }
