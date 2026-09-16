import api from './axios'

export const labAPI = {
    // ── Dashboard ────────────────────────────────────
    dashboard: () => api.get('/lab/dashboard/'),

    // ── Test catalogue ───────────────────────────────
    tests: (params) => api.get('/lab/tests/', { params }),
    getTest: (id) => api.get(`/lab/tests/${id}/`),
    createTest: (data) => api.post('/lab/tests/', data),
    updateTest: (id, data) => api.patch(`/lab/tests/${id}/`, data),
    deleteTest: (id) => api.delete(`/lab/tests/${id}/`),

    // ── Orders ───────────────────────────────────────
    orders: (params) => api.get('/lab/orders/', { params }),
    getOrder: (id) => api.get(`/lab/orders/${id}/`),
    createOrder: (data) => api.post('/lab/orders/', data),
    updateOrder: (id, data) => api.patch(`/lab/orders/${id}/`, data),
    attachReport: (id, file) => { const fd = new FormData(); fd.append('file', file); return api.post(`/lab/orders/${id}/attach/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }) },

    // ── Sample collection ────────────────────────────
    awaitingCollection: () => api.get('/lab/awaiting-collection/'),
    collectSample: (itemId, data) => api.post(`/lab/items/${itemId}/collect/`, data),

    // ── Results ──────────────────────────────────────
    pendingWorklist: () => api.get('/lab/pending/'),
    enterResult: (itemId, data) => api.post(`/lab/items/${itemId}/result/`, data),
    approveResult: (itemId) => api.post(`/lab/items/${itemId}/approve/`),

    // ── Billing ──────────────────────────────────────
    bills: (params) => api.get('/lab/bills/', { params }),
    payBill: (billId, data) => api.post(`/lab/bills/${billId}/pay/`, data),
    waiveBill: (billId, data) => api.post(`/lab/bills/${billId}/waive/`, data),
    getBill: (id) => api.get(`/lab/bills/${id}/`),
    
    // ── Service inventory & reports ──────────────────
    inventory: (params) => api.get('/lab/inventory/', { params }),
    summary: (params) => api.get('/lab/inventory/summary/', { params }),
}