// Etiqueta en español de cada campo de /prediction/schema. La API publica el
// nombre, la unidad y los rangos, pero no un rótulo. Solo texto: ningún número.
// Map y no un objeto literal: un nombre como "toString" no debe resolverse por el prototipo.
const LABELS = new Map<string, string>([
  ["age_years", "Edad"],
  ["temperature_c", "Temperatura"],
  ["heart_rate_bpm", "Frecuencia cardíaca"],
  ["systolic_bp_mmhg", "Presión sistólica"],
  ["diastolic_bp_mmhg", "Presión diastólica"],
  ["bmi_kg_m2", "IMC"],
  ["hba1c_percent", "Hemoglobina glicosilada"],
  ["fasting_glucose_mg_dl", "Glucosa en ayunas"],
])

// Un campo que el backend añada después se muestra con su nombre: nunca se oculta.
export function fieldLabel(name: string): string {
  return LABELS.get(name) ?? name
}
