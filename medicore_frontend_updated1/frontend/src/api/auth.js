import api from './axios'

export const authAPI = {
  login: (email, password) => api.post('/auth/login/', { email, password }),
  logout: (refresh) => api.post('/auth/logout/', { refresh }),
  me: () => api.get('/auth/me/'),
  changePassword: (old_password, new_password) =>
    api.post('/auth/change-password/', { old_password, new_password }),
}
