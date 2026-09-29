import { beforeEach, describe, expect, test, vi } from "vitest"

type Services = typeof import("@/services/clinical")
let svc: Services

beforeEach(async () => {
  vi.resetModules()
  svc = await import("@/services/clinical")
})

describe("listUsers (T10, B3)", () => {
  test("pagina con USERS_PAGE_SIZE y devuelve el total", async () => {
    for (let i = 0; i < svc.USERS_PAGE_SIZE; i++) {
      svc.createUser({ email: `u${i}@gynfem.test`, name: `Cuenta ${i}`, role: "Médico", password: "x".repeat(12) })
    }
    const total = 3 + svc.USERS_PAGE_SIZE
    const first = await svc.listUsers(1)
    const second = await svc.listUsers(2)
    expect(first).toMatchObject({ total })
    expect(first.users).toHaveLength(svc.USERS_PAGE_SIZE)
    expect(second.users).toHaveLength(total - svc.USERS_PAGE_SIZE)
  })
})
