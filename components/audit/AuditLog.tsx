"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ApiError } from "@/lib/api/errors"
import type { AuditEntry, AuditFilters, Page } from "@/lib/api/types"
import { AUDIT_ENTITY_TYPES, AUDIT_FILTER_KEYS, auditDateLabel, validateAuditFilters } from "@/lib/audit-validation"
import { describeError } from "@/lib/error-messages"
import { validationMessage } from "@/lib/validation-messages"
import { AUDIT_PAGE_SIZE, listAuditLog } from "@/services/audit-log"
import { ErrorNotice, FieldError, Loading, Pager } from "@/components/ui/Notices"

const EMPTY = { action: "", entity_type: "", entity_id: "", actor_user_id: "", from: "", to: "" }
const LABELS: Record<keyof AuditFilters, string> = { action: "Acción", entity_type: "Tipo de entidad", entity_id: "ID de entidad", actor_user_id: "ID de actor", from: "Desde (incluido)", to: "Hasta (excluido)" }
const HEADERS = ["Fecha y hora", "ID de actor", "Acción", "Tipo de entidad", "ID de entidad", "ID de solicitud", "Resultado", "Campos modificados"]

// Error de query, separado del reparto de errores de body que usan las escrituras.
function queryErrors(error: unknown) {
  const fields: Record<string, string> = {}
  const form: string[] = []
  if (error instanceof ApiError && error.status === 422) {
    for (const detail of error.details) {
      const key = detail.loc[0] === "query" ? detail.loc[1] : null
      const message = validationMessage(detail.type)
      if (typeof key === "string" && AUDIT_FILTER_KEYS.some((field) => field === key)) fields[key] ??= message
      else form.push(message)
    }
  }
  return { fields, form }
}

function AuditRows({ items }: { items: AuditEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="mb-3 text-left text-lg font-bold">Registros de auditoría</caption>
        <thead><tr>{HEADERS.map((label) => <th key={label} scope="col" className="border border-[#d9e1e5] p-3 text-left">{label}</th>)}</tr></thead>
        <tbody>
          {items.map((entry, index) => (
            <tr key={`${entry.request_id ?? "null"}:${index}`}>
              <td className="border border-[#d9e1e5] p-3"><time dateTime={entry.created_at}>{auditDateLabel(entry.created_at)}</time></td>
              {[entry.actor_user_id, entry.action, entry.entity_type, entry.entity_id, entry.request_id, entry.outcome].map((value, column) => <td key={column} className="break-all border border-[#d9e1e5] p-3">{value ?? "null"}</td>)}
              <td className="border border-[#d9e1e5] p-3">{entry.changed_fields === null ? "null" : <ul className="m-0 list-none p-0">{entry.changed_fields.map((key, i) => <li key={`${key}:${i}`}>{key}</li>)}</ul>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Solo se monta para administrador. Lectura por servicio; no resuelve ids ni persiste filas.
export function AuditLog() {
  const [draft, setDraft] = useState(EMPTY)
  const [filters, setFilters] = useState<AuditFilters>({})
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [localFields, setLocalFields] = useState<Record<string, string>>({})
  const [isEditing, setIsEditing] = useState(false)
  const [result, setResult] = useState<{ key: string; data: Page<AuditEntry> | null; error: unknown } | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const key = JSON.stringify([filters, offset, attempt])

  useEffect(() => {
    let active = true
    listAuditLog(filters, offset).then(
      (data) => { if (active) setResult({ key, data, error: null }) },
      (error) => { if (active) setResult({ key, data: null, error }) },
    )
    return () => { active = false }
  }, [filters, offset, key])

  const isLoading = result?.key !== key
  const data = isLoading ? null : result?.data
  const error = isLoading ? null : result?.error
  const serverErrors = useMemo(() => queryErrors(error), [error])
  const fields = useMemo(() => ({ ...(isEditing ? {} : serverErrors.fields), ...localFields }), [isEditing, serverErrors, localFields])
  useEffect(() => {
    if (isLoading) return
    const first = Object.keys(fields)[0]
    const input = first ? form.current?.elements.namedItem(first) : null
    if (input instanceof HTMLElement) input.focus()
  }, [fields, isLoading])

  function apply(event: React.FormEvent) {
    event.preventDefault()
    if (isLoading) return
    const validated = validateAuditFilters(draft)
    setLocalFields(Object.fromEntries(Object.entries(validated.errors).map(([field, type]) => [field, validationMessage(type)])))
    if (Object.keys(validated.errors).length > 0) return
    setFilters(validated.filters)
    setOffset(0)
    setIsEditing(false)
    setAttempt((n) => n + 1)
  }

  function clear() {
    setDraft(EMPTY)
    setFilters({})
    setLocalFields({})
    setIsEditing(false)
    setOffset(0)
    setAttempt((n) => n + 1)
  }

  const described = error ? describeError(error) : null
  if (described && serverErrors.form.length > 0) described.message = serverErrors.form.join(" ")
  const edit = (field: keyof AuditFilters, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setIsEditing(true)
    setLocalFields({})
  }
  const hint = (field: keyof AuditFilters) => field === "from" || field === "to" ? "Fecha y hora con zona, por ejemplo 2026-10-03T10:00:00-05:00."
    : field === "action" ? "Formato entidad.accion; hasta 100 caracteres."
    : field === "entity_id" || field === "actor_user_id" ? "UUID, sin nombres ni documentos." : ""

  return (
    <>
      <p className="eyebrow">Administración</p>
      <h1 className="page-title">Auditoría</h1>
      <p className="muted">Consulta acciones e identificadores. Solo lectura. Los filtros se combinan y los registros más recientes aparecen primero.</p>
      <section className="card mt-6 p-5 sm:p-7">
        <form ref={form} aria-label="Filtros de auditoría" onSubmit={apply} noValidate>
          <fieldset disabled={isLoading} className="m-0 grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2">
            {AUDIT_FILTER_KEYS.map((field) => (
              <div key={field}>
                <label className="label" htmlFor={`audit-${field}`}>{LABELS[field]}</label>
                {field === "entity_type" ? <select className="select" id={`audit-${field}`} name={field} value={draft[field]} onChange={(e) => edit(field, e.target.value)} aria-invalid={Boolean(fields[field])} aria-describedby={fields[field] ? `audit-${field}-error` : undefined}>
                  <option value="">Todas</option>{AUDIT_ENTITY_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select> : <input className="input" id={`audit-${field}`} name={field} type="text" autoComplete="off" value={draft[field]} onChange={(e) => edit(field, e.target.value)} aria-invalid={Boolean(fields[field])} aria-describedby={`audit-${field}-hint${fields[field] ? ` audit-${field}-error` : ""}`} />}
                {hint(field) && <p id={`audit-${field}-hint`} className="m-0 mt-1 text-xs text-[#60727d]">{hint(field)}</p>}
                {fields[field] && <div id={`audit-${field}-error`}><FieldError message={fields[field]} /></div>}
              </div>
            ))}
            <div className="flex gap-3 sm:col-span-2"><button className="btn-primary disabled:opacity-60" type="submit">Aplicar filtros</button><button className="btn-secondary" type="button" onClick={clear}>Limpiar filtros</button></div>
          </fieldset>
        </form>
      </section>
      <section className="card mt-6 p-5 sm:p-7" aria-label="Resultado de auditoría" aria-busy={isLoading}>
        {isLoading ? <Loading>Cargando la auditoría…</Loading> : described ? <ErrorNotice error={described}><button type="button" className="btn-secondary" onClick={() => setAttempt((n) => n + 1)}>Reintentar</button></ErrorNotice>
          : data && (data.items.length === 0 ? <p role="status">No hay registros para esta consulta.</p> : <AuditRows items={data.items} />)}
        <p className="mt-3 text-xs text-[#60727d]">null indica que el registro no tiene ese dato. Los identificadores se muestran sin resolver.</p>
        <Pager offset={offset} hasMore={data?.has_more ?? false} pageSize={AUDIT_PAGE_SIZE} isBusy={isLoading || Boolean(error)} onChange={setOffset} />
      </section>
    </>
  )
}
