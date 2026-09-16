import { create } from 'zustand'
import { authAPI } from '../api/auth'

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  // Initialize from localStorage on app load
  init: async () => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    try {
      set({ isLoading: true })
      const { data } = await authAPI.me()
      set({ user: data, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.clear()
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await authAPI.login(email, password)
      localStorage.setItem('access_token', data.access)
      localStorage.setItem('refresh_token', data.refresh)
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
      return { success: true, role: data.user.role }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Invalid email or password'
      set({ isLoading: false, error: msg })
      return { success: false, error: msg }
    }
  },

  logout: async () => {
    try {
      const refresh = localStorage.getItem('refresh_token')
      await authAPI.logout(refresh)
    } catch { /* silent */ } finally {
      localStorage.clear()
      set({ user: null, isAuthenticated: false, error: null })
    }
  },

  clearError: () => set({ error: null }),
}))
