// Texto por `type` de un detalle de 422 (gynfem-backend/docs/API_SPEC.md §2.5).
// La API envía solo `loc` y `type`, nunca un mensaje ni el valor: este catálogo
// nombra la regla que falló, sin números. Los límites que el médico ve salen de
// /prediction/schema, no de aquí.
// Map y no un objeto literal: un tipo como "toString" no debe resolverse por el prototipo.
const MESSAGES = new Map<string, string>([
  ["missing", "Campo obligatorio."],
  ["greater_than_equal", "El valor está por debajo del mínimo admitido."],
  ["less_than_equal", "El valor está por encima del máximo admitido."],
  ["float_type", "Debe ser un número."],
  ["int_type", "Debe ser un número entero."],
  ["finite_number", "Debe ser un número finito."],
  ["string_type", "Debe ser un texto."],
  ["institution_name_length", "El nombre no tiene la longitud admitida."],
  ["control_character", "El nombre no admite caracteres de control, de formato ni separadores de línea."],
  ["date_range_inverted", "La fecha inicial no puede ser posterior a la final."],
  ["timezone_aware", "Indica una fecha y hora válida con zona horaria."],
  ["uuid_parsing", "Indica un UUID válido."],
  ["string_pattern_mismatch", "La acción debe tener el formato entidad.accion, en minúsculas y con guiones bajos."],
  ["extra_forbidden", "Campo no admitido."],
  ["literal_error", "Opción no admitida."],
  ["diastolic_not_below_systolic", "La presión diastólica debe ser menor que la sistólica."],
  ["measured_at_in_future", "La hora de la medición no puede ser futura."],
  ["name_format", "Solo letras, espacios, guion o apóstrofo."],
  ["document_number_format", "El número no tiene el formato de su tipo de documento."],
  ["document_pair_required", "El tipo y el número de documento van juntos."],
  ["single_search_criterion", "Usa un solo criterio de búsqueda."],
  ["search_criterion_required", "Indica un documento o un nombre más preciso."],
  ["empty_update", "Indica al menos un campo."],
  ["null_field", "Un campo no puede quedar vacío."],
  ["password_length", "La contraseña no tiene la longitud admitida."],
  ["email_format", "El correo no tiene un formato válido."],
  ["string_too_long", "El texto es demasiado largo."],
  ["json_invalid", "La solicitud no se pudo leer."],
])

export const UNKNOWN_VALIDATION_MESSAGE = "Valor no válido."

export function validationMessage(type: string): string {
  return MESSAGES.get(type) ?? UNKNOWN_VALIDATION_MESSAGE
}
