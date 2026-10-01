import { proxyToBackend } from "@/lib/server/proxy"

// Refresco de sesión (10 s) más una escritura (30 s), con margen.
export const maxDuration = 60

type Context = { params: Promise<{ path: string[] }> }

async function handle(request: Request, { params }: Context): Promise<Response> {
  return proxyToBackend(request, (await params).path)
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE }
