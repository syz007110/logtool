export const registerGlobalGuards = (router, store) => {
  const isAllowedByRequired = (required, hasPermission) => {
    if (!required) return true
    if (Array.isArray(required)) return required.some((p) => hasPermission?.(p))
    return hasPermission?.(required)
  }

  const resolveFirstAllowedPath = (isMobileRoute, hasPermission) => {
    const canUseSmartSearch = hasPermission?.('smart_search:use')
    if (isMobileRoute) {
      return canUseSmartSearch ? '/m/smart-search' : '/m/profile'
    }
    return canUseSmartSearch ? '/smart-search' : '/dashboard/account'
  }

  router.beforeEach((to, from, next) => {
    const isAuthenticated = store.getters['auth/isAuthenticated']
    const mustChangePassword = store.getters['auth/mustChangePassword']
    const userRole = store.getters['auth/userRole']
    const hasPermission = store.getters['auth/hasPermission']
    const isMobileRoute = to.path.startsWith('/m')
    const accountPath = '/dashboard/account'

    if (to.meta.requiresAuth && !isAuthenticated) {
      next(isMobileRoute ? '/m/login' : '/login')
      return
    }
    if (isAuthenticated && mustChangePassword && to.path !== accountPath) {
      next(accountPath)
      return
    }
    if (to.meta.requiresAdmin && userRole !== 'admin') {
      next(resolveFirstAllowedPath(isMobileRoute, hasPermission))
      return
    }
    if (to.meta.requiresPermission) {
      const required = to.meta.requiresPermission
      const allowed = isAllowedByRequired(required, hasPermission)
      if (!allowed) {
        next(resolveFirstAllowedPath(isMobileRoute, hasPermission))
      } else {
        next()
      }
      return
    }
    if ((to.path === '/login' || to.path === '/m/login') && isAuthenticated && from.path !== to.path) {
      next(mustChangePassword ? accountPath : resolveFirstAllowedPath(isMobileRoute, hasPermission))
      return
    }
    next()
  })
}
