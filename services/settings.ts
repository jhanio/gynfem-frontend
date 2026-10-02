import { apiRead, apiWrite } from "@/lib/api/client"
import type { SettingsChange, SystemSettings } from "@/lib/api/types"

export function getSettings(): Promise<SystemSettings> {
  return apiRead<SystemSettings>("/settings")
}

// Solo las claves que cambian (HU011). Un valor igual al vigente no escribe
// nada en el backend y responde igual que un cambio.
export function updateSettings(changes: SettingsChange): Promise<SystemSettings> {
  return apiWrite<SystemSettings>("PATCH", "/settings", changes)
}
