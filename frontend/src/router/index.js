import { createRouter, createWebHistory } from 'vue-router'
import store from '../store'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('../views/ForgotPassword.vue'),
    meta: { requiresAuth: false }
  },
  // 独立的分析页面路由（不需要侧边导航栏）
  {
    path: '/analysis/:id',
    name: 'Analysis',
    component: () => import('../views/Analysis.vue'),
    meta: { requiresAuth: true, noSidebar: true }
  },
  {
    path: '/batch-analysis/:logIds',
    name: 'BatchAnalysisStandalone',
    component: () => import('../views/BatchAnalysis.vue'),
    meta: { requiresAuth: true, noSidebar: true }
  },
  {
    path: '/dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        redirect: '/dashboard/error-codes'
      },
      {
        path: 'error-codes',
        name: 'ErrorCodes',
        component: () => import('../views/ErrorCodes.vue')
      },
      {
        path: 'i18n-error-codes',
        name: 'I18nErrorCodes',
        component: () => import('../views/I18nErrorCodes.vue')
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../views/Logs.vue')
      },
      {
        path: 'log-detail/:id',
        name: 'LogDetail',
        component: () => import('../views/LogDetail.vue')
      },
      {
        path: 'log-analysis/:id',
        name: 'LogAnalysis',
        component: () => import('../views/LogAnalysis.vue')
      },
      {
        path: 'batch-analysis/:logIds',
        name: 'BatchAnalysis',
        component: () => import('../views/BatchAnalysis.vue')
      },
      {
        path: 'account',
        name: 'Account',
        component: () => import('../views/Account.vue')
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('../views/History.vue'),
        meta: { requiresAdmin: true }
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('../views/Users.vue'),
        meta: { requiresAdmin: true }
      },
      {
        path: 'roles',
        name: 'Roles',
        component: () => import('../views/Roles.vue'),
        meta: { requiresAdmin: true }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const isAuthenticated = store.getters['auth/isAuthenticated']
  const userRole = store.getters['auth/userRole']

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  } else if (to.meta.requiresAdmin && userRole !== 'admin') {
    next('/dashboard')
  } else if (to.path === '/login' && isAuthenticated && from.path !== '/login') {
    // 仅在不是后退到login时才跳转，避免破坏历史
    next('/dashboard')
  } else {
    next()
  }
})

export default router 