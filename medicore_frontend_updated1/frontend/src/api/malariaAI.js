// src/api/malariaAI.js
// Uses the shared axios instance — same pattern as every other API file in
// this app (lab.js, pharmacy.js, etc.). Paths match apps/malaria_ai/urls.py
// exactly, mounted under /api/v1/malaria/ in config/urls.py.
import api from './axios'

export const malariaAI = {
    status: () => api.get('/malaria/status/'),
    screens: (params) => api.get('/malaria/screens/', { params }),
    upload: (formData) => api.post('/malaria/screens/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    confirm: (id, data) => api.post(`/malaria/screens/${id}/confirm/`, data),
}