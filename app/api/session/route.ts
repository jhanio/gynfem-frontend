import { currentSession, login, logout } from "@/lib/server/session-handlers"

// Incluye la lectura de GET /me (15 s) tras Supabase Auth (10 s).
export const maxDuration = 60

export const GET = currentSession
export const POST = login
export const DELETE = logout
