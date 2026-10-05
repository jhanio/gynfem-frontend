# Consulta de auditoría — Fase 16

Contrato: [API_SPEC.md §3.7.5 y §3.7.6](../../gynfem-backend/docs/API_SPEC.md).

La pantalla está disponible solo para administrador. Usa `services/audit-log.ts`
para leer, sin resolver identificadores ni modificar registros. Renderiza los
ocho campos documentados, sin propiedades adicionales, y conserva el orden
recibido, incluidos empates temporales. No muestra total.

Los filtros se aplican explícitamente y reinician el offset. Las fechas exigen
zona horaria; el formato aceptado usa `T`, `Z` o desplazamiento `±HH:MM` y hasta
seis decimales. No se convierte una hora sin zona usando la zona del navegador.
Se conservan los desplazamientos y microsegundos. `URLSearchParams` codifica
los signos positivos como `%2B`.

## Desviación heredada del BFF

El backend rechaza parámetros desconocidos con 422. Sin embargo,
`lib/server/query.ts` los descarta antes de llamar al backend; este comportamiento
está cubierto por `tests/server/proxy.test.ts` y se conserva por instrucción
expresa. La interfaz solo genera las seis claves de filtros y `limit`/`offset`.

El BFF limita la paginación a seis dígitos y acepta un formato temporal más
estrecho que el esquema del backend. No se modificaron esas restricciones.
`tests/unit/audit-validation.test.ts` comprueba que los formatos temporales
generados por la interfaz pasan por el BFF, incluidos offsets positivos.

El mock valida los filtros conocidos con las reglas del BFF y comprueba también
calendario, límites y rangos temporales con precisión de microsegundos. No
simula transacciones reales ni el identificador interno de inserción. Las
pruebas de interfaz verifican que no se reordenen las filas de una respuesta.
