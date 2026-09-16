import api from './axios'

export const patientsAPI = {
  list: (params) => api.get('/patients/', { params }),
  get: (id) => api.get(`/patients/${id}/`),
  create: (data) => api.post('/patients/', data),
  update: (id, data) => api.patch(`/patients/${id}/`, data),
  delete: (id) => api.delete(`/patients/${id}/`),
  search: (q) => api.get('/patients/search/', { params: { q } }),
  report: (id) => api.get(`/patients/${id}/report/`),
}
