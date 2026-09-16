// src/api/labAI.js
// Generic AI-assist client — works for ANY registry.py test_type
// (malaria, sickle_cell, tb_smear, microfilariae, and anything added
// later). Lives under apps/malaria_ai — the app kept its original
// name/app_label for historical continuity even though it now serves
// every microscope-based test, not just malaria. Mounted under
// /api/v1/malaria/ in config/urls.py — that mount point does NOT need
// to change, only the routes inside apps/malaria_ai/urls.py did.
import api from './axios'

export const labAI = {
    status: (testType) => api.get('/malaria/status/', { params: { test_type: testType } }),

    screens: (params) => api.get('/malaria/screens/', { params }),

    // Create a screen + run inference in one call — this is what a
    // scientist triggers by picking a file and clicking "Get AI suggestion".
    upload: (testType, patientId, file, orderItemId) => {
        const fd = new FormData()
        fd.append('test_type', testType)
        fd.append('patient', patientId)
        fd.append('image', file)
        if (orderItemId) fd.append('order_item', orderItemId)
        return api.post('/malaria/screens/upload/', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
    },

    // Classify-kind confirm (malaria, sickle_cell) — no boxes involved
    confirm: (screenId, data) => api.post(`/malaria/screens/${screenId}/confirm/`, data),

    // Detect-kind (tb_smear, microfilariae) — bounding box review
    getBoxes: (screenId) => api.get(`/malaria/screens/${screenId}/boxes/`),
    submitBoxReview: (screenId, data) => api.post(`/malaria/screens/${screenId}/review/`, data),
}