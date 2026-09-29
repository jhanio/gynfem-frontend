import { describe, expect, test } from "vitest"
import { searchPatients } from "@/services/clinical"

// Ceros seguidos de un sufijo corto: un formato que ninguna persona real tiene.
const OBVIOUSLY_FICTITIOUS = /^0+\d{1,2}$/

describe("datos simulados (T11, hallazgo 9)", () => {
  test("todo documento de paciente simulado es evidentemente ficticio", async () => {
    const patients = await searchPatients("", "name")
    expect(patients.length).toBeGreaterThan(0)
    for (const p of patients) expect(p.documentNumber).toMatch(OBVIOUSLY_FICTITIOUS)
  })
})
