import { beforeEach, describe, expect, test, vi } from "vitest"

type Services = typeof import("@/services/clinical")
let svc: Services

// El estado simulado vive en el módulo: cada prueba importa una copia nueva.
beforeEach(async () => {
  vi.resetModules()
  svc = await import("@/services/clinical")
})

const IN_RANGE: Record<string, number> = { age: 32, temperature: 36.7, heartRate: 78, systolic: 118, diastolic: 76, bmi: 24.1, hba1c: 5.4, fastingGlucose: 92 }

async function valuesWithOutOfRange(count: number) {
  const fields = await svc.getClinicalFields()
  const values = { ...IN_RANGE }
  fields.slice(0, count).forEach((f) => { values[f.key] = f.min - 1 })
  return values
}

describe("maskDocument (T3)", () => {
  test("muestra solo los tres últimos dígitos", () => {
    expect(svc.maskDocument("12345678")).toBe("*****678")
  })
})

describe("evaluateClinical (T6)", () => {
  test.each([
    [0, "Bajo"], [1, "Bajo"], [2, "Moderado"], [3, "Moderado"], [4, "Alto"], [8, "Alto"],
  ])("con %i campos fuera de rango el riesgo es %s", async (count, risk) => {
    const result = await svc.evaluateClinical(await valuesWithOutOfRange(count))
    expect(result.risk).toBe(risk)
    expect(result.extrapolated).toHaveLength(count)
  })

  test("un valor exactamente en el límite del rango no es extrapolación", async () => {
    const fields = await svc.getClinicalFields()
    const atEdges = Object.fromEntries(fields.map((f, i) => [f.key, i % 2 ? f.min : f.max]))
    const result = await svc.evaluateClinical(atEdges)
    expect(result.extrapolated).toEqual([])
  })

  test("lista las etiquetas de los campos extrapolados", async () => {
    const fields = await svc.getClinicalFields()
    const result = await svc.evaluateClinical(await valuesWithOutOfRange(2))
    expect(result.extrapolated).toEqual([fields[0].label, fields[1].label])
  })

  test.each([0, 2, 4])("las probabilidades suman 1 y llevan el descargo clínico (%i fuera)", async (count) => {
    const result = await svc.evaluateClinical(await valuesWithOutOfRange(count))
    const { Bajo, Moderado, Alto } = result.probabilities
    expect(Bajo + Moderado + Alto).toBeCloseTo(1, 10)
    expect(result.disclaimer).toBe(svc.clinicalDisclaimer)
  })
})

describe("searchPatients (T7)", () => {
  test("por documento exige coincidencia exacta", async () => {
    expect((await svc.searchPatients("00000001", "document")).map((p) => p.id)).toEqual(["p-001"])
    expect(await svc.searchPatients("0000000", "document")).toEqual([])
  })

  test("por nombre busca un fragmento sin distinguir mayúsculas", async () => {
    expect((await svc.searchPatients("FICTICIA UNO", "name")).map((p) => p.id)).toEqual(["p-001"])
  })
})

describe("createUser (T8)", () => {
  const base = { name: "Nueva cuenta", role: "Médico" as const, password: "x".repeat(12) }

  test("rechaza un correo ya registrado aunque cambien mayúsculas o espacios", () => {
    expect(() => svc.createUser({ ...base, email: "  ADMIN@gynfem.test " })).toThrow("EMAIL_EXISTS")
  })

  test.each([11, 73])("rechaza una contraseña de %i caracteres", (length) => {
    expect(() => svc.createUser({ ...base, email: `p${length}@gynfem.test`, password: "x".repeat(length) })).toThrow("PASSWORD_REJECTED")
  })

  test.each([12, 72])("acepta una contraseña de %i caracteres", (length) => {
    expect(svc.createUser({ ...base, email: `p${length}@gynfem.test`, password: "x".repeat(length) }).active).toBe(true)
  })

  test("recorta correo y nombre y la cuenta aparece en el listado", async () => {
    const user = svc.createUser({ ...base, email: " nueva@gynfem.test ", name: " Nueva cuenta " })
    expect(user).toMatchObject({ email: "nueva@gynfem.test", name: "Nueva cuenta" })
    const { users, total } = await svc.listUsers(1)
    expect(total).toBe(4)
    expect(users.map((u) => u.email)).toContain("nueva@gynfem.test")
  })
})

describe("updateUser (T9)", () => {
  test("no permite desactivar al único administrador activo", () => {
    expect(() => svc.updateUser("u-002", { active: false })).toThrow("LAST_ADMIN")
  })

  test("permite desactivarlo si hay otro administrador activo", () => {
    svc.createUser({ email: "admin2@gynfem.test", name: "Otra admin", role: "Administrador", password: "x".repeat(12) })
    expect(svc.updateUser("u-002", { active: false }).active).toBe(false)
  })

  test("desactiva a un médico y el listado lo refleja", async () => {
    svc.updateUser("u-003", { active: false })
    const { users } = await svc.listUsers(1)
    expect(users.find((u) => u.id === "u-003")?.active).toBe(false)
  })

  test("falla con un id inexistente", () => {
    expect(() => svc.updateUser("no-existe", { active: false })).toThrow("USER_NOT_FOUND")
  })
})
