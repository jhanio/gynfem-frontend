import { isTransient } from "./errors"

// Dos reintentos, a 1 s y 3 s: una transacción cuesta ≈0.9 s y una escritura
// clínica 1–3 s (gynfem-backend/docs/DEPLOYMENT.md §7.8), así que un fallo
// transitorio de la base suele haber pasado en ese margen.
export const READ_RETRY_DELAYS_MS: readonly number[] = [1000, 3000]

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// SOLO para lecturas. Una escritura nunca pasa por aquí (decisión C).
export async function retryRead<T>(operation: () => Promise<T>, sleep: (ms: number) => Promise<void> = wait): Promise<T> {
  for (const delayMs of READ_RETRY_DELAYS_MS) {
    try {
      return await operation()
    } catch (error) {
      if (!isTransient(error)) throw error
      await sleep(delayMs)
    }
  }
  return operation()
}
