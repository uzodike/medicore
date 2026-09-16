// src/api/doctor.js
import api from './axios'

export const doctorAPI = {
    // Queue & appointments
    queue:             (params) => api.get('/appointments/queue/',                  { params }),
    dashboard:         ()       => api.get('/appointments/doctor-dashboard/'),
    updateStatus:      (id, s)  => api.patch(`/appointments/${id}/status/`,         { status: s }),
    updateAppointment: (id, d)  => api.patch(`/appointments/${id}/`,                d),

    // Patient consultation summary (aggregated)
    consultation: (patientId) => api.get(`/appointments/patients/${patientId}/consultation/`),

    // SOAP / Clinical notes
    notes:      (params) => api.get('/appointments/clinical-notes/',      { params }),
    createNote: (data)   => api.post('/appointments/clinical-notes/',     data),
    updateNote: (id, d)  => api.patch(`/appointments/clinical-notes/${id}/`, d),

    // Prescriptions (doctor writes → pharmacy receives)
    prescriptions:      (params) => api.get('/appointments/prescriptions/',      { params }),
    createPrescription: (data) => api.post('/appointments/prescriptions/create/', data),

    // Drug search (autocomplete from pharmacy registry)
    drugSearch: (q) => api.get('/appointments/drugs/search/', { params: { q } }),
    raiseCharge: (data) => api.post('/appointments/charges/', data),

    // Lab orders (doctor places → lab receives)
    labOrders:      (params) => api.get('/lab/orders/',         { params }),
    createLabOrder: (data)   => api.post('/lab/orders/',        data),

    // IPD admission request
    ipdBeds:      (params) => api.get('/ipd/beds/',             { params }),
    admitRequest: (data) => api.post('/ipd/requests/create/', data),   // doctor creates request
}

// Re-export for convenience inside the workbench
export { pharmacyAPI } from './pharmacy'
export { labAPI }      from './lab'
export { ipdAPI }      from './ipd'