import api from './axios'

export const notificationsAPI = {
    list: (params) => api.get('/notifications/', { params }),
    unreadCount: () => api.get('/notifications/unread-count/'),
    markRead: (id) => api.post(`/notifications/${id}/read/`),
    markAllRead: () => api.post('/notifications/read-all/'),
    activity: (params) => api.get('/notifications/activity/', { params }),
}
