import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const allDependencies = { ...pkg.dependencies, ...pkg.devDependencies }
const EXACT_VERSION = /^\d+\.\d+\.\d+$/

describe("package.json", () => {
  test.each(Object.entries(allDependencies))("%s usa una versión exacta (sin latest, ^ ni ~)", (_name, version) => {
    expect(version).toMatch(EXACT_VERSION)
  })

  test("typescript está fijado en la serie 5.x estable (5.9.3)", () => {
    expect(pkg.devDependencies.typescript).toBe("5.9.3")
  })
})
