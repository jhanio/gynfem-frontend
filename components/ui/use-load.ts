"use client"

import { useEffect, useEffectEvent, useState } from "react"
import { type DescribedError, describeError } from "@/lib/error-messages"

type Loaded<T> = { data: T | null; error: DescribedError | null; isLoading: boolean; reload: () => void }

// Carga de una lectura de la capa de servicios, con sus tres estados. `key`
// identifica qué se carga: al cambiar, se vuelve a pedir. Mientras se recarga,
// `data` conserva lo último que llegó (la pantalla no parpadea).
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> {
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<T | null>(null)
  const [settled, setSettled] = useState<{ id: string; error: DescribedError | null } | null>(null)
  const id = `${key}#${attempt}`
  const run = useEffectEvent(load)

  useEffect(() => {
    let isActive = true
    run().then(
      (loaded) => { if (isActive) { setData(loaded); setSettled({ id, error: null }) } },
      (caught) => { if (isActive) setSettled({ id, error: describeError(caught) }) },
    )
    return () => { isActive = false }
  }, [id])

  const isCurrent = settled?.id === id
  return { data, error: isCurrent ? settled.error : null, isLoading: !isCurrent, reload: () => setAttempt((n) => n + 1) }
}
