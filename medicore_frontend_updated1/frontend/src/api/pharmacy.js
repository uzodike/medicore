import api from './axios'

export const pharmacyAPI = {
    // ── Drugs / formulary ──────────────────────────────────────────────
    drugs: (params) => api.get('/pharmacy/drugs/', { params }),
    getDrug: (id) => api.get(`/pharmacy/drugs/${id}/`),
    drugDetail: (id) => api.get(`/pharmacy/drugs/${id}/detail/`),
    writeoffExpired: (id) => api.post(`/pharmacy/drugs/${id}/writeoff-expired/`),
    createDrug: (data) => api.post('/pharmacy/drugs/', data),
    updateDrug: (id, d) => api.patch(`/pharmacy/drugs/${id}/`, d),
    deleteDrug: (id) => api.delete(`/pharmacy/drugs/${id}/`),
    lowStock: () => api.get('/pharmacy/drugs/low-stock/'),

    // ── Dispensing ─────────────────────────────────────────────────────
    // body: { patient_name, prescription_id?, items:[{drug_id, quantity}], dispensed_by? }
    dispense: (data) => api.post('/pharmacy/dispense/', data),

    // ── Receive stock (GRN) ────────────────────────────────────────────
    // body: { drug, quantity, batch_number?, expiry_date (YYYY-MM-DD), supplier? }
    receiveStock: (data) => api.post('/pharmacy/receive/', data),


    // ── Stock ledger ───────────────────────────────────────────────────
    stockHistory: (params) => api.get('/pharmacy/stock-history/', { params }),

    // ── Per-patient dispensing history (exact name match, not filtered stockHistory) ──
    patientUsage: (params) => api.get('/pharmacy/patient-usage/', { params }),

    // ── Prescriptions ──────────────────────────────────────────────────
    prescriptions: (params) => api.get('/pharmacy/prescriptions/', { params }),
    getPrescription: (id) => api.get(`/pharmacy/prescriptions/${id}/`),
    updatePrescription: (id, d) => api.patch(`/pharmacy/prescriptions/${id}/`, d),
}