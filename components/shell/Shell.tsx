"use client"

import { useState } from "react"
import { ClipboardList, LogOut, Menu, ShieldCheck, Users, X } from "lucide-react"
import type { Role, Session } from "@/lib/api/types"

export type NavTarget = "patients" | "quick" | "users"

const ROLE_LABEL: Record<Role, string> = { medico: "Médico", administrador: "Administrador" }

type Props = { session: Session; active: NavTarget; onNavigate: (target: NavTarget) => void; onLogout: () => void; children: React.ReactNode }

const navClass = (isActive: boolean) =>
  `flex items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-bold ${isActive ? "bg-[#e9f1f1] text-[#0f5962]" : "text-[#60727d]"}`

export function Shell({ session, active, onNavigate, onLogout, children }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const go = (target: NavTarget) => { setIsOpen(false); onNavigate(target) }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#d9e1e5] bg-white print:hidden">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <button type="button" className="rounded p-1 md:hidden" aria-label="Menú" aria-expanded={isOpen} aria-controls="main-navigation" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X /> : <Menu />}
            </button>
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#0f5962] text-white"><ShieldCheck className="size-5" /></div>
            <div>
              <p className="m-0 font-bold">GynFem</p>
              <p className="m-0 text-xs text-[#60727d]">Consultorio ginecológico</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* El rol es el que respondió GET /me; el correo, el de la sesión. */}
            <div className="hidden text-right sm:block">
              <p className="m-0 text-sm font-bold">{session.email ?? "Sesión iniciada"}</p>
              <p className="m-0 text-xs text-[#60727d]">{ROLE_LABEL[session.role]}</p>
            </div>
            <button type="button" onClick={onLogout} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-bold text-[#49616a]" aria-label="Cerrar sesión">
              <LogOut className="size-4" /><span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1200px] md:gap-8">
        <aside id="main-navigation" className={`${isOpen ? "block" : "hidden"} absolute z-10 w-full border-b border-[#d9e1e5] bg-white p-4 md:static md:block md:w-56 md:border-0 md:bg-transparent md:p-0 md:pt-8 print:hidden`}>
          {/* Lo que el rol no puede hacer no se muestra; quien autoriza es el backend. */}
          <nav className="flex flex-col gap-1" aria-label="Navegación principal">
            {session.role === "administrador" ? (
              <button type="button" onClick={() => go("users")} className={navClass(true)}><Users className="size-4" />Usuarios</button>
            ) : (
              <>
                <button type="button" onClick={() => go("patients")} className={navClass(active === "patients")}><Users className="size-4" />Pacientes</button>
                <button type="button" onClick={() => go("quick")} className={navClass(active === "quick")}><ClipboardList className="size-4" />Evaluación rápida</button>
              </>
            )}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-5 py-8 print:p-0">{children}</main>
      </div>
    </div>
  )
}
