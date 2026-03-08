export const mobileRoutes = [
  {
    path: 'login',
    name: 'MLogin',
    component: () => import('../../mobile/views/MobileLogin.vue'),
    meta: { requiresAuth: false, noSidebar: true, isMobile: true }
  },
  {
    path: 'register',
    name: 'MRegister',
    component: () => import('../../mobile/views/MobileRegister.vue'),
    meta: { requiresAuth: false, noSidebar: true, isMobile: true }
  },
  {
    path: '',
    component: () => import('../../mobile/MobileLayout.vue'),
    meta: { requiresAuth: true, noSidebar: true, isMobile: true },
    children: [
      { path: '', redirect: '/m/smart-search' },
      { path: 'smart-search', name: 'MSmartSearch', component: () => import('../../mobile/views/MobileSmartSearch.vue'), meta: { hideTabbar: false, isMobile: true } },
      { path: 'error', name: 'MError', component: () => import('../../mobile/views/ErrorQuery.vue'), meta: { isMobile: true } },
      { path: 'logs', name: 'MLogs', component: () => import('../../mobile/views/LogDevices.vue'), meta: { isMobile: true } },
      { path: 'logs/:deviceId', name: 'MDeviceLogs', component: () => import('../../mobile/views/DeviceLogs.vue'), meta: { hideTabbar: true, isMobile: true } },
      { path: 'log-view/:logId', name: 'MLogView', component: () => import('../../mobile/views/LogView.vue'), meta: { hideTabbar: true, isMobile: true } },
      { path: 'surgeries', name: 'MSurgeries', component: () => import('../../mobile/views/SurgeriesDevices.vue'), meta: { isMobile: true } },
      { path: 'surgeries/:deviceId', name: 'MDeviceSurgeries', component: () => import('../../mobile/views/DeviceSurgeries.vue'), meta: { hideTabbar: true, isMobile: true } },
      { path: 'surgery-visualization/:surgeryId', name: 'MSurgeryVisualization', component: () => import('../../mobile/views/SurgeryVisualization.vue'), meta: { hideTabbar: true, isMobile: true } },
      { path: 'surgery-timeline/:surgeryId', name: 'MSurgeryTimeline', component: () => import('../../mobile/views/SurgeryTimeline.vue'), meta: { hideTabbar: true, isMobile: true } },
      { path: 'profile', name: 'MProfile', component: () => import('../../mobile/views/Profile.vue'), meta: { isMobile: true } }
    ]
  }
]
