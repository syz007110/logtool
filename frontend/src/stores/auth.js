import { defineStore } from 'pinia'
import api from '../api'

function normalizeUser (user) {
  if (!user) return null
  const authorization = user.authorization || { roles: [], isSuperAdmin: false, permissions: [] }
  return {
    ...user,
    authorization,
    permissions: Array.isArray(authorization.permissions) ? authorization.permissions : [],
    isSuperAdmin: Boolean(authorization.isSuperAdmin)
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // Access token deliberately stays only in memory. Do not add a persistence plugin.
    token: null,
    user: null,
    persist: false,
    language: localStorage.getItem('language') || 'zh-CN'
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    mustChangePassword: (state) => Boolean(state.user?.mustChangePassword),
    userRole: (state) => state.user?.authorization?.roles?.[0] || null,
    currentUser: (state) => state.user,
    currentLanguage: (state) => state.language,
    hasPermission: (state) => (permission) => Boolean(state.user?.isSuperAdmin || state.user?.permissions?.includes(permission))
  },
  actions: {
    applyLoginResult (response, rememberMe = false) {
      this.persist = Boolean(rememberMe)
      this.token = response.data.token
      this.user = normalizeUser(response.data.user)
      return response
    },
    async login (credentials) { return this.applyLoginResult(await api.auth.login(credentials), credentials?.rememberMe) },
    async emergencyLogin (credentials) { return this.applyLoginResult(await api.auth.emergencyLogin(credentials), credentials?.rememberMe) },
    async dingtalkLogin ({ authCode, rememberMe = true }) { return this.applyLoginResult(await api.auth.dingtalkLogin(authCode, rememberMe), rememberMe) },
    async refreshToken () {
      const response = await api.auth.refresh()
      this.token = response.data.token
      return response
    },
    async refreshMe () {
      const response = await api.auth.me()
      this.user = normalizeUser(response.data.user)
      return response
    },
    async completeInitialPassword (password) {
      const response = await api.auth.completeInitialPassword(password)
      this.token = response.data.token
      await this.refreshMe()
      return response
    },
    logout () {
      api.auth.logout().catch(() => {})
      this.token = null
      this.user = null
      this.persist = false
    },
    setLanguage (language) {
      this.language = language
      localStorage.setItem('language', language)
    }
  }
})
