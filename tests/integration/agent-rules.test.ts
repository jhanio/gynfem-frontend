// @vitest-environment node
import { execFileSync, execSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { join, resolve } from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { server } from "../msw/server"

// `next dev` gestiona el bloque entre estos marcadores de CLAUDE.md y debe
// conservar todo lo demás: las reglas del proyecto (Fase 14). Estas pruebas
// arrancan `next dev` de verdad, no leen su documentación.
const BEGIN = "<!-- BEGIN:nextjs-agent-rules -->"
const END = "<!-- END:nextjs-agent-rules -->"
const ROOT = resolve(__dirname, "../..")
const NEXT_BIN = join(ROOT, "node_modules/next/dist/bin/next")
// Dentro del repositorio para que `next` se resuelva desde node_modules; ignorado por git.
const WORK_DIR = join(ROOT, ".agent-rules-test")
const STARTUP_TIMEOUT_MS = 90_000
const FETCH_TIMEOUT_MS = 15_000

const realClaudeMd = readFileSync(join(ROOT, "CLAUDE.md"), "utf8")

function splitAtBlock(content: string) {
  const start = content.indexOf(BEGIN)
  const end = content.indexOf(END)
  if (start === -1 || end === -1 || end < start) throw new Error("CLAUDE.md sin un bloque nextjs-agent-rules bien formado")
  return { before: content.slice(0, start), block: content.slice(start, end + END.length), after: content.slice(end + END.length) }
}

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const server = createServer()
    server.once("error", fail)
    server.listen(0, () => {
      const address = server.address()
      server.close(() => (typeof address === "object" && address ? ok(address.port) : fail(new Error("sin puerto"))))
    })
  })
}

// Un arranque completo: el bloque se escribe antes de que el servidor atienda
// peticiones, así que la primera respuesta HTTP garantiza que ya ocurrió.
async function startNextDevOnce(dir: string) {
  const port = await freePort()
  const child = spawn(process.execPath, [NEXT_BIN, "dev", "-p", String(port)], {
    cwd: dir,
    detached: process.platform !== "win32",
    env: { ...process.env, AI_AGENT: "gynfem-agent-rules-test", NEXT_TELEMETRY_DISABLED: "1" },
  })
  let log = ""
  let exitCode: number | null = null
  child.stdout.on("data", (d) => (log += d))
  child.stderr.on("data", (d) => (log += d))
  child.on("exit", (code) => (exitCode = code ?? -1))
  // `close` llega después de `exit` y del cierre de los streams heredados
  // por los hijos de Next. Registrar la espera antes de intentar detenerlo.
  const closed = new Promise<void>((ok, fail) => {
    child.once("error", fail)
    child.once("close", () => ok())
  })
  try {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    for (;;) {
      if (exitCode !== null) throw new Error(`next dev terminó con código ${exitCode}:\n${log}`)
      if (Date.now() > deadline) throw new Error(`next dev no respondió a tiempo:\n${log}`)
      try {
        // Con tiempo máximo: si la compilación se colgara, el finally seguiría matando el proceso.
        await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
        return log
      } catch {
        await new Promise((r) => setTimeout(r, 300))
      }
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      // Un cierre rechazado debe fallar: no significa que el proceso terminó.
      // /T detiene también el servidor que el CLI de Next crea con fork.
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "pipe" })
      else process.kill(-child.pid, "SIGKILL")
    }
    // El segundo arranque y afterAll solo pueden continuar tras el cierre.
    await closed
  }
}

// En Windows, next dev tarda un momento en soltar sus archivos tras detenerlo.
// Estas pruebas arrancan un `next dev` real y le hacen peticiones: aquí MSW no intercepta.
beforeAll(() => server.close())
// tests/setup.ts lo cierra al terminar el archivo, y cerrar dos veces falla.
afterAll(() => server.listen())

afterAll(() => rmSync(WORK_DIR, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }))

describe("CLAUDE.md del repositorio (Fase 14)", () => {
  test("tiene exactamente un bloque nextjs-agent-rules bien formado", () => {
    expect(realClaudeMd.split(BEGIN)).toHaveLength(2)
    expect(realClaudeMd.split(END)).toHaveLength(2)
    expect(() => splitAtBlock(realClaudeMd)).not.toThrow()
  })

  test("no existe AGENTS.md: con sus marcadores, next dev dejaría de actualizar el bloque de CLAUDE.md", () => {
    expect(existsSync(join(ROOT, "AGENTS.md"))).toBe(false)
  })

  test("git ignora AGENTS.md de forma permanente y versiona CLAUDE.md", () => {
    const isIgnored = (file: string) => {
      try {
        execSync(`git check-ignore -q --no-index ${file}`, { cwd: ROOT, stdio: "ignore" })
        return true
      } catch {
        return false
      }
    }
    expect(isIgnored("AGENTS.md")).toBe(true)
    expect(isIgnored("CLAUDE.md")).toBe(false)
  })

  test("las reglas del proyecto y la advertencia sobre AGENTS.md están fuera del bloque que gestiona Next", () => {
    const { before, block } = splitAtBlock(realClaudeMd)
    expect(before).toContain("## Despliegue (Fase 14)")
    expect(before).toContain("ADVERTENCIA — no crear `AGENTS.md`")
    expect(block).not.toContain("GynFem")
  })
})

// Proyecto mínimo con su propia configuración: sin ella, Next heredaría la del repositorio padre.
function createProject(name: string, files: Record<string, string>) {
  const dir = join(WORK_DIR, `${name}-${process.pid}`)
  mkdirSync(join(dir, "app"), { recursive: true })
  writeFileSync(join(dir, "next.config.mjs"), "export default {}\n")
  writeFileSync(join(dir, "app/layout.jsx"), "export default function L({ children }) { return <html><body>{children}</body></html> }\n")
  writeFileSync(join(dir, "app/page.jsx"), "export default function P() { return <p>prueba</p> }\n")
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content)
  return dir
}

// Bloque desactualizado a propósito: obliga a next dev a escribir.
const STALE_BLOCK = `${BEGIN}\nBLOQUE DESACTUALIZADO\n${END}`

describe("next dev conserva lo que está fuera de los marcadores (arranque real)", () => {
  test("dos arranques: el bloque se actualiza y el texto de fuera no cambia", { timeout: 2 * STARTUP_TIMEOUT_MS + 30_000 }, async () => {
    const original = splitAtBlock(realClaudeMd)
    const dir = createProject("sin-agents", { "CLAUDE.md": `${original.before}${STALE_BLOCK}${original.after}` })

    const log = await startNextDevOnce(dir)
    const afterFirst = readFileSync(join(dir, "CLAUDE.md"), "utf8")
    expect(log).toContain("Generated CLAUDE.md")
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false)
    expect(splitAtBlock(afterFirst).block).not.toContain("BLOQUE DESACTUALIZADO")
    expect(splitAtBlock(afterFirst).before).toBe(original.before)
    expect(splitAtBlock(afterFirst).after).toBe(original.after)

    await startNextDevOnce(dir)
    const afterSecond = readFileSync(join(dir, "CLAUDE.md"), "utf8")
    expect(splitAtBlock(afterSecond).before).toBe(splitAtBlock(afterFirst).before)
    expect(splitAtBlock(afterSecond).after).toBe(splitAtBlock(afterFirst).after)
    expect(afterSecond).toBe(afterFirst)
  })

  // Fija el comportamiento que describe la advertencia de CLAUDE.md. Si Next lo
  // cambia, esta prueba falla y hay que revisar la advertencia.
  test("con un AGENTS.md que tiene el bloque, next dev lo prefiere y no toca CLAUDE.md", { timeout: STARTUP_TIMEOUT_MS + 30_000 }, async () => {
    const original = splitAtBlock(realClaudeMd)
    const claudeMd = `${original.before}${STALE_BLOCK}${original.after}`
    const dir = createProject("con-agents", { "AGENTS.md": `${STALE_BLOCK}\n`, "CLAUDE.md": claudeMd })

    const log = await startNextDevOnce(dir)
    expect(log).toContain("Generated AGENTS.md")
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).not.toContain("BLOQUE DESACTUALIZADO")
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe(claudeMd)
  })
})
