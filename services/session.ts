import { sessionRequest } from "@/lib/api/client"
import { ApiError } from "@/lib/api/errors"
import type { Session } from "@/lib/api/types"
import { invalidatePredictionSchema } from "./prediction-schema"

export function login(email: string, password: string): Promise<Session> {
  return sessionRequest<Session>("POST", { email, password })
}

// La sesión vive en cookies httpOnly: al recargar se pregunta al servidor.
export async function restoreSession(): Promise<Session | null> {
  try {
    return await sessionRequest<Session>("GET")
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function logout(): Promise<void> {
  invalidatePredictionSchema()
  try {
    await sessionRequest<void>("DELETE")
  } catch {
    // La interfaz cierra la sesión igualmente; las cookies caducan solas.
  }
}
