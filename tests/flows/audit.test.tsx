import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, test } from "vitest"
import type { AuditEntry } from "@/lib/api/types"
import { mockBff } from "../msw/bff"
import { ADMIN, AUDIT_ENTRIES, MEDICA, uniformError } from "../msw/fixtures"
import { server } from "../msw/server"
import { renderApp } from "./helpers"

const TABLE = "Registros de auditoría"
const LABELS = { action: "Acción", entity_type: "Tipo de entidad", entity_id: "ID de entidad", actor_user_id: "ID de actor", from: "Desde (incluido)", to: "Hasta (excluido)" }
const table = () => screen.getByRole("table", { name: TABLE })
const rows = () => within(table()).getAllByRole("row").slice(1)
const next = () => screen.getByRole("button", { name: "Siguiente" })
const previous = () => screen.getByRole("button", { name: "Anterior" })
const queries = (calls: string[]) => calls.filter((call) => call === "GET /api/v1/audit-log")

async function openAudit(audit: AuditEntry[] = AUDIT_ENTRIES) {
  const bff = mockBff({ signedIn: ADMIN, audit })
  const user = await renderApp()
  await user.click(await screen.findByRole("button", { name: "Auditoría" }))
  await waitFor(() => expect(screen.queryByText("Cargando la auditoría…")).not.toBeInTheDocument())
  await screen.findByRole("form", { name: "Filtros de auditoría" })
  return { bff, user }
}

describe("auditoría: acceso, datos y privacidad", () => {
  test("el administrador ve Auditoría y el GET inicial usa tamaño fijo 20 y offset cero", async () => {
    const { bff } = await openAudit()
    expect(screen.getByRole("heading", { level: 1, name: "Auditoría" })).toBeVisible()
    expect(queries(bff.calls)).toHaveLength(1)
    expect(rows()).toHaveLength(20)
    expect(previous()).toBeDisabled()
    expect(next()).toBeEnabled()
  })

  test("médico no ve el destino ni la pantalla al navegar", async () => {
    const bff = mockBff({ signedIn: MEDICA })
    const user = await renderApp()
    await screen.findByRole("button", { name: "Pacientes" })
    for (const destination of ["Evaluación rápida", "Métricas del modelo", "Pacientes"]) {
      await user.click(screen.getByRole("button", { name: destination }))
      expect(screen.queryByRole("button", { name: "Auditoría" })).not.toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: "Auditoría" })).not.toBeInTheDocument()
      expect(screen.queryByRole("table", { name: TABLE })).not.toBeInTheDocument()
    }
    expect(queries(bff.calls)).toEqual([])
  })

  test("ocho columnas, null explícitos y claves sin valores; ignora propiedades extra sensibles", async () => {
    const entry = {
      ...AUDIT_ENTRIES[0], created_at: "2026-10-03T08:15:23.123456-05:00", actor_user_id: null,
      entity_id: null, request_id: null, action: "system_setting.update", entity_type: "system_setting", changed_fields: ["institution_name"],
      id: 987654321, patient_name: "Paciente Ficticia Reservada", document: "DOCUMENTO_FICTICIO_RESERVADO",
      clinical_value: "VALOR_CLINICO_RESERVADO", institution_name: "VALOR_CONFIGURACION_RESERVADO",
    }
    const { bff } = await openAudit([entry, { ...AUDIT_ENTRIES[1], changed_fields: null }])
    expect(within(table()).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Fecha y hora", "ID de actor", "Acción", "Tipo de entidad", "ID de entidad", "ID de solicitud", "Resultado", "Campos modificados"])
    const cells = within(rows()[0]).getAllByRole("cell")
    expect(cells).toHaveLength(8)
    expect(cells.map((cell) => cell.textContent)).toEqual(["2026-10-03 08:15:23.123456-05:00", "null", "system_setting.update", "system_setting", "null", "null", "success", "institution_name"])
    expect(within(rows()[1]).getAllByRole("cell")[7]).toHaveTextContent(/^null$/)
    for (const value of [entry.patient_name, entry.document, entry.clinical_value, entry.institution_name, String(entry.id)]) expect(document.body.textContent).not.toContain(value)
    expect(within(table()).queryByRole("link")).not.toBeInTheDocument()
    expect(bff.calls.filter((call) => /patients|predictions|evaluations|measurements/.test(call))).toEqual([])
  })

  test("conserva exactamente el orden recibido, también con empates temporales", async () => {
    const tied = [AUDIT_ENTRIES[2], AUDIT_ENTRIES[0], AUDIT_ENTRIES[1]].map((entry) => ({ ...entry, created_at: "2026-10-03T10:00:00.123456Z" }))
    await openAudit(tied)
    expect(rows().map((row) => within(row).getAllByRole("cell")[5].textContent)).toEqual(tied.map((entry) => entry.request_id))
    expect(within(rows()[0]).getAllByRole("cell")[0]).toHaveTextContent("2026-10-03 10:00:00.123456 UTC")
    expect(screen.queryByText(/total|de \d+ registros/i)).not.toBeInTheDocument()
  })
})

describe("auditoría: filtros", () => {
  test.each([
    ["action", "user.create"], ["entity_type", "prediction"],
    ["entity_id", AUDIT_ENTRIES[0].entity_id!], ["actor_user_id", MEDICA.id],
    ["from", "2026-09-30T10:10:00Z"], ["to", "2026-09-30T10:10:00Z"],
  ] as const)("filtro %s se envía por su clave contractual", async (key, value) => {
    const { user } = await openAudit()
    let query: Record<string, string> | null = null
    server.use(http.get("*/api/v1/audit-log", ({ request }) => { query = Object.fromEntries(new URL(request.url).searchParams); return HttpResponse.json({ items: [], limit: 20, offset: 0, has_more: false }) }))
    fireEvent.change(screen.getByLabelText(LABELS[key]), { target: { value } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    await screen.findByText("No hay registros para esta consulta.")
    expect(query).toEqual({ limit: "20", offset: "0", [key]: value })
  })

  test("combina los seis filtros con AND y conserva + codificado como %2B", async () => {
    const entry = AUDIT_ENTRIES[0]
    const { user } = await openAudit()
    let search = ""
    server.use(http.get("*/api/v1/audit-log", ({ request }) => { search = new URL(request.url).search; return HttpResponse.json({ items: [entry], limit: 20, offset: 0, has_more: false }) }))
    const filters = { action: entry.action, entity_type: entry.entity_type, entity_id: entry.entity_id!, actor_user_id: entry.actor_user_id!, from: "2026-09-30T00:00:00+00:00", to: "2026-10-01T00:00:00+05:30" }
    for (const [key, value] of Object.entries(filters)) fireEvent.change(screen.getByLabelText(LABELS[key as keyof typeof LABELS]), { target: { value } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({ limit: "20", offset: "0", ...filters })
    expect(search).toContain("%2B00%3A00")
    expect(search).toContain("%2B05%3A30")
    expect(search).not.toMatch(/[+ ]|%20/)
  })

  test("from igual a to es válido y devuelve vacío", async () => {
    const { user, bff } = await openAudit()
    for (const key of ["from", "to"] as const) fireEvent.change(screen.getByLabelText(LABELS[key]), { target: { value: "2026-09-30T10:10:00Z" } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    expect(await screen.findByText("No hay registros para esta consulta.")).toBeVisible()
    expect(queries(bff.calls)).toHaveLength(2)
  })

  test("from inclusivo y to exclusivo filtran los registros reales del mock", async () => {
    const { user } = await openAudit()
    fireEvent.change(screen.getByLabelText(LABELS.from), { target: { value: AUDIT_ENTRIES[1].created_at } })
    fireEvent.change(screen.getByLabelText(LABELS.to), { target: { value: AUDIT_ENTRIES[0].created_at } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(within(rows()[0]).getAllByRole("cell")[5]).toHaveTextContent(AUDIT_ENTRIES[1].request_id!)
  })

  test.each([
    ["action", "Borrar todo", /entidad\.accion/], ["action", "a".repeat(101) + ".create", /entidad\.accion/],
    ["entity_id", "no-es-uuid", /UUID/], ["actor_user_id", "actor-ficticio", /UUID/],
    ["from", "2026-10-03T10:00:00", /zona horaria/], ["to", "2026-10-03", /zona horaria/],
    ["from", "2026-02-30T10:00:00Z", /zona horaria/],
  ] as const)("%s inválido produce error accesible sin otra petición", async (key, value, message) => {
    const { user, bff } = await openAudit()
    const input = screen.getByLabelText(LABELS[key])
    fireEvent.change(input, { target: { value } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription(message)
    expect(input).toHaveFocus()
    expect(queries(bff.calls)).toHaveLength(1)
  })

  test("from posterior a to se rechaza, incluso por un microsegundo", async () => {
    const { user, bff } = await openAudit()
    fireEvent.change(screen.getByLabelText(LABELS.from), { target: { value: "2026-10-03T10:00:00.000002Z" } })
    fireEvent.change(screen.getByLabelText(LABELS.to), { target: { value: "2026-10-03T10:00:00.000001Z" } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    expect(screen.getByLabelText(LABELS.from)).toHaveAccessibleDescription(/posterior/)
    expect(screen.getByLabelText(LABELS.to)).toHaveAttribute("aria-invalid", "true")
    expect(queries(bff.calls)).toHaveLength(1)
  })

  test("el selector de entidad contiene únicamente el catálogo contractual", async () => {
    await openAudit()
    expect(within(screen.getByLabelText(LABELS.entity_type)).getAllByRole("option").map((option) => (option as HTMLOptionElement).value)).toEqual(["", "patient", "clinical_measurement", "prediction", "user", "system_setting"])
  })

  test("Limpiar filtros vuelve a la primera página sin parámetros adicionales", async () => {
    const { user } = await openAudit()
    fireEvent.change(screen.getByLabelText(LABELS.action), { target: { value: "patient.create" } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    await waitFor(() => expect(rows()).toHaveLength(AUDIT_ENTRIES.filter((entry) => entry.action === "patient.create").length))
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }))
    await waitFor(() => expect(rows()).toHaveLength(20))
    expect(screen.getByLabelText(LABELS.action)).toHaveValue("")
    expect(previous()).toBeDisabled()
  })
})

describe("auditoría: paginación y estados", () => {
  test("Siguiente/Anterior usan offset y has_more, sin total; aplicar filtros reinicia offset", async () => {
    const { user } = await openAudit()
    await user.click(next())
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(next()).toBeDisabled()
    expect(previous()).toBeEnabled()
    expect(within(rows()[0]).getAllByRole("cell")[5]).toHaveTextContent(AUDIT_ENTRIES[20].request_id!)
    await user.click(previous())
    await waitFor(() => expect(rows()).toHaveLength(20))
    await user.click(next())
    await waitFor(() => expect(rows()).toHaveLength(3))
    fireEvent.change(screen.getByLabelText(LABELS.action), { target: { value: "patient.create" } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    await waitFor(() => expect(previous()).toBeDisabled())
    expect(rows().every((row) => within(row).getAllByRole("cell")[2].textContent === "patient.create")).toBe(true)
    expect(document.body.textContent).not.toMatch(/total|página \d+ de/i)
  })

  test("lista vacía y has_more false deshabilitan Siguiente", async () => {
    await openAudit([])
    expect(screen.getByText("No hay registros para esta consulta.")).toBeVisible()
    expect(next()).toBeDisabled()
    expect(screen.queryByRole("table", { name: TABLE })).not.toBeInTheDocument()
  })

  test("durante carga los paginadores están deshabilitados y no quedan filas obsoletas", async () => {
    const { user } = await openAudit()
    let finish!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => { finish = resolve })
    server.use(http.get("*/api/v1/audit-log", () => pending))
    try {
      await user.click(next())
      expect(await screen.findByText("Cargando la auditoría…")).toBeVisible()
      expect(next()).toBeDisabled()
      expect(previous()).toBeDisabled()
      expect(screen.queryByRole("table", { name: TABLE })).not.toBeInTheDocument()
    } finally { finish(HttpResponse.json({ items: [], limit: 20, offset: 20, has_more: false })) }
    await screen.findByText("No hay registros para esta consulta.")
  })

  test("503 de lectura muestra error y Reintentar recupera la consulta", async () => {
    const { user } = await openAudit()
    let fail = true
    server.use(http.get("*/api/v1/audit-log", () => fail
      ? HttpResponse.json(uniformError("database_unavailable", "Base de datos no disponible."), { status: 503 })
      : HttpResponse.json({ items: [AUDIT_ENTRIES[0]], limit: 20, offset: 0, has_more: false })))
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    const alert = await screen.findByRole("alert", {}, { timeout: 7000 })
    expect(alert).toHaveTextContent("Base de datos no disponible.")
    expect(alert).toHaveTextContent("ref-ficticia-1")
    expect(screen.queryByRole("table", { name: TABLE })).not.toBeInTheDocument()
    fail = false
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }))
    await screen.findByRole("table", { name: TABLE })
  })

  test("422 de query se asocia a su filtro y ofrece corrección", async () => {
    const { user } = await openAudit()
    server.use(http.get("*/api/v1/audit-log", () => HttpResponse.json(uniformError("validation_error", "La solicitud no es válida.", [{ loc: ["query", "entity_id"], type: "uuid_parsing" }]), { status: 422 })))
    fireEvent.change(screen.getByLabelText(LABELS.entity_id), { target: { value: AUDIT_ENTRIES[0].entity_id! } })
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }))
    await waitFor(() => expect(screen.getByLabelText(LABELS.entity_id)).toHaveAttribute("aria-invalid", "true"))
    expect(screen.getByLabelText(LABELS.entity_id)).toHaveAccessibleDescription(/UUID/)
    expect(screen.getByLabelText(LABELS.entity_id)).toHaveFocus()
  })
})
