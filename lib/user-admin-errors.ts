// Map y no un objeto literal: un código como "toString" no debe resolverse por el prototipo.
const MESSAGES = new Map<string, string>([
  ["EMAIL_EXISTS", "El correo ya está registrado."],
  ["PASSWORD_REJECTED", "La contraseña fue rechazada. Usa entre 12 y 72 caracteres."],
  ["LAST_ADMIN", "No se puede desactivar al último administrador activo."],
  ["USER_NOT_FOUND", "El usuario ya no existe. Actualiza la lista."],
])

export const UNKNOWN_ERROR_MESSAGE = "No se pudo completar la operación. Inténtalo de nuevo."

export function userAdminErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ""
  return MESSAGES.get(code) ?? UNKNOWN_ERROR_MESSAGE
}
