import { createRouter, createWebHistory } from 'vue-router'
import store from '../store'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  // 独立智能搜索页面（ChatGPT 风格，无侧边栏）
  {
    path: '/smart-search',
    name: 'SmartSearchStandalone',
    component: () => import('../views/SmartSearchPage.vue'),
    meta: { requiresAuth: true, noSidebar: true }
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
  // 移动端登录
  {
    path: '/m/login',
    name: 'MLogin',
    component: () => import('../mobile/views/MobileLogin.vue'),
    meta: { requiresAuth: false, noSidebar: true, isMobile: true }
  },

  // 批量查看路由（支持单个或多个日志ID）
  {
    path: '/batch-analysis/:logIds',
    name: 'BatchAnalysisStandalone',
    component: () => import('../views/BatchAnalysis.vue'),
    // 日志查看/批量查看：允许拥有日志读取权限的用户访问
    meta: { requiresAuth: true, noSidebar: true, requiresPermission: 'log:read_all' }
  },
  {
    path: '/surgery-statistics',
    name: 'SurgeryStatistics',
    component: () => import('../views/SurgeryStatistics.vue'),
    // 管理员、专家（统一使用 surgery:read）
    meta: { requiresAuth: true, noSidebar: true, requiresPermission: 'surgery:read' }
  },
  {
    path: '/surgery-visualization',
    name: 'SurgeryVisualization',
    component: () => import('../views/SurgeryVisualization.vue'),
    meta: { requiresAuth: true, noSidebar: true, requiresPermission: 'surgery:read' }
  },
  {
    path: '/dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        redirect: '/dashboard/logs'
      },
      {
        path: 'smart-search',
        // 历史兼容：旧的 dashboard 内智能搜索入口，统一跳转到独立页面
        name: 'SmartSearch',
        redirect: '/smart-search'
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
        path: 'fault-cases',
        name: 'FaultCases',
        component: () => import('../views/JiraFaultCases.vue'),
        meta: { requiresPermission: 'fault_case:read' }
      },
      {
        path: 'fault-cases/new',
        name: 'FaultCaseCreate',
        component: () => import('../views/FaultCaseForm.vue'),
        meta: { requiresPermission: 'fault_case:create', hideSidebar: true }
      },
      {
        path: 'fault-cases/:id/edit',
        name: 'FaultCaseEdit',
        component: () => import('../views/FaultCaseForm.vue'),
        meta: { requiresPermission: 'fault_case:update', hideSidebar: true }
      },
      {
        path: 'fault-cases/:id',
        name: 'FaultCaseDetail',
        component: () => import('../views/FaultCaseDetail.vue'),
        meta: { requiresPermission: 'fault_case:read' }
      },
      {
        path: 'config-management',
        name: 'ConfigManagement',
        component: () => import('../views/ConfigManagement.vue'),
        meta: { requiresPermission: 'fault_case:manage' }
      },
      {
        // 兼容旧入口：日志分析等级 -> 配置管理
        path: 'analysis-categories',
        name: 'AnalysisCategories',
        redirect: '/dashboard/config-management',
        meta: { requiresPermission: 'fault_case:manage' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../views/Logs.vue')
      },
      {
        path: 'log-detail/:id',
        name: 'LogDetail',
        redirect: (to) => ({ path: `/batch-analysis/${to.params.id}` }),
        meta: { requiresPermission: 'log:read_all' }
      },
      {
        path: 'log-analysis/:id',
        name: 'LogAnalysis',
        redirect: (to) => ({ path: '/surgery-statistics', query: { logIds: to.params.id } })
      },
      {
        path: 'batch-analysis/:logIds',
        name: 'BatchAnalysis',
        component: () => import('../views/BatchAnalysis.vue'),
        meta: { requiresPermission: 'log:read_all' }
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
        meta: { requiresPermission: ['history:read_all', 'history:read_own'] }
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('../views/Users.vue'),
        meta: { requiresPermission: 'user:read' }
      },
      {
        path: 'roles',
        name: 'Roles',
        component: () => import('../views/Roles.vue'),
        meta: { requiresPermission: 'role:read' }
      },
      {
        path: 'explanation-tester',
        name: 'ExplanationTester',
        component: () => import('../views/ExplanationTester.vue'),
        meta: { requiresPermission: 'test:explain' }
      },
      {
        path: 'devices',
        name: 'Devices',
        component: () => import('../views/Devices.vue'),
        meta: { requiresPermission: 'device:read' }
      },
      {
        path: 'data-replay',
        name: 'DataReplay',
        component: () => import('../views/DataReplay.vue'),
        meta: { requiresPermission: 'data_replay:manage' }
      },
      {
        path: 'feedback',
        name: 'Feedback',
        component: () => import('../views/Feedback.vue')
      },
      {
        path: 'feedback-list',
        name: 'FeedbackList',
        component: () => import('../views/FeedbackList.vue')
      },
      {
        path: 'feedback-detail/:id',
        name: 'FeedbackDetail',
        component: () => import('../views/FeedbackDetail.vue'),
        props: true
      },
      {
        path: 'global-dashboard',
        name: 'GlobalDashboard',
        component: () => import('../views/GlobalDashboard.vue')
      },
      {
        path: 'monitoring',
        name: 'Monitoring',
        component: () => import('../views/MonitoringDashboard.vue'),
        meta: { requiresPermission: 'system:monitor' }
      },
      {
        path: 'surgeries',
        name: 'Surgeries',
        component: () => import('../views/Surgeries.vue'),
        // 允许拥有全部或仅本人可读权限的用户访问
        meta: { requiresPermission: ['surgery:read', 'surgery:read_own'] }
      }

    ]
  },
  // 移动端主路由
  {
    path: '/m',
    component: () => import('../mobile/MobileLayout.vue'),
    meta: { requiresAuth: true, noSidebar: true, isMobile: true },
    children: [
      { path: '', redirect: '/m/error' },
      { path: 'error', name: 'MError', component: () => import('../mobile/views/ErrorQuery.vue') },
      { path: 'logs', name: 'MLogs', component: () => import('../mobile/views/LogDevices.vue') },
      { path: 'logs/:deviceId', name: 'MDeviceLogs', component: () => import('../mobile/views/DeviceLogs.vue'), meta: { hideTabbar: true } },
      { path: 'log-view/:logId', name: 'MLogView', component: () => import('../mobile/views/LogView.vue'), meta: { hideTabbar: true } },
      { path: 'surgeries', name: 'MSurgeries', component: () => import('../mobile/views/SurgeriesDevices.vue') },
      { path: 'surgeries/:deviceId', name: 'MDeviceSurgeries', component: () => import('../mobile/views/DeviceSurgeries.vue'), meta: { hideTabbar: true } },
      { path: 'surgery-visualization/:surgeryId', name: 'MSurgeryVisualization', component: () => import('../mobile/views/SurgeryVisualization.vue'), meta: { hideTabbar: true } },
      { path: 'profile', name: 'MProfile', component: () => import('../mobile/views/Profile.vue') }
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
  const hasPermission = store.getters['auth/hasPermission']
  const isMobileRoute = to.path.startsWith('/m')

  if (to.meta.requiresAuth && !isAuthenticated) {
    next(isMobileRoute ? '/m/login' : '/login')
  } else if (to.meta.requiresAdmin && userRole !== 'admin') {
    next('/dashboard')
  } else if (to.meta.requiresPermission) {
    const required = to.meta.requiresPermission
    const allowed = Array.isArray(required)
      ? required.some((p) => hasPermission?.(p))
      : hasPermission?.(required)
    if (!allowed) {
      next('/dashboard')
    } else {
      next()
    }
  } else if ((to.path === '/login' || to.path === '/m/login') && isAuthenticated && from.path !== to.path) {
    next(isMobileRoute ? '/m' : '/smart-search')
  } else {
    next()
  }
})

export default router
