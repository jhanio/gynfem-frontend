import { wakeBackend } from "@/lib/server/wake"

// El despertar espera hasta 70 s al backend (lib/server/backend.ts). El plan
// Hobby de Vercel admite 300 s con Fluid Compute (docs/DEPLOYMENT.md).
export const maxDuration = 90

export const GET = wakeBackend
