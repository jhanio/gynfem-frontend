import { describe, expect, test } from "vitest"
import { ApiError } from "@/lib/api/errors"
import { FORBIDDEN_MESSAGE, SESSION_EXPIRED_MESSAGE, UNKNOWN_ERROR_MESSAGE, UNKNOWN_OUTCOME_MESSAGE, describeError } from "@/lib/error-messages"
import { fieldLabel } from "@/lib/field-labels"
import { formatDateTime, formatNumber, formatProbability } from "@/lib/format"
import { riskLabel } from "@/lib/risk"

const error = (status: number, code: string, message = "Mensaje del servidor.", requestId: string | null = "ref-1") =>
  new ApiError({ status, code, message, requestId })

describe("describeError: manejo uniforme de errores", () => {
  test.each([
    [404, "patient_not_found", "Paciente no encontrada."],
    [409, "patient_already_exists", "Ya hay una paciente activa con ese documento."],
    [409, "last_active_admin", "No se puede dejar el sistema sin un administrador activo."],
    [503, "database_unavailable", "La base de datos no está disponible."],
    [401, "invalid_credentials", "Correo o contraseña incorrectos."],
  ])("%i %s muestra el mensaje de la API, sin reinterpretarlo", (status, code, message) => {
    expect(describeError(error(status, code, message)).message).toBe(message)
  })

  test.each(["invalid_token", "token_expired", "not_authenticated"])("401 %s se explica como sesión expirada, sin jerga de tokens", (code) => {
    expect(describeError(error(401, code, "El token de acceso no es válido.")).message).toBe(SESSION_EXPIRED_MESSAGE)
  })

  test("403 account_disabled muestra el motivo de la API", () => {
    expect(describeError(error(403, "account_disabled", "La cuenta no está habilitada para operar.")).message).toBe("La cuenta no está habilitada para operar.")
  })

  test("403 forbidden dice que no hay permiso, sin revelar si el recurso existe (decisión 5)", () => {
    const described = describeError(error(403, "forbidden", "No tiene permiso para esta operación."))
    expect(described.message).toBe(FORBIDDEN_MESSAGE)
    expect(described.message).not.toMatch(/paciente|usuario|existe/i)
  })

  test.each([[500, "internal_error"], [500, "http_error"], [400, "http_error"], [413, "http_error"]])(
    "%i %s da un mensaje genérico", (status, code) => {
      expect(describeError(error(status, code, "Error interno del servidor.")).message).toBe(UNKNOWN_ERROR_MESSAGE)
    })

  test("un fallo de red y una espera agotada se explican como tales", () => {
    expect(describeError(error(0, "network_error")).message).toMatch(/conectar/)
    expect(describeError(error(0, "timeout")).message).toMatch(/tardó demasiado/)
    expect(describeError(error(504, "upstream_timeout")).message).toMatch(/tardó demasiado/)
  })

  test("lleva el código de referencia (X-Request-ID) cuando lo hay", () => {
    expect(describeError(error(503, "database_unavailable")).reference).toBe("ref-1")
    expect(describeError(error(0, "network_error", "", null)).reference).toBeNull()
  })

  test("un error que no es de la API da el mensaje genérico, nunca su texto", () => {
    const described = describeError(new TypeError("Cannot read properties of undefined"))
    expect(described).toEqual({ message: UNKNOWN_ERROR_MESSAGE, reference: null })
  })

  test("el aviso de resultado desconocido pide comprobar antes de repetir", () => {
    expect(UNKNOWN_OUTCOME_MESSAGE).toMatch(/No sabemos si/)
  })
})

describe("etiquetas y formato", () => {
  test("cada campo del contrato tiene etiqueta en español", () => {
    expect(fieldLabel("temperature_c")).toBe("Temperatura")
    expect(fieldLabel("hba1c_percent")).toBe("Hemoglobina glicosilada")
  })
  test("un campo nuevo del esquema se muestra con su nombre, no se oculta", () => {
    expect(fieldLabel("campo_nuevo")).toBe("campo_nuevo")
    expect(fieldLabel("toString")).toBe("toString")
  })
  test("riskLabel traduce el nivel de riesgo", () => {
    expect([riskLabel("high"), riskLabel("mid"), riskLabel("low")]).toEqual(["Alto", "Moderado", "Bajo"])
  })
  test("formatProbability redondea sin artefactos de coma flotante", () => {
    expect(formatProbability(0.58)).toBe("58%")
    expect(formatProbability(0.695)).toBe("70%")
  })
  test("formatNumber muestra como mucho dos decimales", () => {
    expect(formatNumber(33.888888888888886)).toBe("33.89")
    expect(formatNumber(40)).toBe("40")
    expect(formatNumber(14.9)).toBe("14.9")
  })
  test("formatDateTime muestra fecha y hora; un valor ilegible se muestra tal cual", () => {
    expect(formatDateTime("2026-09-26T01:21:37.045038Z")).toMatch(/2026/)
    expect(formatDateTime("no-es-fecha")).toBe("no-es-fecha")
  })
})
