<!-- matriz-rbac:inicio -->
| Método | Ruta | Anónimo | Médico | Administrador | Decisión |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/health` | ✔ | ✔ | ✔ | **Pública** (excepción aprobada): liveness de Render; solo estado, versión y hora |
| `GET` | `/api/v1/health/ready` | 401 | 403 | ✔ | Diagnóstico de operación: consume una conexión del pool y revela el estado del esquema |
| `POST` | `/api/v1/predict` | 401 | ✔ | ✔ | Recibe datos clínicos y no hay limitación de tasa. Sin paciente ni escritura. En la sustentación se demuestra con una cuenta de médico |
| `GET` | `/api/v1/prediction/schema` | 401 | ✔ | ✔ | Sin secretos, pero su único consumidor es el formulario autenticado: cerrado por defecto |
| `GET` | `/api/v1/model/metrics` | 401 | ✔ | ✔ | HU010: métricas del modelo con sus limitaciones. Sin datos de pacientes; el médico necesita saber cuánto falla el modelo |
| `POST` | `/api/v1/patients` | 401 | ✔ | 403 | HU003. El administrador no ve datos clínicos |
| `POST` | `/api/v1/patients/search` | 401 | ✔ | 403 | HU004 |
| `GET` | `/api/v1/patients/{patient_id}` | 401 | ✔ | 403 | HU004 |
| `PATCH` | `/api/v1/patients/{patient_id}` | 401 | ✔ | 403 | HU004 |
| `DELETE` | `/api/v1/patients/{patient_id}` | 401 | ✔ | 403 | Baja lógica |
| `POST` | `/api/v1/patients/{patient_id}/measurements` | 401 | ✔ | 403 | HU005 |
| `GET` | `/api/v1/patients/{patient_id}/measurements` | 401 | ✔ | 403 | HU005 |
| `GET` | `/api/v1/patients/{patient_id}/evaluations` | 401 | ✔ | 403 | HU008: historial de evaluaciones. Clínico: el administrador no lo ve |
| `POST` | `/api/v1/measurements/{measurement_id}/corrections` | 401 | ✔ | 403 | HU005 |
| `GET` | `/api/v1/predictions/{prediction_id}` | 401 | ✔ | 403 | Predicción persistida |
| `POST` | `/api/v1/predictions/{prediction_id}/report` | 401 | ✔ | 403 | HU009: reporte de una evaluación. `POST` porque cada generación se audita (`prediction.report`): salen datos personales |
| `GET` | `/api/v1/me` | 401 | ✔ | ✔ | HU001: id y rol del usuario del token |
| `POST` | `/api/v1/users` | 401 | 403 | ✔ | HU002: crear |
| `GET` | `/api/v1/users` | 401 | 403 | ✔ | HU002: consultar |
| `GET` | `/api/v1/users/{user_id}` | 401 | 403 | ✔ | HU002: consultar |
| `PATCH` | `/api/v1/users/{user_id}` | 401 | 403 | ✔ | HU002: modificar el nombre y asignar el rol |
| `POST` | `/api/v1/users/{user_id}/deactivate` | 401 | 403 | ✔ | HU002: desactivar |
| `POST` | `/api/v1/users/{user_id}/activate` | 401 | 403 | ✔ | HU002: activar |
| `GET` | `/api/v1/settings` | 401 | 403 | ✔ | HU011: consultar los parámetros. Ninguno es clínico |
| `PATCH` | `/api/v1/settings` | 401 | 403 | ✔ | HU011: cambiar parámetros; cada cambio queda auditado |
| `GET` | `/api/v1/audit-log` | 401 | 403 | ✔ | Consulta de la auditoría, solo lectura. Sin datos clínicos: acciones e ids opacos que el administrador no puede resolver |
| `GET` | `/api/v1/openapi.json` | ✔ | ✔ | ✔ | **Pública solo en development y test**: el contrato, sin datos. No existe en production |
| `GET` | `/api/v1/docs` | ✔ | ✔ | ✔ | Igual que la anterior |
<!-- matriz-rbac:fin -->
