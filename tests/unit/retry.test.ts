import { describe, expect, test, vi } from "vitest"
import { ApiError } from "@/lib/api/errors"
import { READ_RETRY_DELAYS_MS, retryRead } from "@/lib/api/retry"

const transient = () => new ApiError({ status: 503, code: "database_unavailable", message: "" })

describe("retryRead (decisión C)", () => {
  test("los intervalos son 1 s y 3 s", () => expect(READ_RETRY_DELAYS_MS).toEqual([1000, 3000]))

  test("reintenta un fallo transitorio y devuelve el primer éxito, esperando 1 s y 3 s", async () => {
    const sleep = vi.fn(async (ms: number) => { void ms })
    let calls = 0
    const result = await retryRead(async () => { calls++; if (calls < 3) throw transient(); return "ok" }, sleep)
    expect(result).toBe("ok")
    expect(calls).toBe(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 3000])
  })

  test("tras dos reintentos fallidos propaga el último error (3 llamadas en total)", async () => {
    let calls = 0
    await expect(retryRead(async () => { calls++; throw transient() }, async () => {})).rejects.toMatchObject({ code: "database_unavailable" })
    expect(calls).toBe(3)
  })

  test.each([401, 403, 404, 422, 500])("un %i no se reintenta", async (status) => {
    let calls = 0
    await expect(retryRead(async () => { calls++; throw new ApiError({ status, code: "x", message: "" }) }, async () => {})).rejects.toMatchObject({ status })
    expect(calls).toBe(1)
  })
})
