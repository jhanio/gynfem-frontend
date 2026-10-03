// Solo MSW: validación temporal independiente de lib/audit-validation.ts.
// Date valida el instante en milisegundos; se conserva también el resto de microsegundos.
export function auditTime(value: string): bigint | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!parts) return null
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const maxDay = month === 2 ? leap ? 29 : 28 : [4, 6, 9, 11].includes(month) ? 30 : 31
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > maxDay
    || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6] ?? 0) > 59
    || Number(parts[9] ?? 0) > 23 || Number(parts[10] ?? 0) > 59) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  return BigInt(ms) * BigInt(1000) + BigInt((parts[7] ?? "").padEnd(6, "0").slice(3))
}
