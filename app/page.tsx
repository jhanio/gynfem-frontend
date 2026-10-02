"use client"

import { useEffect, useState } from "react"
import { ensureAwake, setUnauthorizedHandler } from "@/lib/api/client"
import { isTransient } from "@/lib/api/errors"
import type { Measurement, Patient, Session } from "@/lib/api/types"
import { logout, restoreSession } from "@/services/session"
import { AssessmentForm } from "@/components/assessment/AssessmentForm"
import { PatientFile } from "@/components/patients/PatientFile"
import { PatientForm } from "@/components/patients/PatientForm"
import { PatientSearch } from "@/components/patients/PatientSearch"
import { LoginScreen, RestoringScreen } from "@/components/session/LoginScreen"
import { SessionExpiredDialog } from "@/components/session/SessionExpiredDialog"
import { WakeStatus } from "@/components/session/WakeStatus"
import { type NavTarget, Shell } from "@/components/shell/Shell"
import { UserAdministration } from "@/components/users/UserAdministration"

type Screen =
  | { name: "patients"; notice?: string }
  | { name: "patient-new" }
  | { name: "patient"; patientId: string }
  | { name: "patient-edit"; patient: Patient }
  | { name: "assessment"; patient: Patient }
  | { name: "correction"; patient: Patient; measurement: Measurement }
  | { name: "quick" }
  | { name: "users" }

type Status = "restoring" | "anonymous" | "authenticated"

// El rol viene de GET /me. La interfaz solo decide qué mostrar; quien autoriza
// cada operación es el backend.
const homeOf = (session: Session): Screen => (session.role === "administrador" ? { name: "users" } : { name: "patients" })

export default function App() {
  const [status, setStatus] = useState<Status>("restoring")
  const [session, setSession] = useState<Session | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: "patients" })
  const [isExpired, setIsExpired] = useState(false)
  // Cambia al entrar otro usuario: desmonta las pantallas del anterior.
  const [epoch, setEpoch] = useState(0)

  function enter(next: Session) {
    setSession(next)
    setScreen(homeOf(next))
    setEpoch((n) => n + 1)
    setIsExpired(false)
    setStatus("authenticated")
  }

  function leave() {
    setSession(null)
    setIsExpired(false)
    setStatus("anonymous")
  }

  useEffect(() => {
    let isActive = true
    // El despertar se anuncia en <WakeStatus />; si falla, lo dirá el inicio de sesión.
    const awake = ensureAwake().catch(() => undefined)
    restoreSession()
      .catch(async (caught) => {
        if (!isTransient(caught)) throw caught
        await awake
        return restoreSession()
      })
      .then((restored) => { if (isActive) { if (restored) enter(restored); else setStatus("anonymous") } })
      .catch(() => { if (isActive) setStatus("anonymous") })
    setUnauthorizedHandler(() => setIsExpired(true))
    return () => { isActive = false; setUnauthorizedHandler(null) }
  }, [])

  function handleLogin(next: Session) {
    // Tras una sesión expirada, el mismo usuario continúa donde estaba.
    if (isExpired && session?.id === next.id) {
      setSession(next)
      setIsExpired(false)
      return
    }
    enter(next)
  }

  function handleLogout() {
    void logout()
    leave()
  }

  function navigate(target: NavTarget) {
    if (!session) return
    if (session.role === "administrador") {
      if (target === "users") setScreen({ name: "users" })
      return
    }
    if (target === "patients") setScreen({ name: "patients" })
    if (target === "quick") setScreen({ name: "quick" })
  }

  function renderScreen(current: Session) {
    if (current.role === "administrador") return <UserAdministration />
    const toFile = (patientId: string) => setScreen({ name: "patient", patientId })
    const toPatients = () => setScreen({ name: "patients" })
    switch (screen.name) {
      case "patient-new":
        return <PatientForm onSaved={(patient) => toFile(patient.id)} onCancel={toPatients} />
      case "patient":
        return (
          <PatientFile
            key={screen.patientId} patientId={screen.patientId} onBack={toPatients}
            onAssess={(patient) => setScreen({ name: "assessment", patient })}
            onCorrect={(patient, measurement) => setScreen({ name: "correction", patient, measurement })}
            onEdit={(patient) => setScreen({ name: "patient-edit", patient })}
            onDeactivated={() => setScreen({ name: "patients", notice: "Paciente dada de baja." })}
          />
        )
      case "patient-edit":
        return <PatientForm patient={screen.patient} onSaved={(patient) => toFile(patient.id)} onCancel={() => toFile(screen.patient.id)} />
      case "assessment":
        return <AssessmentForm key={`assessment-${screen.patient.id}`} mode={{ kind: "patient", patient: screen.patient }} onBackToFile={() => toFile(screen.patient.id)} onBackToPatients={toPatients} />
      case "correction":
        return <AssessmentForm key={`correction-${screen.measurement.id}`} mode={{ kind: "correction", patient: screen.patient, measurement: screen.measurement }} onBackToFile={() => toFile(screen.patient.id)} onBackToPatients={toPatients} />
      case "quick":
        return <AssessmentForm key="quick" mode={{ kind: "quick" }} onBackToFile={toPatients} onBackToPatients={toPatients} />
      default:
        return <PatientSearch notice={screen.name === "patients" ? screen.notice : undefined} onSelect={toFile} onRegister={() => setScreen({ name: "patient-new" })} onQuick={() => setScreen({ name: "quick" })} />
    }
  }

  return (
    <>
      <WakeStatus />
      {status === "restoring" && <RestoringScreen />}
      {status === "anonymous" && <LoginScreen onLogin={handleLogin} />}
      {status === "authenticated" && session && (
        <>
          <div inert={isExpired} key={epoch}>
            <Shell session={session} active={screen.name === "quick" ? "quick" : screen.name === "users" ? "users" : "patients"} onNavigate={navigate} onLogout={handleLogout}>
              {renderScreen(session)}
            </Shell>
          </div>
          {isExpired && <SessionExpiredDialog onLogin={handleLogin} onLeave={handleLogout} />}
        </>
      )}
    </>
  )
}
