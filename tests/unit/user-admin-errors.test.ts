import { describe, expect, test } from "vitest"
import { UNKNOWN_ERROR_MESSAGE, userAdminErrorMessage } from "@/lib/user-admin-errors"

describe("userAdminErrorMessage", () => {
  test.each([
    ["EMAIL_EXISTS", "El correo ya está registrado."],
    ["PASSWORD_REJECTED", "La contraseña fue rechazada. Usa entre 12 y 72 caracteres."],
    ["LAST_ADMIN", "No se puede desactivar al último administrador activo."],
    ["USER_NOT_FOUND", "El usuario ya no existe. Actualiza la lista."],
  ])("%s tiene su propio mensaje", (code, message) => {
    expect(userAdminErrorMessage(new Error(code))).toBe(message)
  })

  test.each([new Error("BOOM"), "texto", undefined, new Error("toString")])("un error desconocido (%s) usa el mensaje genérico", (error) => {
    expect(userAdminErrorMessage(error)).toBe(UNKNOWN_ERROR_MESSAGE)
  })
})
