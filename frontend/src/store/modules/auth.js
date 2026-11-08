import { useAuthStore } from '../../stores/auth'

// Transitional adapter: legacy pages continue to use Vuex getters while all
// authentication state and actions live in the Pinia auth store.
function auth () { return useAuthStore() }

export default {
  namespaced: true,
  state: () => ({}),
  getters: {
    isAuthenticated: () => auth().isAuthenticated,
    mustChangePassword: () => auth().mustChangePassword,
    userRole: () => auth().userRole,
    currentUser: () => auth().currentUser,
    currentLanguage: () => auth().currentLanguage,
    hasPermission: () => (permission) => auth().hasPermission(permission),
    permissions: () => auth().user?.permissions || []
  },
  actions: {
    login: (_, credentials) => auth().login(credentials),
    emergencyLogin: (_, credentials) => auth().emergencyLogin(credentials),
    dingtalkLogin: (_, payload) => auth().dingtalkLogin(payload),
    refreshToken: () => auth().refreshToken(),
    refreshMe: () => auth().refreshMe(),
    completeInitialPassword: (_, password) => auth().completeInitialPassword(password),
    logout: () => auth().logout(),
    setLanguage: (_, language) => auth().setLanguage(language)
  }
}
