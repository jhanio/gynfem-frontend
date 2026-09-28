import { describe, expect, test } from "vitest"
import { resolveSimulatedRole } from "@/services/clinical"

describe("resolveSimulatedRole (T1, solo modo simulado)", () => {
  test.each([
    ["admin@gynfem.test", "Administrador"],
    ["ADMIN@gynfem.test", "Administrador"],
    ["ana.morales@gynfem.test", "Médico"],
    ["soporte@gynfem.test", "Médico"],
  ])("%s → %s", (email, role) => {
    expect(resolveSimulatedRole(email)).toBe(role)
  })
})
