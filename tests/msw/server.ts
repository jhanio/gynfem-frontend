import { setupServer } from "msw/node"

// Un único servidor MSW para toda la suite. Sin manejadores por defecto: cada
// prueba declara lo que espera, y una petición no declarada hace fallar la prueba.
export const server = setupServer()
