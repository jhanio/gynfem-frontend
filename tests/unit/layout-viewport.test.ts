import { describe, expect, test } from "vitest"
import { viewport } from "@/app/layout"

describe("viewport (T13, hallazgo 6)", () => {
  test("no impide ampliar la página (WCAG 1.4.4)", () => {
    expect(viewport.userScalable).not.toBe(false)
    expect(viewport.maximumScale ?? Infinity).toBeGreaterThanOrEqual(2)
  })
})
