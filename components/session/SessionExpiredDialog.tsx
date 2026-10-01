import type { Session } from "@/lib/api/types"
import { LoginForm } from "./LoginForm"

type Props = { onLogin: (session: Session) => void; onLeave: () => void }

// Sesión expirada (401): se pide reingresar ENCIMA de la pantalla actual, que
// sigue montada con lo que el usuario estaba escribiendo (decisión 4).
export function SessionExpiredDialog({ onLogin, onLeave }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17242b]/60 px-5">
      <section className="card w-full max-w-[430px] p-7" role="dialog" aria-modal="true" aria-labelledby="session-expired-title">
        <h2 id="session-expired-title" className="m-0 text-xl font-bold">Tu sesión expiró</h2>
        <p className="mb-6 mt-2 text-sm text-[#60727d]">
          Vuelve a iniciar sesión para continuar. Lo que estabas haciendo se conserva en pantalla.
        </p>
        <LoginForm onLogin={onLogin} />
        <button type="button" className="mt-4 text-sm font-bold text-[#49616a]" onClick={onLeave}>Salir</button>
      </section>
    </div>
  )
}
