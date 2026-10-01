"use client"

import { useState } from "react"
import { AlertCircle, Search, UserPlus } from "lucide-react"
import { splitValidation } from "@/lib/api/errors"
import type { DocumentType, Page, PatientSummary } from "@/lib/api/types"
import { type DescribedError, describeError } from "@/lib/error-messages"
import { PATIENTS_PAGE_SIZE, type SearchCriterion, searchPatients } from "@/services/patients"
import { ErrorNotice, Pager, StatusNotice } from "@/components/ui/Notices"
import { DOCUMENT_TYPES } from "./document-types"

type Props = { notice?: string; onSelect: (patientId: string) => void; onRegister: () => void; onQuick: () => void }

const CRITERION_ERROR_ID = "patient-search-criterion-error"

const modeClass = (isActive: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm font-bold ${isActive ? "bg-white text-[#0f5962] shadow-sm" : "text-[#60727d]"}`

// La API no tiene listado general de pacientes: todo parte de una búsqueda con
// exactamente un criterio (documento exacto o nombre).
export function PatientSearch({ notice, onSelect, onRegister, onQuick }: Props) {
  const [mode, setMode] = useState<"document" | "name">("document")
  const [documentType, setDocumentType] = useState<DocumentType>("DNI")
  const [query, setQuery] = useState("")
  const [criterion, setCriterion] = useState<SearchCriterion | null>(null)
  const [page, setPage] = useState<Page<PatientSummary> | null>(null)
  const [error, setError] = useState<DescribedError | null>(null)
  const [criterionError, setCriterionError] = useState("")
  const [isSearching, setIsSearching] = useState(false)

  async function load(next: SearchCriterion, offset: number) {
    setError(null)
    setCriterionError("")
    setIsSearching(true)
    try {
      setPage(await searchPatients(next, offset))
      setCriterion(next)
    } catch (caught) {
      // Un 422 habla del criterio escrito (p. ej. formato del documento, nombre
      // demasiado corto): el texto de la regla va junto al campo. Lo demás, abajo.
      const { fields, form } = splitValidation(caught)
      const validation = [...Object.values(fields), ...form][0]
      if (validation) setCriterionError(validation)
      else setError(describeError(caught))
      setPage(null)
    } finally {
      setIsSearching(false)
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const text = query.trim()
    void load(mode === "document" ? { kind: "document", documentType, documentNumber: text } : { kind: "name", name: text }, 0)
  }

  function changeMode(next: "document" | "name") {
    setMode(next)
    setPage(null)
    setError(null)
    setCriterionError("")
  }

  function changeQuery(value: string) {
    setQuery(value)
    setCriterionError("")
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Gestión clínica</p>
          <h1 className="page-title">Pacientes</h1>
          <p className="muted">Busca una paciente para consultar su ficha y registrar una evaluación.</p>
        </div>
        <button type="button" className="btn-primary flex items-center justify-center gap-2" onClick={onRegister}><UserPlus className="size-4" />Registrar paciente</button>
      </div>
      {notice && <div className="mb-5"><StatusNotice>{notice}</StatusNotice></div>}
      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2"><Search className="size-5 text-[#0f5962]" /><h2 className="m-0 text-lg font-bold">Buscar paciente</h2></div>
        <div className="mb-5 flex rounded-lg bg-[#f1f5f5] p-1">
          <button type="button" onClick={() => changeMode("document")} className={modeClass(mode === "document")}>Documento exacto</button>
          <button type="button" onClick={() => changeMode("name")} className={modeClass(mode === "name")}>Nombre</button>
        </div>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-start" onSubmit={handleSubmit}>
          {mode === "document" && (
            <select className="select sm:w-44" aria-label="Tipo de documento" value={documentType} onChange={(e) => { setDocumentType(e.target.value as DocumentType); setCriterionError("") }}>
              {DOCUMENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          )}
          <div className="flex-1">
            <input
              className={`input ${criterionError ? "border-[#c53d3d]" : ""}`} aria-label="Criterio de búsqueda" value={query} onChange={(e) => changeQuery(e.target.value)}
              placeholder={mode === "document" ? "Número de documento" : "Nombre o apellido"}
              aria-invalid={Boolean(criterionError)} aria-describedby={criterionError ? CRITERION_ERROR_ID : undefined}
            />
            {criterionError && (
              <p id={CRITERION_ERROR_ID} role="alert" className="mt-1 flex items-center gap-1 text-xs text-[#b42318]"><AlertCircle className="size-3" />{criterionError}</p>
            )}
          </div>
          <button className="btn-primary disabled:opacity-60" disabled={isSearching || query.trim() === ""}>{isSearching ? "Buscando…" : "Buscar"}</button>
        </form>
        {error && <div className="mt-5"><ErrorNotice error={error} /></div>}
        {page && criterion && (
          <div className="mt-6 flex flex-col gap-2">
            {page.items.map((patient) => (
              <button type="button" key={patient.id} onClick={() => onSelect(patient.id)} className="flex items-center justify-between rounded-lg border border-[#d9e1e5] p-4 text-left hover:bg-[#f1f5f5]">
                <span>
                  <strong>{patient.given_names} {patient.family_names}</strong>
                  <span className="block text-sm text-[#60727d]">{patient.document_type} · {patient.document_number_masked}</span>
                </span>
                <span className="text-[#0f5962]">Ver ficha →</span>
              </button>
            ))}
            {page.items.length === 0 && (
              <div>
                <p className="muted">No encontramos pacientes con esos datos.</p>
                <button type="button" className="btn-secondary mt-3" onClick={onRegister}>Registrar paciente</button>
              </div>
            )}
            {(page.offset > 0 || page.has_more) && (
              <div className="mt-3 flex justify-end">
                <Pager offset={page.offset} hasMore={page.has_more} pageSize={PATIENTS_PAGE_SIZE} isBusy={isSearching} onChange={(offset) => void load(criterion, offset)} />
              </div>
            )}
          </div>
        )}
      </section>
      <section className="mt-6 rounded-xl border border-[#b9d2d3] bg-[#eef7f6] p-5">
        <h2 className="m-0 text-base font-bold">¿Necesitas una evaluación sin paciente?</h2>
        <p className="muted mt-1">Úsala para una orientación rápida. No se registra ni guarda información.</p>
        <button type="button" className="btn-secondary mt-3" onClick={onQuick}>Iniciar evaluación rápida</button>
      </section>
    </>
  )
}
