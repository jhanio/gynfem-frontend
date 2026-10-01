import { ShieldCheck } from "lucide-react"
import type { Session } from "@/lib/api/types"
import { LoginForm } from "./LoginForm"

export function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[430px]">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[#0f5962] text-white"><ShieldCheck /></div>
            <div>
              <p className="m-0 text-lg font-bold">GynFem</p>
              <p className="m-0 text-sm text-[#60727d]">Apoyo clínico especializado</p>
            </div>
          </div>
          <section className="card p-7 sm:p-9">
            <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[#0f5962]">Acceso seguro</p>
            <h1 className="m-0 text-2xl font-bold">Iniciar sesión</h1>
            <p className="mb-7 mt-2 text-sm text-[#60727d]">Ingresa con tus credenciales institucionales.</p>
            <LoginForm onLogin={onLogin} />
          </section>
        </div>
      </div>
    </main>
  )
}

// Mientras se comprueba si hay una sesión vigente (cookies httpOnly).
export function RestoringScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <p className="muted" role="status">Comprobando la sesión…</p>
    </main>
  )
}
