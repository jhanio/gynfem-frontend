import { screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, test } from "vitest"
import type { Patient } from "@/lib/api/types"
import { mockBff } from "../msw/bff"
import { PATIENT, uniformError } from "../msw/fixtures"
import { server } from "../msw/server"
import { MEDICA, openPatientFile, renderApp } from "./helpers"

const many = (count: number): Patient[] => Array.from({ length: count }, (_, i) => ({
  ...PATIENT, id: `77777777-7777-4777-8777-${String(i).padStart(12, "0")}`,
  document_number: `FICTICIO${String(i).padStart(3, "0")}`, family_names: `Ejemplo ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? "a" : ""}`,
}))

async function start(options: Parameters<typeof mockBff>[0] = {}) {
  const bff = mockBff({ signedIn: MEDICA, ...options })
  const user = await renderApp()
  await screen.findByRole("heading", { level: 1, name: "Pacientes" })
  return { bff, user }
}

describe("búsqueda de pacientes (sin listado general)", () => {
  test("al entrar no se pide ninguna paciente: la pantalla gira en torno a la búsqueda", async () => {
    const { bff } = await start()
    expect(bff.calls.filter((c) => c.includes("/patients"))).toEqual([])
    expect(screen.queryByRole("button", { name: /Ver ficha/ })).not.toBeInTheDocument()
  })

  test("por documento exige el tipo y muestra el documento enmascarado", async () => {
    const { user } = await start()
    await user.selectOptions(screen.getByLabelText("Tipo de documento"), "PASAPORTE")
    await user.type(screen.getByLabelText("Criterio de búsqueda"), "FICTICIO001")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    const result = await screen.findByRole("button", { name: /Ver ficha/ })
    expect(result).toHaveTextContent("Paciente Ficticia Ejemplo Uno")
    expect(result).toHaveTextContent("********001")
    expect(result).not.toHaveTextContent("FICTICIO001")
  })

  test("sin resultados lo dice y ofrece registrar a la paciente", async () => {
    const { user } = await start()
    await user.click(screen.getByRole("button", { name: "Nombre" }))
    await user.type(screen.getByLabelText("Criterio de búsqueda"), "inexistente")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    expect(await screen.findByText("No encontramos pacientes con esos datos.")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Registrar paciente" }).length).toBeGreaterThan(0)
  })

  test("pagina con has_more: Siguiente pide la página siguiente y Anterior vuelve", async () => {
    const { user } = await start({ patients: many(25) })
    await user.click(screen.getByRole("button", { name: "Nombre" }))
    await user.type(screen.getByLabelText("Criterio de búsqueda"), "ficticia")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Ver ficha/ })).toHaveLength(20))
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Siguiente" }))
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Ver ficha/ })).toHaveLength(5))
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Anterior" }))
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Ver ficha/ })).toHaveLength(20))
  })

  test("un 422 del servidor se muestra junto al criterio, con el texto de su regla", async () => {
    const { user } = await start()
    server.use(http.post("*/api/v1/patients/search", () => HttpResponse.json(uniformError("validation_error", "La solicitud no es válida.", [{ loc: ["body"], type: "search_criterion_required" }]), { status: 422 })))
    await user.click(screen.getByRole("button", { name: "Nombre" }))
    await user.type(screen.getByLabelText("Criterio de búsqueda"), "ab")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Indica un documento o un nombre más preciso.")
  })
})

describe("registro de paciente (HU003)", () => {
  async function fillPatient(user: Awaited<ReturnType<typeof start>>["user"], document: string) {
    await user.click(screen.getAllByRole("button", { name: "Registrar paciente" })[0])
    await screen.findByRole("heading", { level: 1, name: "Registrar paciente" })
    await user.selectOptions(screen.getByLabelText("Tipo de documento"), "PASAPORTE")
    await user.type(screen.getByLabelText("Número de documento"), document)
    await user.type(screen.getByLabelText("Nombres"), "Paciente Ficticia")
    await user.type(screen.getByLabelText("Apellidos"), "Sintetica Nueva")
    await user.click(screen.getByRole("button", { name: "Registrar paciente" }))
  }

  test("al registrar abre la ficha de la paciente creada", async () => {
    const { bff, user } = await start()
    await fillPatient(user, "FICTICIO999")
    expect(await screen.findByRole("heading", { level: 1, name: "Paciente Ficticia Sintetica Nueva" })).toBeInTheDocument()
    expect(bff.calls.filter((c) => c === "POST /api/v1/patients")).toHaveLength(1)
  })

  test("un documento ya registrado (409) muestra el mensaje de la API y conserva el formulario", async () => {
    const { user } = await start()
    await fillPatient(user, "FICTICIO001")
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una paciente activa con ese documento.")
    expect(screen.getByLabelText("Nombres")).toHaveValue("Paciente Ficticia")
  })

  test("un 422 marca el campo que lo causó", async () => {
    const { user } = await start()
    server.use(http.post("*/api/v1/patients", () => HttpResponse.json(uniformError("validation_error", "La solicitud no es válida.", [{ loc: ["body", "document_number"], type: "document_number_format" }]), { status: 422 })))
    await fillPatient(user, "X")
    const input = await screen.findByLabelText("Número de documento")
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"))
    expect(screen.getByText("El número no tiene el formato de su tipo de documento.")).toBeInTheDocument()
    expect(screen.getByLabelText("Nombres")).toHaveAttribute("aria-invalid", "false")
  })
})

describe("ficha de paciente (HU004)", () => {
  test("muestra los datos de GET /patients/{id} y avisa si aún no hay evaluaciones", async () => {
    const { user } = await start()
    await openPatientFile(user)
    expect(await screen.findByText("Aún no hay evaluaciones registradas.")).toBeInTheDocument()
    expect(screen.getByText(/PASAPORTE · FICTICIO001/)).toBeInTheDocument()
  })

  test("Volver a pacientes regresa al buscador", async () => {
    const { user } = await start()
    await openPatientFile(user)
    await user.click(screen.getByRole("button", { name: "Volver a pacientes" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
  })

  test("editar envía solo los campos cambiados y la ficha muestra el dato nuevo", async () => {
    const { bff, user } = await start()
    let body: unknown
    await openPatientFile(user)
    server.use(http.patch(`*/api/v1/patients/${PATIENT.id}`, async ({ request }) => {
      body = await request.json()
      const updated = { ...PATIENT, ...(body as object) }
      bff.patients.set(PATIENT.id, updated)
      return HttpResponse.json(updated)
    }))
    await user.click(screen.getByRole("button", { name: "Editar datos" }))
    const family = await screen.findByLabelText("Apellidos")
    await user.clear(family)
    await user.type(family, "Ejemplo Editada")
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Paciente Ficticia Ejemplo Editada" })).toBeInTheDocument()
    expect(body).toEqual({ family_names: "Ejemplo Editada" })
  })

  test("guardar sin cambios no llama al servidor", async () => {
    const { bff, user } = await start()
    await openPatientFile(user)
    await user.click(screen.getByRole("button", { name: "Editar datos" }))
    await user.click(await screen.findByRole("button", { name: "Guardar cambios" }))
    expect(await screen.findByRole("status")).toHaveTextContent("No hay cambios que guardar.")
    expect(bff.calls.filter((c) => c.startsWith("PATCH"))).toEqual([])
  })

  test("la baja pide confirmación, explica que es lógica y la paciente deja de aparecer en la búsqueda", async () => {
    const { bff, user } = await start()
    await openPatientFile(user)
    await user.click(screen.getByRole("button", { name: "Dar de baja" }))
    const confirmation = await screen.findByRole("alertdialog")
    expect(confirmation).toHaveTextContent(/Su historial se conserva/)
    expect(confirmation).toHaveTextContent(/no se puede deshacer/)
    expect(bff.calls.filter((c) => c.startsWith("DELETE"))).toEqual([])

    await user.click(within(confirmation).getByRole("button", { name: "Confirmar baja" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Pacientes" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Paciente dada de baja.")

    await user.selectOptions(screen.getByLabelText("Tipo de documento"), "PASAPORTE")
    await user.type(screen.getByLabelText("Criterio de búsqueda"), "FICTICIO001")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    expect(await screen.findByText("No encontramos pacientes con esos datos.")).toBeInTheDocument()
  })

  test("cancelar la baja no llama al servidor", async () => {
    const { bff, user } = await start()
    await openPatientFile(user)
    await user.click(screen.getByRole("button", { name: "Dar de baja" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(bff.calls.filter((c) => c.startsWith("DELETE"))).toEqual([])
  })

  test("si la ficha no carga (404), lo dice y permite volver", async () => {
    const { bff, user } = await start()
    await user.selectOptions(screen.getByLabelText("Tipo de documento"), "PASAPORTE")
    await user.type(screen.getByLabelText("Criterio de búsqueda"), "FICTICIO001")
    await user.click(screen.getByRole("button", { name: "Buscar" }))
    const result = await screen.findByRole("button", { name: /Ver ficha/ })
    bff.patients.clear()
    await user.click(result)
    expect(await screen.findByRole("alert")).toHaveTextContent("Paciente no encontrada.")
    expect(screen.getByRole("button", { name: "Volver a pacientes" })).toBeInTheDocument()
  })
})
