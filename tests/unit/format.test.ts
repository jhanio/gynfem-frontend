import { describe, expect, test } from "vitest"
import { formatProbability } from "@/lib/format"

describe("formatProbability (T2, hallazgo 1)", () => {
  test.each([
    [0.58, "58%"],
    [0.04, "4%"],
    [0.7, "70%"],
    [0.08, "8%"],
    [0, "0%"],
    [1, "100%"],
  ])("%f → %s", (p, text) => {
    expect(formatProbability(p)).toBe(text)
  })
})
