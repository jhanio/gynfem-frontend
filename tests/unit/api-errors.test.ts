import { describe, expect, test } from "vitest"
import { ApiError, isOutcomeUnknown, isTransient, parseErrorResponse, splitValidation } from "@/lib/api/errors"

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } })

describe("parseErrorResponse: formato uniforme de la API (API_SPEC §2.5)", () => {
  test("conserva estado, código, mensaje, request_id y details", async () => {
    const error = await parseErrorResponse(json(422, { error: { code: "validation_error", message: "La solicitud no es válida.", request_id: "abc-1", details: [{ loc: ["body", "temperature_c"], type: "less_than_equal" }] } }))
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, code: "validation_error", message: "La solicitud no es válida.", requestId: "abc-1" })
    expect(error.details).toEqual([{ loc: ["body", "temperature_c"], type: "less_than_equal" }])
  })

  test("sin request_id en el cuerpo usa la cabecera X-Request-ID", async () => {
    const error = await parseErrorResponse(json(404, { error: { code: "patient_not_found", message: "Paciente no encontrada." } }, { "X-Request-ID": "hdr-9" }))
    expect(error.requestId).toBe("hdr-9")
  })

  test.each([
    ["texto plano", new Response("Bad Gateway", { status: 502 })],
    ["JSON con otra forma", json(500, { detail: "boom" })],
    ["JSON con error que no es objeto", json(500, { error: "boom" })],
  ])("un cuerpo que no es el formato uniforme (%s) no rompe ni se muestra", async (_name, response) => {
    const error = await parseErrorResponse(response)
    expect(error.code).toBe("http_error")
    expect(error.status).toBe(response.status)
    expect(error.message).not.toMatch(/boom|Bad Gateway/)
  })
})

describe("clasificación de fallos (decisión C)", () => {
  const of = (status: number, code: string) => new ApiError({ status, code, message: "" })

  test.each([[0, "network_error"], [0, "timeout"], [502, "upstream_unreachable"], [503, "database_unavailable"], [504, "upstream_timeout"]])(
    "%i %s es transitorio", (status, code) => expect(isTransient(of(status, code))).toBe(true))

  test.each([[400, "http_error"], [401, "invalid_token"], [403, "forbidden"], [404, "not_found"], [409, "patient_already_exists"], [422, "validation_error"], [500, "internal_error"]])(
    "%i %s no es transitorio", (status, code) => expect(isTransient(of(status, code))).toBe(false))

  test("un error que no es ApiError no es transitorio", () => expect(isTransient(new Error("x"))).toBe(false))

  test.each([[0, "network_error"], [0, "timeout"], [502, "upstream_unreachable"], [504, "upstream_timeout"]])(
    "tras %i %s no se sabe si una escritura se aplicó", (status, code) => expect(isOutcomeUnknown(of(status, code))).toBe(true))

  test.each([[503, "database_unavailable"], [422, "validation_error"], [409, "patient_already_exists"], [500, "internal_error"]])(
    "tras %i %s la escritura no se aplicó", (status, code) => expect(isOutcomeUnknown(of(status, code))).toBe(false))
})

describe("splitValidation: cada error va a su campo (decisión 6)", () => {
  test("loc [body, campo] se asocia al campo; loc [body] va al formulario", () => {
    const error = new ApiError({ status: 422, code: "validation_error", message: "La solicitud no es válida.", details: [
      { loc: ["body", "temperature_c"], type: "less_than_equal" },
      { loc: ["body"], type: "diastolic_not_below_systolic" },
    ] })
    const { fields, form } = splitValidation(error)
    expect(Object.keys(fields)).toEqual(["temperature_c"])
    expect(fields.temperature_c).toMatch(/máximo/)
    expect(form).toHaveLength(1)
    expect(form[0]).toMatch(/diastólica/)
  })

  test("un 422 sin details (weak_password) usa el mensaje del servidor en su campo", () => {
    const error = new ApiError({ status: 422, code: "weak_password", message: "La contraseña no cumple la política del servicio de autenticación." })
    expect(splitValidation(error)).toEqual({ fields: { password: "La contraseña no cumple la política del servicio de autenticación." }, form: [] })
  })

  test("un 422 sin details ni campo conocido (user_rejected) va al formulario", () => {
    const error = new ApiError({ status: 422, code: "user_rejected", message: "El servicio de autenticación rechazó los datos del usuario." })
    expect(splitValidation(error)).toEqual({ fields: {}, form: ["El servicio de autenticación rechazó los datos del usuario."] })
  })

  test("dos errores del mismo campo conservan el primero", () => {
    const error = new ApiError({ status: 422, code: "validation_error", message: "", details: [
      { loc: ["body", "name"], type: "missing" }, { loc: ["body", "name"], type: "string_type" },
    ] })
    expect(splitValidation(error).fields.name).toMatch(/obligatorio/)
  })

  test("un tipo desconocido da un texto genérico, nunca el tipo crudo", () => {
    const error = new ApiError({ status: 422, code: "validation_error", message: "", details: [{ loc: ["body", "x"], type: "tipo_nuevo_del_backend" }] })
    expect(splitValidation(error).fields.x).toBe("Valor no válido.")
  })

  test("un error que no es 422 no produce errores de campo", () => {
    expect(splitValidation(new ApiError({ status: 409, code: "patient_already_exists", message: "Ya hay…" }))).toEqual({ fields: {}, form: [] })
  })
})
