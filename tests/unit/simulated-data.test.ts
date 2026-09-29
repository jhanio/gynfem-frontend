import { describe, expect, test } from "vitest"
import { listUsers, searchPatients } from "@/services/clinical"

// Ceros seguidos de un sufijo corto: un formato que ninguna persona real tiene.
const OBVIOUSLY_FICTITIOUS = /^0+\d{1,2}$/
// El despliegue es público (Fase 14, Decisión 7): ningún nombre simulado puede
// parecer el de una persona real, así que todos lo declaran en el propio texto.
const DECLARED_FICTITIOUS_NAME = /Fictici[ao]|Ejemplo/
// .test es un dominio reservado (RFC 2606): ningún correo simulado puede existir.
const RESERVED_EMAIL_DOMAIN = /@[a-z0-9-]+\.test$/

describe("datos simulados (T11, hallazgo 9)", () => {
  test("todo documento de paciente simulado es evidentemente ficticio", async () => {
    const patients = await searchPatients("", "name")
    expect(patients.length).toBeGreaterThan(0)
    for (const p of patients) expect(p.documentNumber).toMatch(OBVIOUSLY_FICTITIOUS)
  })

  test("todo nombre de paciente simulada declara que es ficticio", async () => {
    const patients = await searchPatients("", "name")
    for (const p of patients) expect(`${p.names} ${p.surnames}`).toMatch(DECLARED_FICTITIOUS_NAME)
  })

  test("todo usuario simulado tiene nombre declarado ficticio y correo en un dominio reservado", async () => {
    const { users } = await listUsers(1, 100)
    expect(users.length).toBeGreaterThan(0)
    for (const u of users) {
      expect(u.name).toMatch(DECLARED_FICTITIOUS_NAME)
      expect(u.email).toMatch(RESERVED_EMAIL_DOMAIN)
    }
  })
})
