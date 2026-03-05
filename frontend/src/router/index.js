import { createRouter, createWebHistory } from 'vue-router'
import store from '../store'
import WebAppShell from '../apps/web/WebAppShell.vue'
import MobileAppShell from '../apps/mobile/MobileAppShell.vue'
import { webRoutes } from '../apps/web/routes'
import { mobileRoutes } from '../apps/mobile/routes'
import { getAppTarget, isWebEnabled, isMobileEnabled } from '../apps/shared/target'
import { registerGlobalGuards } from './guards'

const appTarget = getAppTarget()

const routes = []

if (isWebEnabled(appTarget)) {
  routes.push({
    path: '/',
    component: WebAppShell,
    children: webRoutes
  })
}

if (isMobileEnabled(appTarget)) {
  routes.push({
    path: '/m',
    component: MobileAppShell,
    children: mobileRoutes
  })
}

if (appTarget === 'web') {
  routes.push({
    path: '/m/:pathMatch(.*)*',
    redirect: '/login'
  })
}

if (appTarget === 'mobile') {
  routes.push({
    path: '/dashboard/:pathMatch(.*)*',
    redirect: '/m'
  })
  routes.push({ path: '/smart-search', redirect: '/m/smart-search' })
  routes.push({ path: '/login', redirect: '/m/login' })
  routes.push({ path: '/register', redirect: '/m/login' })
}

routes.push({
  path: '/:pathMatch(.*)*',
  redirect: isMobileEnabled(appTarget) && !isWebEnabled(appTarget) ? '/m/login' : '/login'
})

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

registerGlobalGuards(router, store)

export default router
