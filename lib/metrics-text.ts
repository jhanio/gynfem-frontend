// Texto que acompaña a las métricas del modelo (HU010), escrito para un médico:
// qué significa cada cifra y qué NO significa. Revisado línea por línea antes de
// existir el código; cambiarlo exige la misma revisión.
//
// Solo texto: ninguna cifra. Los valores llegan de GET /model/metrics y se
// insertan al pintar (tests/unit/metrics-text.test.ts). Dice «el nivel que
// figuraba en los datos» y no «el riesgo real»: las etiquetas del dataset no
// están verificadas clínicamente, y la API lo publica como limitación.

export const TITLE = "Métricas del modelo"

export const INTRO = "Estas cifras describen cómo se comportó el modelo en una prueba con datos de otra población. No miden qué tan bien funcionará con las pacientes de GynFem. Léelas junto con las limitaciones."

export const LIMITATIONS_TITLE = "Lo que estas cifras no dicen"
export const FIGURES_TITLE = "Lo que se midió"
export const SOURCE_LABEL = "Fuente"
export const MEANS_LABEL = "Qué significa:"
export const DOES_NOT_MEAN_LABEL = "Qué no significa:"
export const NO_LIMITATIONS = "Las métricas llegaron sin sus limitaciones y no se muestran."

export type FigureText = { title: string; means: string; doesNotMean: string }

// Una entrada por cifra de `metrics`, en el orden en que se muestran.
export const FIGURES = {
  accuracy: {
    title: "Exactitud",
    means: "Proporción de casos de prueba en los que el modelo asignó el mismo nivel de riesgo que figuraba en los datos.",
    doesNotMean: "No es la probabilidad de que el resultado de una paciente concreta sea correcto, y no distingue un error leve de uno grave.",
  },
  high_to_low_errors: {
    title: "Riesgo alto clasificado como bajo",
    means: "Casos que en los datos figuraban como riesgo alto y el modelo clasificó como riesgo bajo. Es el error más grave, porque puede retrasar la atención.",
    doesNotMean: "La cifra corresponde solo a los casos de prueba. No indica con qué frecuencia ocurrirá con pacientes reales, ni garantiza que no ocurra.",
  },
  precision_macro: {
    title: "Precisión (valor predictivo positivo), promedio entre niveles",
    means: "Cuando el modelo asignó un nivel, con qué frecuencia era el que figuraba en los datos. Cada nivel pesa lo mismo en el promedio.",
    doesNotMean: "No dice cuántos casos de cada nivel pasó por alto.",
  },
  recall_macro: {
    title: "Sensibilidad, promedio entre niveles",
    means: "De los casos que figuraban con cada nivel, qué proporción reconoció el modelo.",
    doesNotMean: "Un promedio alto puede ocultar un nivel peor reconocido que los demás. Mira la tabla por nivel.",
  },
  fScore: {
    title: "F1, promedio entre niveles",
    means: "Resume precisión y sensibilidad en una sola cifra.",
    doesNotMean: "Sirve para comparar modelos entre sí; no tiene lectura clínica directa.",
  },
} satisfies Record<string, FigureText>

// «n casos» / «n caso»: el número lo pone quien llama.
export const cases = (count: string, isOne: boolean) => `${count} ${isOne ? "caso" : "casos"}`

export const MODEL = {
  version: (version: string) => `Modelo ${version}`,
  variant: (variant: string) => `variante ${variant}`,
  trainedAt: (date: string) => `entrenado el ${date}`,
}

export const EVALUATION = {
  title: "Cómo se evaluó",
  dataset: (rows: string) => `El conjunto de datos tiene ${rows} casos.`,
  split: (trainingRows: string, testShare: string | null) =>
    `${trainingRows} se usaron para entrenar el modelo y el resto${testShare === null ? "" : ` (${testShare})`} se apartó para probarlo.`,
  tested: (rows: string) => `Se probó con ${rows} casos.`,
  stratified: "La separación mantuvo la proporción de cada nivel de riesgo.",
  heldOut: "Las cifras se calcularon con casos apartados, que el modelo no vio durante el entrenamiento.",
  otherSource: (source: string) => `Origen de las cifras: ${source}`,
}
// El único origen que el contrato publica hoy; otro código se muestra tal cual.
export const HELD_OUT_SOURCE = "held_out_test"

export const PER_LEVEL = {
  title: "Por nivel de riesgo",
  columns: { level: "Nivel", precision: "Precisión", recall: "Sensibilidad", fScore: "F1", support: "Casos" },
  note: "Precisión (valor predictivo positivo): de los casos a los que el modelo asignó este nivel, cuántos lo tenían en los datos. Sensibilidad: de los casos que tenían este nivel en los datos, cuántos reconoció. Casos: cuántos casos de prueba tenían este nivel.",
}

export const MATRIX = {
  title: "Aciertos y errores, caso por caso",
  caption: "Cada fila es el nivel que figuraba en los datos; cada columna, el que asignó el modelo. Donde fila y columna coinciden, el modelo acertó; en el resto, se equivocó.",
  corner: "Nivel en los datos",
  assigned: (level: string) => `Asignó ${level}`,
  match: "Coincide",
  error: "Error",
  // Solo alto → bajo: el único error que la API señala como clínicamente grave.
  severe: "Error más grave",
  knownLevel: (level: string) => `riesgo ${level}`,
  unknownLevel: (label: string) => `«${label}»`,
  cell: (count: string, isOne: boolean, real: string, assigned: string, outcome: string) =>
    `${count} ${isOne ? "caso" : "casos"} de ${real} ${isOne ? "clasificado" : "clasificados"} como ${assigned}: ${outcome.toLowerCase()}.`,
  doesNotMean: "Son recuentos de la prueba, no pacientes de este consultorio.",
}

export const RANGES = {
  title: "Rangos con los que se entrenó",
  note: "El modelo solo vio valores dentro de estos rangos. Fuera de ellos no tiene datos: cada evaluación lo avisa junto a su resultado.",
  columns: { variable: "Variable", min: "Mínimo", max: "Máximo" },
}

export const PROCEDURE = {
  title: "Estimación del procedimiento",
  notAMetric: "No es una métrica del modelo entregado.",
}

const DETAIL_UNAVAILABLE = "El detalle por nivel no está disponible"
// Map y no un objeto literal: un motivo como "toString" no debe resolverse por el prototipo.
const DETAIL_REASONS = new Map<string, string>([
  ["training_metrics_missing", `${DETAIL_UNAVAILABLE}: falta el archivo con los resultados del entrenamiento.`],
  ["training_metrics_invalid", `${DETAIL_UNAVAILABLE}: el archivo con los resultados del entrenamiento no se pudo leer.`],
  ["training_metrics_mismatch", `${DETAIL_UNAVAILABLE}: el archivo con los resultados no corresponde al modelo en uso y por eso no se muestra.`],
])

// Un motivo que el backend añada después se muestra con su código: nunca se oculta.
export function detailUnavailable(reason: string | null): string {
  if (reason === null) return `${DETAIL_UNAVAILABLE}.`
  return DETAIL_REASONS.get(reason) ?? `${DETAIL_UNAVAILABLE} (${reason}).`
}
