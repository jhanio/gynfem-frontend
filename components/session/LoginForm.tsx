"use client"

import { useId, useState } from "react"
import { ensureAwake } from "@/lib/api/client"
import type { Session } from "@/lib/api/types"
import { type DescribedError, describeError } from "@/lib/error-messages"
import { login } from "@/services/session"
import { ErrorNotice } from "@/components/ui/Notices"

type Props = { onLogin: (session: Session) => void }

export function LoginForm({ onLogin }: Props) {
  // Puede haber dos formularios en el DOM (el diálogo de sesión expirada): ids únicos.
  const id = useId()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<DescribedError | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!email || !password) {
      setError({ message: "Ingresa tu correo y contraseña para continuar.", reference: null })
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      // El rol lo decide GET /me en el backend; si el servicio duerme, primero despierta.
      await ensureAwake()
      onLogin(await login(email, password))
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <div>
        <label className="label" htmlFor={`${id}-email`}>Correo electrónico</label>
        <input className="input" id={`${id}-email`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-password`}>Contraseña</label>
        <input className="input" id={`${id}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <ErrorNotice error={error} />}
      <button className="btn-primary disabled:opacity-60" disabled={isSubmitting}>{isSubmitting ? "Verificando…" : "Ingresar"}</button>
    </form>
  )
}
