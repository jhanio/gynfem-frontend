import type { Metadata, Viewport } from "next"

export const metadata: Metadata = { title: "GynFem | Apoyo clínico", description: "Herramienta de apoyo a la decisión clínica para consultorios ginecológicos." }
export const viewport: Viewport = { themeColor: "#0f5962", width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es-PE"><body>{children}</body></html> }
