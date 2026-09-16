import api from './axios'
export const appointmentsAPI = {
  list: (params) => api.get('/appointments/', { params }),
  today: () => api.get('/appointments/today/'),
  get: (id) => api.get(`/appointments/${id}/`),
  create: (data) => api.post('/appointments/', data),
  update: (id, data) => api.patch(`/appointments/${id}/`, data),
  delete: (id) => api.delete(`/appointments/${id}/`),
}
