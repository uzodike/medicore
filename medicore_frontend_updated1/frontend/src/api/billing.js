import api from './axios'
export const billingAPI = {
  list: (params) => api.get('/billing/', { params }),
  get: (id) => api.get(`/billing/${id}/`),
  create: (data) => api.post('/billing/', data),
  update: (id, data) => api.patch(`/billing/${id}/`, data),
  pay: (id, data) => api.post(`/billing/${id}/pay/`, data),
}
