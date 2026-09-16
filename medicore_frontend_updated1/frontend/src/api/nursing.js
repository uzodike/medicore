import api from './axios'
export const nursingAPI = {
  vitals: (params) => api.get('/nursing/vitals/', { params }),
  recordVitals: (data) => api.post('/nursing/vitals/', data),
  mar: (params) => api.get('/nursing/mar/', { params }),
  recordMAR: (data) => api.post('/nursing/mar/', data),
}
