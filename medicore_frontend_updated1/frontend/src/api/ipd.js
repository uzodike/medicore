// src/api/ipd.js
import api from './axios'

export const ipdAPI = {
    // ── Dashboard ──────────────────────────────────────────────────────────────
    dashboard: () => api.get('/ipd/dashboard/'),

    // ── Wards ──────────────────────────────────────────────────────────────────
    wards: (params) => api.get('/ipd/wards/', { params }),
    createWard: (data) => api.post('/ipd/wards/', data),
    updateWard: (id, d) => api.patch(`/ipd/wards/${id}/`, d),

    // ── Beds ───────────────────────────────────────────────────────────────────
    beds: (params) => api.get('/ipd/beds/', { params }),
    createBed: (data) => api.post('/ipd/beds/', data),
    updateBed: (id, d) => api.patch(`/ipd/beds/${id}/`, d),
    availability: () => api.get('/ipd/availability/'),

    // ── Admission Requests (doctor → nurse workflow) ──────────────────────────
    // status param: 'pending' | 'assigned' | 'cancelled'  (mapped in backend)
    requests: (params) => api.get('/ipd/requests/', { params }),
    createRequest: (data) => api.post('/ipd/requests/create/', data),
    updateRequest: (id, d) => api.patch(`/ipd/requests/${id}/`, d),
    assignBed: (id, d) => api.post(`/ipd/requests/${id}/assign/`, d),

    // ── Active Admissions ─────────────────────────────────────────────────────
    // status param: 'active' | 'discharged' | 'transferred'
    admissions: (params) => api.get('/ipd/admissions/', { params }),
    getAdmission: (id) => api.get(`/ipd/admissions/${id}/`),
    postBedDay: (id, d) => api.post(`/ipd/admissions/${id}/bed-day/`, d || {}),
    update: (id, d) => api.patch(`/ipd/admissions/${id}/`, d),

    // ── Nurse Shifts ──────────────────────────────────────────────────────────
    shifts: (params) => api.get('/ipd/shifts/', { params }),
    createShift: (data) => api.post('/ipd/shifts/create/', data),
    updateShift: (id, d) => api.patch(`/ipd/shifts/${id}/`, d),

    // ── Medication Records (MAR) ──────────────────────────────────────────────
    medRecords: (params) => api.get('/ipd/med-records/', { params }),
    addMedRecord: (data) => api.post('/ipd/med-records/create/', data),
}