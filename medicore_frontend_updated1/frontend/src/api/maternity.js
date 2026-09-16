import api from './axios'

export const maternityAPI = {
    dashboard: () => api.get('/maternity/dashboard/'),
    enrollments: (params) => api.get('/maternity/enrollments/', { params }),
    getEnrollment: (id) => api.get(`/maternity/enrollments/${id}/`),
    enroll: (data) => api.post('/maternity/enrollments/', data),
    updateEnrollment: (id, d) => api.patch(`/maternity/enrollments/${id}/`, d),
    visits: (params) => api.get('/maternity/visits/', { params }),
    addVisit: (data) => api.post('/maternity/visits/', data),
    deliveries: (params) => api.get('/maternity/deliveries/', { params }),
    addDelivery: (data) => api.post('/maternity/deliveries/', data),
}
