import api from './axios'

export const teleAPI = {
    list: (params) => api.get('/telemedicine/', { params }),
    live: () => api.get('/telemedicine/live/'),
    get: (id) => api.get(`/telemedicine/${id}/`),
    create: (data) => api.post('/telemedicine/', data),
    update: (id, data) => api.patch(`/telemedicine/${id}/`, data),
    start: (id) => api.post(`/telemedicine/${id}/start/`),
    end: (id, data) => api.post(`/telemedicine/${id}/end/`, data),
    messages: (id) => api.get(`/telemedicine/${id}/messages/`),
    sendMessage: (id, data) => api.post(`/telemedicine/${id}/messages/`, data),
    eprescriptions: () => api.get('/telemedicine/eprescriptions/'),
    createEprescription: (data) => api.post('/telemedicine/eprescriptions/', data),
    // public — patient joins via the invite token (no auth required)
    joinByToken: (token) => api.get(`/telemedicine/join/${token}/`),
    // get-or-create (and optionally start) a session for an appointment
    ensureForAppointment: (apptId, data) => api.post(`/telemedicine/appointments/${apptId}/session/`, data),
}