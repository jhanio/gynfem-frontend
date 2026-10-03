// Parámetros NO clínicos: API_SPEC §3.7.4 y app/schemas/settings.py del backend.
// Los límites pertenecen al catálogo cerrado, no a /prediction/schema.
export const INSTITUTION_NAME_MAX = 100
export const HISTORY_PAGE_SIZE_MIN = 1
export const HISTORY_PAGE_SIZE_MAX = 50

type Validated<T> = { value: T; error?: never } | { error: string; value?: never }

export function validateInstitutionName(input: unknown): Validated<string> {
  if (typeof input !== "string") return { error: "string_type" }
  const normalized = input.normalize("NFC")
  // Python rechaza todas las categorías C* y Zl/Zp ANTES de recortar.
  if (/[\p{C}\p{Zl}\p{Zp}]/u.test(normalized)) return { error: "control_character" }
  // Tras rechazar controles, solo quedan separadores de espacio: como split/join.
  const value = normalized.replace(/\p{Zs}+/gu, " ").trim()
  // len(str) de Python cuenta puntos de código, no unidades UTF-16 de JS.
  const length = Array.from(value).length
  if (length < 1 || length > INSTITUTION_NAME_MAX) return { error: "institution_name_length" }
  return { value }
}

// El input es texto para que el navegador no borre ni convierta datos inválidos.
// El PATCH lleva un número entero, nunca la cadena del control.
export function validateHistoryPageSize(input: string): Validated<number> {
  if (!/^\d+$/.test(input)) return { error: "int_type" }
  const value = Number(input)
  if (value < HISTORY_PAGE_SIZE_MIN) return { error: "greater_than_equal" }
  if (value > HISTORY_PAGE_SIZE_MAX) return { error: "less_than_equal" }
  return { value }
}
