"use client"

import { useEffect, useState } from "react"
import { Activity } from "lucide-react"
import { onWakeChange } from "@/lib/api/client"

// Con el servicio despierto, /health responde en 0.3–0.7 s
// (gynfem-backend/docs/DEPLOYMENT.md §7.8). Si pasan 2 s, está arrancando.
export const WAKE_NOTICE_DELAY_MS = 2000

// Arranque en frío del backend (plan Free de Render: hasta ~1 min). Es una
// espera normal, así que se anuncia como estado y nunca como error (decisión 9).
export function WakeStatus() {
  const [since, setSince] = useState<number | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => onWakeChange((waking) => {
    setSince(waking ? Date.now() : null)
    setNow(Date.now())
  }), [])

  useEffect(() => {
    if (since === null) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [since])

  if (since === null || now - since < WAKE_NOTICE_DELAY_MS) return null
  const seconds = Math.round((now - since) / 1000)
  return (
    <div className="bg-[#173d43] px-4 py-2 text-center text-xs text-white" role="status">
      <span className="inline-flex items-center gap-2">
        <Activity className="size-3 animate-pulse" />
        Iniciando el servicio. Puede tardar hasta un minuto… ({seconds} s)
      </span>
    </div>
  )
}
