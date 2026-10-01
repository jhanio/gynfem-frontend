"use client"

import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { isOutcomeUnknown, splitValidation } from "@/lib/api/errors"
import type { DocumentType, Patient, PatientInput } from "@/lib/api/types"
import { type DescribedError, UNKNOWN_OUTCOME_MESSAGE, describeError } from "@/lib/error-messages"
import { createPatient, updatePatient } from "@/services/patients"
import { ErrorNotice, FieldError, StatusNotice } from "@/components/ui/Notices"
import { DOCUMENT_TYPES } from "./document-types"

type Props = { patient?: Patient; onSaved: (patient: Patient) => void; onCancel: () => void }

const EMPTY: PatientInput = { document_type: "DNI", document_number: "", given_names: "", family_names: "" }

// PATCH admite solo los campos que cambian; tipo y número de documento van juntos.
function changesOf(original: Patient, form: PatientInput): Partial<PatientInput> {
  const changes: Partial<PatientInput> = {}
  if (form.given_names !== original.given_names) changes.given_names = form.given_names
  if (form.family_names !== original.family_names) changes.family_names = form.family_names
  if (form.document_type !== original.document_type || form.document_number !== original.document_number) {
    changes.document_type = form.document_type
    changes.document_number = form.document_number
  }
  return changes
}

// Registro (HU003) y edición (HU004) de la identidad mínima de una paciente.
export function PatientForm({ patient, onSaved, onCancel }: Props) {
  const [form, setForm] = useState<PatientInput>(patient ?? EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<DescribedError | null>(null)
  const [notice, setNotice] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const isEditing = patient !== undefined

  const set = (field: keyof PatientInput, value: string) => setForm({ ...form, [field]: value })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice("")
    setFieldErrors({})
    const changes = isEditing ? changesOf(patient, form) : form
    if (Object.keys(changes).length === 0) {
      setNotice("No hay cambios que guardar.")
      return
    }
    setIsSaving(true)
    try {
      onSaved(isEditing ? await updatePatient(patient.id, changes) : await createPatient(form))
    } catch (caught) {
      const { fields, form: formErrors } = splitValidation(caught)
      setFieldErrors(fields)
      if (isOutcomeUnknown(caught)) setError({ ...describeError(caught), message: UNKNOWN_OUTCOME_MESSAGE })
      else if (formErrors.length > 0) setError({ message: formErrors.join(" "), reference: null })
      else if (Object.keys(fields).length === 0) setError(describeError(caught))
    } finally {
      setIsSaving(false)
    }
  }

  const text = (field: "document_number" | "given_names" | "family_names", label: string) => (
    <div>
      <label className="label" htmlFor={`patient-${field}`}>{label}</label>
      <input
        className={`input ${fieldErrors[field] ? "border-[#c53d3d]" : ""}`} id={`patient-${field}`} autoComplete="off"
        value={form[field]} onChange={(e) => set(field, e.target.value)} aria-invalid={Boolean(fieldErrors[field])}
      />
      <FieldError message={fieldErrors[field]} />
    </div>
  )

  return (
    <>
      <button type="button" className="mb-6 flex items-center gap-2 text-sm font-bold text-[#0f5962]" onClick={onCancel}>
        <ArrowLeft className="size-4" />{isEditing ? "Volver a la ficha" : "Volver a pacientes"}
      </button>
      <div className="mb-8">
        <p className="eyebrow">Gestión clínica</p>
        <h1 className="page-title">{isEditing ? "Editar datos de la paciente" : "Registrar paciente"}</h1>
        <p className="muted">Identidad mínima: documento, nombres y apellidos.</p>
      </div>
      <section className="card p-5 sm:p-7">
        <form className="grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
          <div>
            <label className="label" htmlFor="patient-document_type">Tipo de documento</label>
            <select className="select" id="patient-document_type" value={form.document_type} onChange={(e) => set("document_type", e.target.value as DocumentType)} aria-invalid={Boolean(fieldErrors.document_type)}>
              {DOCUMENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <FieldError message={fieldErrors.document_type} />
          </div>
          {text("document_number", "Número de documento")}
          {text("given_names", "Nombres")}
          {text("family_names", "Apellidos")}
          <div className="flex flex-col gap-3 sm:col-span-2">
            {error && <ErrorNotice error={error} />}
            {notice && <StatusNotice>{notice}</StatusNotice>}
            <div className="flex gap-3">
              <button className="btn-primary disabled:opacity-60" disabled={isSaving}>{isSaving ? "Guardando…" : isEditing ? "Guardar cambios" : "Registrar paciente"}</button>
              <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
            </div>
          </div>
        </form>
      </section>
    </>
  )
}
