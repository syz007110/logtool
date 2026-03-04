export const webRoutes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/smart-search',
    name: 'SmartSearchStandalone',
    component: () => import('../../views/SmartSearchPage.vue'),
    meta: { requiresAuth: true, noSidebar: true }
  },
  {
    path: '/data-analysis',
    name: 'DataAnalysis',
    component: () => import('../../views/DataAnalysisPage.vue'),
    meta: { requiresAuth: true, noSidebar: true, requiresPermission: 'log:read_all' }
  },
  {
    path: '/translate-tool',
    name: 'TranslateTool',
    component: () => import('../../views/TranslateTool.vue'),
    meta: { requiresAuth: true, noSidebar: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../../views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../../views/Register.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/batch-analysis/:logIds',
    name: 'BatchAnalysisStandalone',
    component: () => import('../../views/BatchAnalysis.vue'),
    meta: { requiresAuth: true, noSidebar: true, requiresPermission: 'log:read_all' }
  },
  {
    path: '/surgery-statistics',
    name: 'SurgeryStatistics',
    component: () => import('../../views/SurgeryStatistics.vue'),
    meta: { requiresAuth: true, noSidebar: true, requiresPermission: 'surgery:read' }
  },
  {
    path: '/surgery-visualization',
    name: 'SurgeryVisualization',
    component: () => import('../../views/SurgeryVisualization.vue'),
    meta: { requiresAuth: true, noSidebar: true, requiresPermission: 'surgery:read' }
  },
  {
    path: '/dashboard',
    component: () => import('../../views/Dashboard.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        redirect: '/dashboard/logs'
      },
      {
        path: 'smart-search',
        name: 'SmartSearch',
        redirect: '/smart-search'
      },
      {
        path: 'error-codes',
        name: 'ErrorCodes',
        component: () => import('../../views/ErrorCodes.vue')
      },
      {
        path: 'i18n-error-codes',
        name: 'I18nErrorCodes',
        component: () => import('../../views/I18nErrorCodes.vue')
      },
      {
        path: 'fault-cases',
        name: 'FaultCases',
        component: () => import('../../views/JiraFaultCases.vue'),
        meta: { requiresPermission: 'fault_case:read' }
      },
      {
        path: 'knowledge-base',
        name: 'KnowledgeBase',
        component: () => import('../../views/KnowledgeBase.vue'),
        meta: { requiresPermission: 'kb:read' }
      },
      {
        path: 'fault-cases/new',
        name: 'FaultCaseCreate',
        component: () => import('../../views/FaultCaseForm.vue'),
        meta: { requiresPermission: 'fault_case:create', hideSidebar: true }
      },
      {
        path: 'fault-cases/:id/edit',
        name: 'FaultCaseEdit',
        component: () => import('../../views/FaultCaseForm.vue'),
        meta: { requiresPermission: 'fault_case:update', hideSidebar: true }
      },
      {
        path: 'fault-cases/:id',
        name: 'FaultCaseDetail',
        component: () => import('../../views/FaultCaseDetail.vue'),
        meta: { requiresPermission: 'fault_case:read' }
      },
      {
        path: 'config-management',
        name: 'ConfigManagement',
        component: () => import('../../views/ConfigManagement.vue'),
        meta: { requiresPermission: 'fault_case_config:manage' }
      },
      {
        path: 'analysis-categories',
        name: 'AnalysisCategories',
        redirect: '/dashboard/config-management',
        meta: { requiresPermission: 'fault_case_config:manage' }
      },
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../../views/Logs.vue')
      },
      {
        path: 'log-detail/:id',
        name: 'LogDetail',
        redirect: (to) => ({ path: `/batch-analysis/${to.params.id}` }),
        meta: { requiresPermission: 'log:read_all' }
      },
      {
        path: 'batch-analysis/:logIds',
        name: 'BatchAnalysis',
        component: () => import('../../views/BatchAnalysis.vue'),
        meta: { requiresPermission: 'log:read_all' }
      },
      {
        path: 'account',
        name: 'Account',
        component: () => import('../../views/Account.vue')
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('../../views/History.vue'),
        meta: { requiresPermission: ['history:read_all', 'history:read_own'] }
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('../../views/Users.vue'),
        meta: { requiresPermission: 'user:read' }
      },
      {
        path: 'roles',
        name: 'Roles',
        component: () => import('../../views/Roles.vue'),
        meta: { requiresPermission: 'role:read' }
      },
      {
        path: 'explanation-tester',
        name: 'ExplanationTester',
        component: () => import('../../views/ExplanationTester.vue'),
        meta: { requiresPermission: 'test:explain' }
      },
      {
        path: 'devices',
        name: 'Devices',
        component: () => import('../../views/Devices.vue'),
        meta: { requiresPermission: 'device:read' }
      },
      {
        path: 'data-replay',
        name: 'DataReplay',
        component: () => import('../../views/DataReplay.vue'),
        meta: { requiresPermission: 'data_replay:manage' }
      },
      {
        path: 'feedback',
        name: 'Feedback',
        component: () => import('../../views/Feedback.vue')
      },
      {
        path: 'feedback-list',
        name: 'FeedbackList',
        component: () => import('../../views/FeedbackList.vue')
      },
      {
        path: 'feedback-detail/:id',
        name: 'FeedbackDetail',
        component: () => import('../../views/FeedbackDetail.vue'),
        props: true
      },
      {
        path: 'global-dashboard',
        name: 'GlobalDashboard',
        component: () => import('../../views/GlobalDashboard.vue')
      },
      {
        path: 'monitoring',
        name: 'Monitoring',
        component: () => import('../../views/MonitoringDashboard.vue'),
        meta: { requiresPermission: 'system:monitor' }
      },
      {
        path: 'surgeries',
        name: 'Surgeries',
        component: () => import('../../views/Surgeries.vue'),
        meta: { requiresPermission: ['surgery:read', 'surgery:read_own'] }
      },
      {
        path: 'translate-tool',
        name: 'DashboardTranslateTool',
        redirect: '/translate-tool'
      }
    ]
  }
]
