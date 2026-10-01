"use client"

import { useEffect, useRef, useState } from "react"
import { isOutcomeUnknown, splitValidation } from "@/lib/api/errors"
import type { Page, Role, User, UserInput } from "@/lib/api/types"
import { type DescribedError, UNKNOWN_OUTCOME_MESSAGE, describeError } from "@/lib/error-messages"
import { USERS_PAGE_SIZE, createUser, listUsers, setUserActive, updateUser } from "@/services/users"
import { ErrorNotice, FieldError, Loading, Pager, StatusNotice } from "@/components/ui/Notices"
import { useLoad } from "@/components/ui/use-load"

const EMPTY: UserInput = { email: "", full_name: "", role: "medico", password: "" }
const ROLES: ReadonlyArray<{ value: Role; label: string }> = [{ value: "medico", label: "Médico" }, { value: "administrador", label: "Administrador" }]

type SavedRows = { page: Page<User> | null; byId: Record<string, User> }

const describeWrite = (caught: unknown): DescribedError =>
  isOutcomeUnknown(caught) ? { ...describeError(caught), message: UNKNOWN_OUTCOME_MESSAGE } : describeError(caught)

// Administración de usuarios (HU002). Solo la ve el rol administrador, y el
// backend lo vuelve a comprobar en cada petición.
export function UserAdministration() {
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState<UserInput>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<DescribedError | null>(null)
  const [notice, setNotice] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [saved, setSaved] = useState<SavedRows>({ page: null, byId: {} })
  const users = useLoad(() => listUsers(offset), `users:${offset}`)
  const currentPage = useRef(users.data)
  useEffect(() => { currentPage.current = users.data }, [users.data])

  const set = (field: keyof UserInput, value: string) => setForm({ ...form, [field]: value })

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice("")
    setFieldErrors({})
    setIsSaving(true)
    try {
      await createUser(form)
      setForm(EMPTY)
      setNotice("Usuario creado. La contraseña temporal no se volverá a mostrar.")
      users.reload()
    } catch (caught) {
      const { fields, form: formErrors } = splitValidation(caught)
      setFieldErrors(fields)
      if (formErrors.length > 0) setError({ message: formErrors.join(" "), reference: null })
      else if (Object.keys(fields).length === 0) setError(describeWrite(caught))
    } finally {
      setIsSaving(false)
    }
  }

  // Una escritura por fila a la vez: mientras dura, sus controles quedan
  // deshabilitados. Sin esto, cada clic de más era otra petición auditada.
  async function change(id: string, operation: () => Promise<User>) {
    if (pendingIds.has(id)) return
    setError(null)
    setNotice("")
    setPendingIds((current) => new Set([...current, id]))
    try {
      // La fila muestra lo que respondió el servidor, sin esperar a releer la
      // lista. Se aplica sobre la página visible al llegar la respuesta, que
      // puede no ser la del clic si entretanto se releyó.
      const user = await operation()
      const page = currentPage.current
      setSaved((current) => ({ page, byId: { ...(current.page === page ? current.byId : {}), [user.id]: user } }))
    } catch (caught) {
      setError(describeWrite(caught))
    } finally {
      // Siempre se relee: una lectura iniciada después de la escritura es la
      // que manda, y sustituye a cualquiera que estuviera en curso.
      users.reload()
      setPendingIds((current) => new Set([...current].filter((pending) => pending !== id)))
    }
  }

  // Las respuestas guardadas solo valen sobre la página a la que se aplicaron.
  const rows = (users.data?.items ?? []).map((user) => (saved.page === users.data ? saved.byId[user.id] : undefined) ?? user)

  const input = (field: "email" | "full_name" | "password", label: string, type: string, autoComplete: string) => (
    <div>
      <label className="label" htmlFor={`user-${field}`}>{label}</label>
      <input
        required className={`input ${fieldErrors[field] ? "border-[#c53d3d]" : ""}`} id={`user-${field}`} type={type} autoComplete={autoComplete}
        value={form[field]} onChange={(e) => set(field, e.target.value)} aria-invalid={Boolean(fieldErrors[field])}
      />
      {field === "password" && <p className="mt-1 text-xs text-[#60727d]">Contraseña temporal. No se mostrará después de crearla.</p>}
      <FieldError message={fieldErrors[field]} />
    </div>
  )

  return (
    <>
      <div className="mb-8">
        <p className="eyebrow">Control de acceso</p>
        <h1 className="page-title">Administración de usuarios</h1>
        <p className="muted">Gestiona cuentas, roles y acceso institucional.</p>
      </div>
      <section className="card p-5 sm:p-7">
        <h2 className="mb-5 text-lg font-bold">Crear usuario</h2>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleCreate} noValidate>
          {input("email", "Correo electrónico", "email", "off")}
          {input("full_name", "Nombre", "text", "off")}
          <div>
            <label className="label" htmlFor="user-role">Rol</label>
            <select className="select" id="user-role" value={form.role} onChange={(e) => set("role", e.target.value)} aria-invalid={Boolean(fieldErrors.role)}>
              {ROLES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <FieldError message={fieldErrors.role} />
          </div>
          {input("password", "Contraseña temporal", "password", "new-password")}
          <div className="flex flex-col gap-3 sm:col-span-2">
            <div><button className="btn-primary disabled:opacity-60" type="submit" disabled={isSaving}>{isSaving ? "Creando…" : "Crear usuario"}</button></div>
            {error && <ErrorNotice error={error} />}
            {notice && <StatusNotice>{notice}</StatusNotice>}
          </div>
        </form>
      </section>

      <section className="mt-7">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold">Usuarios registrados</h2>
            <p className="muted">Página {offset / USERS_PAGE_SIZE + 1}</p>
          </div>
          <Pager offset={offset} hasMore={users.data?.has_more ?? false} pageSize={USERS_PAGE_SIZE} isBusy={users.isLoading} onChange={setOffset} />
        </div>
        {users.error && <ErrorNotice error={users.error}><button type="button" className="btn-secondary" onClick={users.reload}>Reintentar</button></ErrorNotice>}
        {!users.error && !users.data && <Loading>Cargando usuarios…</Loading>}
        {!users.error && users.data?.items.length === 0 && <p className="muted">No hay usuarios en esta página.</p>}
        {!users.error && users.data && users.data.items.length > 0 && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f1f5f5]">
                  <tr><th className="p-4">Usuario</th><th className="p-4">Rol</th><th className="p-4">Estado</th><th className="p-4">Acción</th></tr>
                </thead>
                <tbody>
                  {rows.map((user) => {
                    const isPending = pendingIds.has(user.id)
                    const action = user.is_active ? "Desactivar" : "Activar"
                    return (
                      <tr className="border-t border-[#d9e1e5]" key={user.id} aria-busy={isPending}>
                        <td className="p-4"><strong>{user.full_name}</strong><span className="block text-[#60727d]">{user.email ?? "Sin correo"}</span></td>
                        <td className="p-4">
                          <select className="select disabled:opacity-60" aria-label={`Rol de ${user.email ?? user.full_name}`} value={user.role} disabled={isPending} onChange={(e) => void change(user.id, () => updateUser(user.id, { role: e.target.value as Role }))}>
                            {ROLES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </td>
                        <td className="p-4">{user.is_active ? "Activo" : "Inactivo"}</td>
                        <td className="p-4">
                          <button type="button" className="font-bold text-[#0f5962] disabled:opacity-60" disabled={isPending} onClick={() => void change(user.id, () => setUserActive(user.id, !user.is_active))}>{isPending ? "Guardando…" : action}</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
