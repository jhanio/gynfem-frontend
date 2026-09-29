import { screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { MEDICO_EMAIL, loginAs, openPatientFile, renderApp } from "./helpers"

const IN_RANGE: Record<string, string> = {
  "Edad": "32", "Temperatura": "36.7", "Frecuencia cardíaca": "78", "Presión sistólica": "118",
  "Presión diastólica": "76", "IMC": "24.1", "Hemoglobina glicosilada": "5.4", "Glucosa en ayunas": "92",
}

type User = Awaited<ReturnType<typeof renderApp>>

async function openQuickAssessment() {
  const user = await renderApp()
  await loginAs(user, MEDICO_EMAIL)
  await user.click(await screen.findByRole("button", { name: "Evaluación rápida" }))
  await screen.findByLabelText("Edad")
  return user
}

async function fill(user: User, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    const input = screen.getByLabelText(label)
    await user.clear(input)
    await user.type(input, value)
  }
}

const submitButton = () => screen.getByRole("button", { name: /Calcular riesgo|Calculando/ })

describe("evaluación de riesgo (F5)", () => {
  test("el botón se habilita solo con todos los campos completos y válidos", async () => {
    const user = await openQuickAssessment()
    expect(submitButton()).toBeDisabled()
    const allButAge = Object.fromEntries(Object.entries(IN_RANGE).filter(([label]) => label !== "Edad"))
    await fill(user, allButAge)
    expect(submitButton()).toBeDisabled()
    await fill(user, { Edad: "32" })
    expect(submitButton()).toBeEnabled()
  })

  test("un valor imposible se marca y bloquea el envío", async () => {
    const user = await openQuickAssessment()
    await fill(user, { ...IN_RANGE, Edad: "130" })
    expect(screen.getByLabelText("Edad")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText(/Valor imposible/)).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  test("un valor fuera del rango de entrenamiento avisa pero permite enviar", async () => {
    const user = await openQuickAssessment()
    await fill(user, { ...IN_RANGE, Edad: "80" })
    expect(screen.getByLabelText("Edad")).toHaveAttribute("aria-invalid", "false")
    expect(screen.getByText(/Fuera del rango de entrenamiento/)).toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
  })

  test("una diastólica mayor o igual que la sistólica muestra una alerta y bloquea el envío", async () => {
    const user = await openQuickAssessment()
    await fill(user, { ...IN_RANGE, "Presión diastólica": "118" })
    expect(screen.getByRole("alert")).toHaveTextContent("La presión diastólica debe ser menor que la sistólica")
    expect(submitButton()).toBeDisabled()
  })

  test("el resultado muestra porcentajes redondeados y el descargo clínico", async () => {
    const user = await openQuickAssessment()
    await fill(user, { ...IN_RANGE, "Edad": "80", "Temperatura": "39.5" })
    await user.click(submitButton())
    expect(await screen.findByRole("heading", { name: "Riesgo Moderado" }, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText(/Bajo 24% · Moderado 58% · Alto 18%/)).toBeInTheDocument()
    expect(screen.queryByText(/57\.99/)).not.toBeInTheDocument()
    expect(screen.getByText(/Extrapolación: Edad, Temperatura/)).toBeInTheDocument()
    expect(screen.getAllByText(/no sustituye el criterio profesional/).length).toBeGreaterThan(1)
  })
})

describe("texto honesto sobre el registro (F6, hallazgo 5)", () => {
  test("con paciente, no promete registrar la evaluación en la ficha", async () => {
    const user = await renderApp()
    await loginAs(user, MEDICO_EMAIL)
    await openPatientFile(user)
    await user.click(screen.getByRole("button", { name: "Nueva evaluación" }))
    await screen.findByLabelText("Edad")
    expect(screen.queryByText(/Se registrará/)).not.toBeInTheDocument()
    expect(screen.getByText(/modo simulado la evaluación no se guarda/)).toBeInTheDocument()
  })
})

describe("el resultado nunca queda desfasado de los valores en pantalla (R1, R2)", () => {
  test("R2: editar un valor tras calcular retira el resultado anterior", async () => {
    const user = await openQuickAssessment()
    await fill(user, IN_RANGE)
    await user.click(submitButton())
    expect(await screen.findByRole("heading", { name: "Riesgo Bajo" }, { timeout: 2000 })).toBeInTheDocument()
    await fill(user, { "Presión sistólica": "180" })
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })

  test("R1: pasar de la evaluación de una paciente a la rápida no arrastra valores ni resultado", async () => {
    const user = await renderApp()
    await loginAs(user, MEDICO_EMAIL)
    await openPatientFile(user)
    await user.click(screen.getByRole("button", { name: "Nueva evaluación" }))
    await screen.findByLabelText("Edad")
    await fill(user, IN_RANGE)
    await user.click(submitButton())
    await screen.findByRole("heading", { name: "Riesgo Bajo" }, { timeout: 2000 })
    await user.click(screen.getByRole("button", { name: "Evaluación rápida" }))
    expect(await screen.findByText(/Modo rápido/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
    expect(await screen.findByLabelText("Edad")).toHaveValue(null)
  })
})

describe("la tarjeta del resultado declara que es simulado (R3)", () => {
  test("lleva su propia marca de simulado y no cita un modelo real", async () => {
    const user = await openQuickAssessment()
    await fill(user, IN_RANGE)
    await user.click(submitButton())
    const heading = await screen.findByRole("heading", { name: "Riesgo Bajo" }, { timeout: 2000 })
    const card = heading.closest("section")!
    expect(card).toHaveTextContent(/RESULTADO SIMULADO/)
    expect(card).toHaveTextContent(/no usar para decisiones clínicas/)
    expect(card).toHaveTextContent(/Modelo SIMULADO/)
    expect(card).not.toHaveTextContent(/GynFem-RC/)
  })
})

describe("un cálculo en curso no publica un resultado para valores ya editados (R2b)", () => {
  test("editar mientras se calcula descarta la respuesta que llega después", async () => {
    const user = await openQuickAssessment()
    await fill(user, IN_RANGE)
    await user.click(submitButton())
    const age = screen.getByLabelText("Edad")
    await user.clear(age)
    await user.type(age, "33")
    await new Promise((r) => setTimeout(r, 800))
    expect(screen.queryByRole("heading", { name: /^Riesgo / })).not.toBeInTheDocument()
  })
})
