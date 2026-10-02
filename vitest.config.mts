import { availableParallelism } from "node:os"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Como mucho 4 procesos de prueba. Por defecto Vitest usa uno por CPU lógica
// menos una (11 en un portátil de 12 hilos y 8 núcleos): los seis archivos de
// tests/flows arrancan a la vez y la prueba de flujo más lenta tarda 8,1–8,5 s
// de sus 10 s (3 s sola), así que cualquier otra carga de la máquina la hace
// agotar el tiempo. Con 4 tarda 3,6–4,0 s y la suite completa dura lo mismo
// (≈52 s). Medido el 2026-10-02 en local. En CI (ubuntu-latest) no se ha medido
// cuántas CPU hay: el límite nunca supera las disponibles menos una, que es el
// valor por defecto de Vitest, así que allí no puede aumentar la concurrencia.
const MAX_TEST_WORKERS = 4

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 10_000,
    maxWorkers: Math.max(1, Math.min(MAX_TEST_WORKERS, availableParallelism() - 1)),
    coverage: {
      provider: "v8",
      include: ["services/**", "lib/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
