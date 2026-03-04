export const registerGlobalGuards = (router, store) => {
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
      next('/dashboard')
      return
    }
    if (to.meta.requiresPermission) {
      const required = to.meta.requiresPermission
      const allowed = Array.isArray(required)
        ? required.some((p) => hasPermission?.(p))
        : hasPermission?.(required)
      if (!allowed) {
        next('/dashboard')
      } else {
        next()
      }
      return
    }
    if ((to.path === '/login' || to.path === '/m/login') && isAuthenticated && from.path !== to.path) {
      next(mustChangePassword ? accountPath : (isMobileRoute ? '/m' : '/smart-search'))
      return
    }
    next()
  })
}
