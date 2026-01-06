<template>
  <a-layout class="dashboard-layout">
    <!-- 侧边栏 -->
    <a-layout-sider
      v-if="!hideSidebar"
      :collapsed="collapsed"
      @update:collapsed="onSiderCollapsedChange"
      :trigger="null"
      collapsible
      class="dashboard-sider"
      :width="256"
      :collapsed-width="80"
      theme="light"
    >
      <!-- Logo区域 -->
      <div class="logo">
        <template v-if="!collapsed">
          <img src="/Icons/logo-text.svg" alt="LogTool" class="logo-text" />
        </template>
        <template v-else>
          <img src="/Icons/logo.svg" alt="LogTool" class="logo-icon-svg" />
        </template>
      </div>
      
      <!-- 菜单容器，可滚动 -->
      <div class="sidebar-menu-container">
        <!-- 菜单 -->
        <a-menu
          :selectedKeys="selectedKeys"
          @update:selectedKeys="onSelectedKeys"
          :openKeys="openKeys"
          @update:openKeys="onOpenKeys"
          mode="inline"
          class="dashboard-menu"
          @click="handleMenuClick"
        >
          <!-- 智能搜索：跳转到独立页面 -->
          <a-menu-item key="/smart-search">
            <template #icon>
              <SearchOutlined />
            </template>
            <span>{{ $t('smartSearch.title') }}</span>
          </a-menu-item>
          
          <!-- 故障码管理 -->
          <a-sub-menu key="data-management">
            <template #icon>
              <DatabaseOutlined />
            </template>
            <template #title>{{ $t('nav.dataManagement') }}</template>
            <a-menu-item key="/dashboard/error-codes">
              <span>{{ $t('errorCodes.title') }}</span>
            </a-menu-item>
            <a-menu-item key="/dashboard/i18n-error-codes">
              <span>{{ $t('i18nErrorCodes.title') }}</span>
            </a-menu-item>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('fault_case:read')" key="/dashboard/fault-cases">
              <span>{{ $t('faultCases.title') }}</span>
            </a-menu-item>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('loglevel:manage')" key="/dashboard/config-management">
              <span>{{ $t('configManagement.title') }}</span>
            </a-menu-item>
          </a-sub-menu>
          
          <!-- 日志与手术数据 -->
          <a-sub-menu key="log-analysis">
            <template #icon>
              <FileTextOutlined />
            </template>
            <template #title>{{ $t('nav.logAndSurgery') }}</template>
            <a-menu-item key="/dashboard/logs">
              <span>{{ $t('logs.title') }}</span>
            </a-menu-item>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('data_replay:manage')" key="/dashboard/data-replay">
              <span>{{ $t('dataReplay.title') }}</span>
            </a-menu-item>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('surgery:read') || $store.getters['auth/hasPermission']('surgery:read_own')" key="/dashboard/surgeries">
              <span>{{ $t('logs.surgeryData') }}</span>
            </a-menu-item>
          </a-sub-menu>
          
          <!-- 全局看板 -->
          <a-menu-item key="/dashboard/global-dashboard">
            <template #icon>
              <AppstoreOutlined />
            </template>
            <span>{{ $t('globalDashboard.title') }}</span>
          </a-menu-item>
          
          <!-- 缺陷反馈 -->
          <a-menu-item key="/dashboard/feedback">
            <template #icon>
              <BugOutlined />
            </template>
            <span>{{ $t('feedback.title') }}</span>
          </a-menu-item>
          
          <!-- 账户信息 -->
          <a-menu-item key="/dashboard/account">
            <template #icon>
              <UserOutlined />
            </template>
            <span>{{ $t('account.title') }}</span>
          </a-menu-item>
          
          <!-- 系统管理 -->
          <a-sub-menu v-if="$store.getters['auth/hasPermission']('user:read') || $store.getters['auth/hasPermission']('role:read') || $store.getters['auth/hasPermission']('device:read') || $store.getters['auth/hasPermission']('history:read_all')" key="system-management">
            <template #icon>
              <SettingOutlined />
            </template>
            <template #title>{{ $t('nav.systemManagement') }}</template>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('user:read')" key="/dashboard/users">
              <span>{{ $t('users.title') }}</span>
            </a-menu-item>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('role:read')" key="/dashboard/roles">
              <span>{{ $t('roles.title') }}</span>
            </a-menu-item>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('device:read')" key="/dashboard/devices">
              <span>{{ $t('devices.title') }}</span>
            </a-menu-item>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('history:read_all') || $store.getters['auth/hasPermission']('history:read_own')" key="/dashboard/history">
              <span>{{ $t('history.title') }}</span>
            </a-menu-item>
            <a-menu-item v-if="$store.getters['auth/hasPermission']('system:monitor')" key="/dashboard/monitoring">
              <span>{{ $t('monitoring.title') }}</span>
            </a-menu-item>
          </a-sub-menu>
          
          <!-- 测试 -->
          <a-menu-item v-if="$store.getters['auth/hasPermission']('test:explain')" key="/dashboard/explanation-tester">
            <template #icon>
              <ExperimentOutlined />
            </template>
            <span>{{ $t('nav.test') }}</span>
          </a-menu-item>
        </a-menu>
      </div>

      <!-- 侧边栏底部用户菜单 - 固定在底部 -->
      <div class="sidebar-footer">
        <div class="user-menu-wrapper">
          <a-dropdown placement="topRight">
            <div class="user-info-btn">
              <a-avatar :size="collapsed ? 32 : 36" class="user-avatar">
                <template #icon><UserOutlined /></template>
              </a-avatar>
              <div v-if="!collapsed" class="user-details">
                <span class="username-text">{{ currentUser?.username }}</span>
                <span class="role-text">{{ currentUser?.role }}</span>
              </div>
              <SettingOutlined v-if="!collapsed" class="settings-icon" />
            </div>
            <template #overlay>
              <a-menu @click="handleUserCommand">
                <a-menu-item key="profile">
                  <template #icon><UserOutlined /></template>
                  {{ $t('nav.profile') }}
                </a-menu-item>
                <a-menu-divider />
                <a-menu-item key="logout">
                  <template #icon><LogoutOutlined /></template>
                  {{ $t('nav.logout') }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </div>
    </a-layout-sider>
    
    <!-- 主内容区域 -->
    <a-layout class="main-layout">
      <!-- 顶部导航栏 -->
      <a-layout-header class="dashboard-header">
        <div class="header-left">
          <a-button
            v-if="!hideSidebar"
            type="text"
            class="trigger-btn"
            @click="toggleCollapsed"
          >
            <template #icon>
              <MenuUnfoldOutlined v-if="collapsed" />
              <MenuFoldOutlined v-else />
            </template>
          </a-button>
          
          <!-- 导航层级 (Breadcrumbs) -->
          <a-breadcrumb class="nav-breadcrumb">
            <a-breadcrumb-item v-for="(item, index) in breadcrumbs" :key="index">
              <router-link v-if="item.path" :to="item.path">{{ item.title }}</router-link>
              <span v-else>{{ item.title }}</span>
            </a-breadcrumb-item>
          </a-breadcrumb>
        </div>
        
        <div class="header-right">
          <!-- 语言切换 -->
          <a-dropdown>
            <a-button type="text" class="lang-btn">
              <template #icon>
                <GlobalOutlined />
              </template>
              {{ currentLocaleLabel }}
            </a-button>
            <template #overlay>
              <a-menu @click="handleLanguageChange">
                <a-menu-item key="zh-CN">中文</a-menu-item>
                <a-menu-item key="en-US">English</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>
      
      <!-- 内容区域 -->
      <a-layout-content v-if="!hideSidebar && !hideContentWrapper" class="dashboard-content">
        <router-view />
      </a-layout-content>
      <router-view v-else />
    </a-layout>
  </a-layout>
</template>

<script>
import { computed, ref, watch } from 'vue'
import { getCurrentLocale, loadLocaleMessages } from '../i18n'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { Modal } from 'ant-design-vue'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileTextOutlined,
  TranslationOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  MessageOutlined,
  UserOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  KeyOutlined,
  GlobalOutlined,
  ExperimentOutlined,
  // 添加新的图标
  BugOutlined,
  DatabaseOutlined,
  ToolOutlined,
  BookOutlined,
  SafetyOutlined,
  AppstoreOutlined,
  MonitorOutlined,
  SearchOutlined,
  LogoutOutlined
} from '@ant-design/icons-vue'

export default {
  name: 'Dashboard',
  components: {
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    FileTextOutlined,
    TranslationOutlined,
    SettingOutlined,
    PlayCircleOutlined,
    MessageOutlined,
    UserOutlined,
    ClockCircleOutlined,
    TeamOutlined,
    KeyOutlined,
    GlobalOutlined,
    ExperimentOutlined,
    // 注册新的图标组件
    BugOutlined,
    DatabaseOutlined,
    ToolOutlined,
    BookOutlined,
    SafetyOutlined,
    AppstoreOutlined,
    MonitorOutlined,
    SearchOutlined,
    LogoutOutlined
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    
    // 辅助函数：根据路由名称获取一级菜单信息
    const getParentMenuForRoute = (routeName) => {
      // 数据管理
      if (['ErrorCodes', 'I18nErrorCodes', 'FaultCases', 'FaultCaseDetail', 'FaultCaseCreate', 'FaultCaseEdit', 'AnalysisCategories', 'ConfigManagement'].includes(routeName)) {
        return {
          titleKey: 'nav.dataManagement',
          key: 'data-management'
        }
      }
      // 日志与手术数据
      if (['Logs', 'DataReplay', 'Surgeries', 'BatchAnalysis'].includes(routeName)) {
        return {
          titleKey: 'nav.logAndSurgery',
          key: 'log-analysis'
        }
      }
      // 系统管理
      if (['Users', 'Roles', 'Devices', 'History', 'Monitoring'].includes(routeName)) {
        return {
          titleKey: 'nav.systemManagement',
          key: 'system-management'
        }
      }
      // 独立页面（没有一级菜单）
      return null
    }
    
    // 辅助函数：根据路由名称获取标题 Key
    const getPageTitleKeyForRoute = (name) => {
      const nameMap = {
        ErrorCodes: 'errorCodes.title',
        I18nErrorCodes: 'i18nErrorCodes.title',
        FaultCases: 'faultCases.title',
        FaultCaseDetail: 'faultCases.title',
        FaultCaseCreate: 'faultCases.title',
        FaultCaseEdit: 'faultCases.title',
        AnalysisCategories: 'analysisCategories.title',
        ConfigManagement: 'configManagement.title',
        Logs: 'logs.title',
        Devices: 'devices.title',
        Feedback: 'feedback.title',
        DataReplay: 'dataReplay.title',
        Surgeries: 'logs.surgeryData',
        Account: 'account.title',
        History: 'history.title',
        Users: 'users.title',
        Roles: 'roles.title',
        BatchAnalysis: 'batchAnalysis.title',
        GlobalDashboard: 'globalDashboard.title',
        Monitoring: 'monitoring.title'
      }
      return nameMap[name]
    }
    
    // 面包屑导航逻辑
    const breadcrumbs = computed(() => {
      const breadcrumbList = []
      const currentRouteName = route.name
      
      // 获取当前路由的一级菜单信息
      const parentMenu = getParentMenuForRoute(currentRouteName)
      
      // 如果有一级菜单，添加一级菜单（不可点击）
      if (parentMenu) {
        breadcrumbList.push({
          title: t(parentMenu.titleKey),
          path: null // 一级菜单不可点击
        })
      }
      
      // 添加当前页面（如果是当前页，不可点击）
      const titleKey = getPageTitleKeyForRoute(currentRouteName)
      if (titleKey) {
        breadcrumbList.push({
          title: t(titleKey),
          path: null // 当前页面不可点击
        })
      }
      
      return breadcrumbList
    })

    // i18n helpers
    const { getCurrentLocale, loadLocaleMessages } = require('../i18n')
    
    // 侧边栏折叠状态
    const collapsed = ref(localStorage.getItem('sidebarCollapsed') === '1')
    
    // 菜单选中状态
    const selectedKeys = ref([route.path])
    
    // 根据当前路径确定应该展开的子菜单
    const getOpenKeysFromPath = (path) => {
      if (path.includes('/error-codes') || path.includes('/i18n-error-codes') || path.includes('/fault-cases') || path.includes('/analysis-categories') || path.includes('/config-management')) {
        return ['data-management']
      }
      if (path.includes('/logs') || path.includes('/data-replay') || path.includes('/surgeries')) {
        return ['log-analysis']
      }
      if (path.includes('/users') || path.includes('/roles') || path.includes('/devices') || path.includes('/history') || path.includes('/monitoring')) {
        return ['system-management']
      }
      return []
    }
    
    const openKeys = ref(getOpenKeysFromPath(route.path))
    
    // 监听路由变化，更新选中菜单和展开的子菜单
    watch(() => route.path, (newPath) => {
      selectedKeys.value = [newPath]
      openKeys.value = getOpenKeysFromPath(newPath)
    }, { immediate: true })
    
    const toggleCollapsed = () => {
      collapsed.value = !collapsed.value
      localStorage.setItem('sidebarCollapsed', collapsed.value ? '1' : '0')
    }

    const onSiderCollapsedChange = (val) => {
      collapsed.value = !!val
      localStorage.setItem('sidebarCollapsed', collapsed.value ? '1' : '0')
    }
    
    const handleMenuClick = ({ key }) => {
      router.push(key)
    }

    const onSelectedKeys = (keys) => {
      selectedKeys.value = Array.isArray(keys) ? keys : [keys]
    }

    const onOpenKeys = (keys) => {
      openKeys.value = Array.isArray(keys) ? keys : []
    }
    
    const currentUser = computed(() => store.getters['auth/currentUser'])
    
    const getPageTitleKey = computed(() => {
      const nameMap = {
        ErrorCodes: 'errorCodes.title',
        I18nErrorCodes: 'i18nErrorCodes.title',
        FaultCases: 'faultCases.title',
        FaultCaseDetail: 'faultCases.title',
        AnalysisCategories: 'analysisCategories.title',
        ConfigManagement: 'configManagement.title',
        Logs: 'logs.title',
        Devices: 'devices.title',
        Feedback: 'feedback.title',
        DataReplay: 'dataReplay.title',
        Surgeries: 'logs.surgeryData',
        Account: 'account.title',
        History: 'history.title',
        Users: 'users.title',
        Roles: 'roles.title',
        BatchAnalysis: 'batchAnalysis.title',
        GlobalDashboard: 'globalDashboard.title',
        Monitoring: 'monitoring.title'
      }
      return nameMap[route.name] || 'nav.dashboard'
    })
    
    const pageTitle = computed(() => {
      return t(getPageTitleKey.value)
    })
    
    const handleUserCommand = async ({ key }) => {
      console.log('用户菜单点击:', key) // 添加调试信息
      if (key === 'logout') {
        try {
          await Modal.confirm({
            title: t('shared.info'),
            content: t('shared.messages.confirmLogout'),
            okText: t('shared.confirm'),
            cancelText: t('shared.cancel'),
            onOk: () => {
              store.dispatch('auth/logout')
              router.push('/login')
            }
          })
        } catch {
          // 用户取消
        }
      } else if (key === 'profile') {
        console.log('跳转到账户页面') // 添加调试信息
        router.push('/dashboard/account')
      }
    }
    
    const currentLocaleLabel = computed(() => {
      const cur = getCurrentLocale?.() || 'zh-CN'
      return cur === 'en-US' ? 'English' : '中文'
    })

    const handleLanguageChange = async ({ key }) => {
      await loadLocaleMessages?.(key)
    }
    
    // 根据路由 meta 决定是否隐藏侧边栏
    const hideSidebar = computed(() => {
      return route.meta?.hideSidebar === true
    })
    
    // 根据路由名称决定是否隐藏内容包装器（dashboard-content）
    const hideContentWrapper = computed(() => {
      return route.name === 'ErrorCodes' ||
             route.name === 'I18nErrorCodes' ||
             route.name === 'FaultCases' ||
             route.name === 'ConfigManagement'
    })
    
    return {
      collapsed,
      selectedKeys,
      openKeys,
      toggleCollapsed,
      handleMenuClick,
      onSelectedKeys,
      onOpenKeys,
      currentUser,
      getPageTitleKey,
      pageTitle,
      handleUserCommand,
      handleLanguageChange,
      currentLocaleLabel,
      onSiderCollapsedChange,
      hideSidebar,
      hideContentWrapper,
      breadcrumbs
    }
  }
}
</script>

<style scoped>
.dashboard-layout {
  min-height: 100vh;
  background: rgb(var(--background));
}

.dashboard-sider {
  background: rgb(var(--sidebar-background)) !important;
  border-right: 1px solid rgb(var(--border));
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* 覆盖 ant-design-vue 默认样式 */
:deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--sidebar-background));
  color: rgb(var(--sidebar-foreground));
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid rgb(var(--border));
  padding: 0 16px;
  flex-shrink: 0;
}

.logo-text {
  height: 32px;
  width: auto;
  /* 如果Logo是白色的，移除 filter 或者根据背景色调整 */
}

.logo-icon-svg {
  width: 40px;
  height: 40px;
}

.sidebar-menu-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0; /* 允许 flex 子元素缩小 */
}

.dashboard-menu {
  background: transparent !important;
  border-right: none;
  flex: 1;
  min-height: 0; /* 允许 flex 子元素缩小 */
}

/* 菜单交互样式优化 */
:deep(.ant-menu-item), :deep(.ant-menu-submenu-title) {
  margin: 4px 8px !important;
  border-radius: var(--radius) !important;
  width: calc(100% - 16px) !important;
  color: rgb(var(--sidebar-foreground)) !important;
}

:deep(.ant-menu-item .anticon), :deep(.ant-menu-submenu-title .anticon) {
  color: rgb(var(--sidebar-foreground)) !important;
}

:deep(.ant-menu-item:hover), :deep(.ant-menu-submenu-title:hover) {
  background-color: rgb(var(--sidebar-hover)) !important;
  color: rgb(var(--sidebar-foreground)) !important;
}

:deep(.ant-menu-item:hover .anticon), :deep(.ant-menu-submenu-title:hover .anticon) {
  color: rgb(var(--sidebar-foreground)) !important;
}

:deep(.ant-menu-item-selected) {
  background-color: rgb(var(--sidebar-accent)) !important;
  color: rgb(var(--sidebar-primary)) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

:deep(.ant-menu-item-selected .anticon) {
  color: rgb(var(--sidebar-primary)) !important;
}

/* 子菜单内部项目文字颜色 */
:deep(.ant-menu-submenu .ant-menu-item) {
  color: rgb(var(--sidebar-foreground)) !important;
}

:deep(.ant-menu-submenu .ant-menu-item .anticon) {
  color: rgb(var(--sidebar-foreground)) !important;
}

:deep(.ant-menu-submenu .ant-menu-item:hover) {
  color: rgb(var(--sidebar-foreground)) !important;
}

:deep(.ant-menu-submenu .ant-menu-item:hover .anticon) {
  color: rgb(var(--sidebar-foreground)) !important;
}

:deep(.ant-menu-submenu .ant-menu-item-selected) {
  color: rgb(var(--sidebar-primary)) !important;
}

:deep(.ant-menu-submenu .ant-menu-item-selected .anticon) {
  color: rgb(var(--sidebar-primary)) !important;
}

/* 侧边栏底部用户区域 - 固定在底部 */
.sidebar-footer {
  padding: 16px 8px;
  border-top: 1px solid rgb(var(--border));
  flex-shrink: 0;
  background: rgb(var(--sidebar-background));
  margin-top: auto; /* 确保始终在底部 */
}

.user-menu-wrapper {
  width: 100%;
}

.user-info-btn {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.3s;
  width: 100%;
}

.user-info-btn:hover {
  background: rgb(var(--sidebar-hover));
}

.user-avatar {
  background: rgb(var(--primary)); /* 使用设计Token - 蓝紫色 */
  flex-shrink: 0;
}

.user-details {
  margin-left: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}

.username-text {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--sidebar-primary)); /* 使用设计Token - 深色文字 */
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.role-text {
  font-size: 12px;
  color: rgb(var(--sidebar-foreground)); /* 使用设计Token - 灰色文字 */
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.settings-icon {
  color: rgb(var(--sidebar-foreground)); /* 使用设计Token - 灰色图标 */
  font-size: 16px;
  margin-left: 4px;
}

.main-layout {
  background: rgb(var(--background));
}

.dashboard-header {
  background: transparent;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  line-height: 64px;
}

.header-left {
  display: flex;
  align-items: center;
}

.trigger-btn {
  font-size: 18px;
  margin-right: 16px;
  color: rgb(var(--text-secondary)); /* 使用设计Token - 次要文字颜色 */
}

.nav-breadcrumb {
  font-size: 14px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.lang-btn {
  color: rgb(var(--text-secondary)); /* 使用设计Token - 次要文字颜色 */
}

.dashboard-content {
  margin: 0 24px 24px;
  padding: 24px;
  background: white;
  border-radius: 12px;
  min-height: calc(100vh - 88px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
  overflow-y: auto;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .dashboard-content {
    margin: 16px;
    padding: 16px;
  }
  
  .dashboard-header {
    padding: 0 16px;
  }
}
</style> 