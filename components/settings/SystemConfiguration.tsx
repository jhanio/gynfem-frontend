"use client"

import { useEffect, useRef, useState } from "react"
import { isOutcomeUnknown, splitValidation } from "@/lib/api/errors"
import type { Setting, SettingsChange, SystemSettings } from "@/lib/api/types"
import { type DescribedError, describeError, UNKNOWN_OUTCOME_MESSAGE } from "@/lib/error-messages"
import { formatDateTimeWithZone } from "@/lib/format"
import { HISTORY_PAGE_SIZE_MAX, HISTORY_PAGE_SIZE_MIN, INSTITUTION_NAME_MAX, validateHistoryPageSize, validateInstitutionName } from "@/lib/settings-validation"
import { validationMessage } from "@/lib/validation-messages"
import { getSettings, updateSettings } from "@/services/settings"
import { ErrorNotice, FieldError, Loading, StatusNotice } from "@/components/ui/Notices"
import { useLoad } from "@/components/ui/use-load"

function Metadata({ setting }: { setting: Setting<string | number> }) {
  return (
    <div className="mt-2 text-xs text-[#60727d]">
      <p className="m-0">Valor por defecto: {setting.default}</p>
      {setting.updated_at === null ? <p className="m-0 mt-1">Sin cambios guardados.</p> : (
        <>
          <p className="m-0 mt-1">Última actualización: {formatDateTimeWithZone(setting.updated_at)}</p>
          <p className="m-0 mt-1">Actualizado por: {setting.updated_by ?? "No disponible"}</p>
        </>
      )}
    </div>
  )
}

// Se monta con una lectura confirmada. Una comprobación explícita lo desmonta
// mientras relee; una escritura solo cambia el estado con su respuesta 200.
function SettingsEditor({ initial, onCheck }: { initial: SystemSettings; onCheck: () => void }) {
  const [confirmed, setConfirmed] = useState(initial)
  const [name, setName] = useState(initial.institution_name.value)
  const [pageSize, setPageSize] = useState(String(initial.history_default_page_size.value))
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<DescribedError | null>(null)
  const [notice, setNotice] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isUnknown, setIsUnknown] = useState(false)
  const inFlight = useRef(false)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (isSaving) return
    const first = Object.keys(fields)[0]
    if (!first) return
    const input = form.current?.elements.namedItem(first)
    if (input instanceof HTMLInputElement) input.focus()
  }, [fields, isSaving])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (inFlight.current || isUnknown) return
    setError(null)
    setNotice("")
    setFields({})
    const institution = validateInstitutionName(name)
    const size = validateHistoryPageSize(pageSize)
    const invalid: Record<string, string> = {}
    if (institution.error !== undefined) invalid.institution_name = validationMessage(institution.error)
    if (size.error !== undefined) invalid.history_default_page_size = validationMessage(size.error)
    if (Object.keys(invalid).length > 0) { setFields(invalid); return }
    const changes: SettingsChange = {}
    if (institution.value !== confirmed.institution_name.value) changes.institution_name = institution.value
    if (size.value !== confirmed.history_default_page_size.value) changes.history_default_page_size = size.value
    if (Object.keys(changes).length === 0) { setNotice("No hay cambios que guardar."); return }
    inFlight.current = true
    setIsSaving(true)
    try {
      const result = await updateSettings(changes)
      setConfirmed(result)
      setName(result.institution_name.value)
      setPageSize(String(result.history_default_page_size.value))
      setNotice("Configuración guardada.")
    } catch (caught) {
      const { fields: errors, form: general } = splitValidation(caught)
      setFields(errors)
      if (isOutcomeUnknown(caught)) {
        setIsUnknown(true)
        setError({ ...describeError(caught), message: UNKNOWN_OUTCOME_MESSAGE })
      } else if (general.length > 0) setError({ message: general.join(" "), reference: null })
      else if (Object.keys(errors).length === 0) setError(describeError(caught))
    } finally {
      inFlight.current = false
      setIsSaving(false)
    }
  }

  const field = (key: keyof SystemSettings, label: string, value: string, set: (value: string) => void, hint: string) => (
    <div>
      <label className="label" htmlFor={`settings-${key}`}>{label}</label>
      <input id={`settings-${key}`} name={key} className="input" type="text" autoComplete="off"
        inputMode={key === "history_default_page_size" ? "numeric" : "text"}
        value={value} onChange={(event) => { set(event.target.value); setNotice("") }}
        aria-invalid={Boolean(fields[key])} aria-describedby={`settings-${key}-hint${fields[key] ? ` settings-${key}-error` : ""}`} />
      <p id={`settings-${key}-hint`} className="m-0 mt-1 text-xs text-[#60727d]">{hint}</p>
      {fields[key] && <div id={`settings-${key}-error`}><FieldError message={fields[key]} /></div>}
      <Metadata setting={confirmed[key]} />
    </div>
  )

  return (
    <form ref={form} aria-label="Parámetros del sistema" onSubmit={handleSubmit} noValidate>
      <fieldset disabled={isSaving || isUnknown} className="m-0 grid min-w-0 gap-6 border-0 p-0">
        {field("institution_name", "Nombre de la institución", name, setName, `Entre 1 y ${INSTITUTION_NAME_MAX} caracteres. Se utiliza en los reportes nuevos.`)}
        {field("history_default_page_size", "Evaluaciones por página del historial", pageSize, setPageSize, `Número entero entre ${HISTORY_PAGE_SIZE_MIN} y ${HISTORY_PAGE_SIZE_MAX}. Se utiliza al consultar el historial.`)}
        <div><button type="submit" className="btn-primary disabled:opacity-60" disabled={isSaving || isUnknown}>{isSaving ? "Guardando…" : "Guardar cambios"}</button></div>
      </fieldset>
      <div className="mt-4 flex flex-col gap-3">
        {error && <ErrorNotice error={error}>{isUnknown && <button type="button" className="btn-secondary" onClick={onCheck}>Comprobar estado actual</button>}</ErrorNotice>}
        {notice && <StatusNotice>{notice}</StatusNotice>}
      </div>
    </form>
  )
}

// App solo monta esta pantalla para administrador; la API vuelve a autorizar.
export function SystemConfiguration() {
  const settings = useLoad(getSettings, "system-settings")
  return (
    <>
      <p className="eyebrow">Administración</p>
      <h1 className="page-title">Configuración</h1>
      <p className="muted">Ajusta el nombre de la institución y el tamaño de página del historial. Los cambios se aplican desde la siguiente petición.</p>
      <section className="card mt-6 p-5 sm:p-7">
        {settings.isLoading ? <Loading>Cargando la configuración…</Loading> : settings.error ? (
          <ErrorNotice error={settings.error}><button type="button" className="btn-secondary" onClick={settings.reload}>Reintentar</button></ErrorNotice>
        ) : settings.data && <SettingsEditor initial={settings.data} onCheck={settings.reload} />}
      </section>
    </>
  )
}
