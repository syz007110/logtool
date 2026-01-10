<template>
  <el-container class="dashboard-layout">
    <!-- 侧边栏 -->
    <el-aside
      v-if="!hideSidebar"
      :width="collapsed ? '80px' : '256px'"
      class="dashboard-sider"
      :class="{ 'is-collapsed': collapsed }"
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
        <el-menu
          :default-active="activeMenuKey"
          :default-openeds="openKeys"
          :collapse="collapsed"
          class="dashboard-menu"
          @select="handleMenuSelect"
        >
          <!-- 智能搜索：跳转到独立页面 -->
          <el-menu-item index="/smart-search">
            <el-icon :size="20"><Search /></el-icon>
            <template #title>{{ $t('smartSearch.title') }}</template>
          </el-menu-item>
          
          <!-- 故障码管理 -->
          <el-sub-menu index="data-management">
            <template #title>
              <el-icon :size="20"><Folder /></el-icon>
              <span>{{ $t('nav.dataManagement') }}</span>
            </template>
            <el-menu-item index="/dashboard/error-codes">
              {{ $t('errorCodes.title') }}
            </el-menu-item>
            <el-menu-item index="/dashboard/i18n-error-codes">
              {{ $t('i18nErrorCodes.title') }}
            </el-menu-item>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('fault_case:read')" index="/dashboard/fault-cases">
              {{ $t('faultCases.title') }}
            </el-menu-item>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('loglevel:manage')" index="/dashboard/config-management">
              {{ $t('configManagement.title') }}
            </el-menu-item>
          </el-sub-menu>
          
          <!-- 日志与手术数据 -->
          <el-sub-menu index="log-analysis">
            <template #title>
              <el-icon :size="20"><Document /></el-icon>
              <span>{{ $t('nav.logAndSurgery') }}</span>
            </template>
            <el-menu-item index="/dashboard/logs">
              {{ $t('logs.title') }}
            </el-menu-item>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('data_replay:manage')" index="/dashboard/data-replay">
              {{ $t('dataReplay.title') }}
            </el-menu-item>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('surgery:read') || $store.getters['auth/hasPermission']('surgery:read_own')" index="/dashboard/surgeries">
              {{ $t('logs.surgeryData') }}
            </el-menu-item>
          </el-sub-menu>
          
          <!-- 全局看板 -->
          <el-menu-item index="/dashboard/global-dashboard">
            <el-icon :size="20"><Grid /></el-icon>
            <template #title>{{ $t('globalDashboard.title') }}</template>
          </el-menu-item>
          
          <!-- 缺陷反馈 -->
          <el-menu-item index="/dashboard/feedback">
            <el-icon :size="20"><Warning /></el-icon>
            <template #title>{{ $t('feedback.title') }}</template>
          </el-menu-item>
          
          <!-- 账户信息 -->
          <el-menu-item index="/dashboard/account">
            <el-icon :size="20"><User /></el-icon>
            <template #title>{{ $t('account.title') }}</template>
          </el-menu-item>
          
          <!-- 系统管理 -->
          <el-sub-menu v-if="$store.getters['auth/hasPermission']('user:read') || $store.getters['auth/hasPermission']('role:read') || $store.getters['auth/hasPermission']('device:read') || $store.getters['auth/hasPermission']('history:read_all')" index="system-management">
            <template #title>
              <el-icon :size="20"><Setting /></el-icon>
              <span>{{ $t('nav.systemManagement') }}</span>
            </template>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('user:read')" index="/dashboard/users">
              {{ $t('users.title') }}
            </el-menu-item>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('role:read')" index="/dashboard/roles">
              {{ $t('roles.title') }}
            </el-menu-item>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('device:read')" index="/dashboard/devices">
              {{ $t('devices.title') }}
            </el-menu-item>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('history:read_all') || $store.getters['auth/hasPermission']('history:read_own')" index="/dashboard/history">
              {{ $t('history.title') }}
            </el-menu-item>
            <el-menu-item v-if="$store.getters['auth/hasPermission']('system:monitor')" index="/dashboard/monitoring">
              {{ $t('monitoring.title') }}
            </el-menu-item>
          </el-sub-menu>
          
          <!-- 测试 -->
          <el-menu-item v-if="$store.getters['auth/hasPermission']('test:explain')" index="/dashboard/explanation-tester">
            <el-icon :size="20"><Tools /></el-icon>
            <template #title>{{ $t('nav.test') }}</template>
          </el-menu-item>
        </el-menu>
      </div>

      <!-- 侧边栏底部用户菜单 - 固定在底部 -->
      <div class="sidebar-footer">
        <div class="user-menu-wrapper">
          <el-dropdown placement="top" trigger="click" @command="handleUserCommand">
            <div class="user-info-btn" :class="{ 'is-collapsed': collapsed }">
              <el-avatar :size="collapsed ? 32 : 40" class="user-avatar">
                <el-icon><User /></el-icon>
              </el-avatar>
              <div v-if="!collapsed" class="user-info-content">
                <div class="user-details">
                  <span class="username-text">{{ currentUser?.username || 'User' }}</span>
                  <span class="role-text">{{ getRoleDisplayName(currentUser?.role) }}</span>
                </div>
                <el-icon class="chevron-icon"><ArrowDown /></el-icon>
              </div>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile" class="dropdown-item-normal">
                  <el-icon><User /></el-icon>
                  {{ $t('nav.profile') }}
                </el-dropdown-item>
                <el-dropdown-item divided command="logout" class="dropdown-item-danger">
                  <el-icon><SwitchButton /></el-icon>
                  {{ $t('nav.logout') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-aside>
    
    <!-- 主内容区域 -->
    <el-container class="main-layout">
      <!-- 顶部导航栏 -->
      <el-header v-if="!hideSidebar" class="dashboard-header">
        <div class="header-left">
          <el-button
            text
            class="trigger-btn"
            @click="toggleCollapsed"
          >
            <el-icon :size="20"><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
          </el-button>
          
          <!-- 导航层级 (Breadcrumbs) -->
          <el-breadcrumb class="nav-breadcrumb" separator="/">
            <el-breadcrumb-item v-for="(item, index) in breadcrumbs" :key="index">
              <router-link v-if="item.path" :to="item.path">{{ item.title }}</router-link>
              <span v-else>{{ item.title }}</span>
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        
        <div class="header-right">
          <!-- 语言切换 -->
          <el-dropdown trigger="click" @command="handleLanguageChange">
            <el-button text class="lang-btn">
              <el-icon><Globe /></el-icon>
              {{ currentLocaleLabel }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="zh-CN">中文</el-dropdown-item>
                <el-dropdown-item command="en-US">English</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <!-- 内容区域 -->
      <el-main v-if="!hideSidebar && !hideContentWrapper" class="dashboard-content">
        <router-view />
      </el-main>
      <div v-else class="router-view-wrapper">
        <router-view />
      </div>
    </el-container>
  </el-container>
</template>

<script>
import { computed, ref, watch } from 'vue'
import { getCurrentLocale, loadLocaleMessages } from '../i18n'
import { useI18n } from 'vue-i18n'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  Search,
  Folder,
  Document,
  Grid,
  Warning,
  User,
  Setting,
  Tools,
  Fold,
  Expand,
  Globe,
  SwitchButton,
  ArrowDown
} from '@element-plus/icons-vue'

export default {
  name: 'Dashboard',
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
        Monitoring: 'monitoring.title',
        ExplanationTester: 'nav.test'
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
    
    // Element Plus 菜单使用 default-active（当前激活的菜单项）
    const activeMenuKey = computed(() => route.path)
    
    // 根据当前路径确定应该展开的子菜单
    const getOpenKeysFromPath = (path) => {
      const keys = []
      if (path.includes('/error-codes') || path.includes('/i18n-error-codes') || path.includes('/fault-cases') || path.includes('/analysis-categories') || path.includes('/config-management')) {
        keys.push('data-management')
      }
      if (path.includes('/logs') || path.includes('/data-replay') || path.includes('/surgeries')) {
        keys.push('log-analysis')
      }
      if (path.includes('/users') || path.includes('/roles') || path.includes('/devices') || path.includes('/history') || path.includes('/monitoring')) {
        keys.push('system-management')
      }
      return keys
    }
    
    const openKeys = ref(getOpenKeysFromPath(route.path))
    
    // 监听路由变化，更新展开的子菜单
    watch(() => route.path, (newPath) => {
      openKeys.value = getOpenKeysFromPath(newPath)
    }, { immediate: true })
    
    const toggleCollapsed = () => {
      collapsed.value = !collapsed.value
      localStorage.setItem('sidebarCollapsed', collapsed.value ? '1' : '0')
    }
    
    // Element Plus 菜单选择事件
    const handleMenuSelect = (index) => {
      router.push(index)
    }
    
    const currentUser = computed(() => store.getters['auth/currentUser'])
    
    // 获取角色显示名称
    const getRoleDisplayName = (role) => {
      if (!role) return ''
      const roleMap = {
        admin: t('users.roleAdmin'),
        expert: t('users.roleExpert'),
        user: t('users.roleUser')
      }
      return roleMap[role] || role
    }
    
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
        Monitoring: 'monitoring.title',
        ExplanationTester: 'nav.test'
      }
      return nameMap[route.name] || 'nav.dashboard'
    })
    
    const pageTitle = computed(() => {
      return t(getPageTitleKey.value)
    })
    
    const handleUserCommand = async (command) => {
      console.log('用户菜单点击:', command) // 添加调试信息
      if (command === 'logout') {
        try {
          await ElMessageBox.confirm(
            t('shared.messages.confirmLogout'),
            t('shared.info'),
            {
              confirmButtonText: t('shared.confirm'),
              cancelButtonText: t('shared.cancel'),
              type: 'warning'
            }
          )
          store.dispatch('auth/logout')
          router.push('/login')
        } catch {
          // 用户取消
        }
      } else if (command === 'profile') {
        console.log('跳转到账户页面') // 添加调试信息
        router.push('/dashboard/account')
      }
    }
    
    const currentLocaleLabel = computed(() => {
      const cur = getCurrentLocale?.() || 'zh-CN'
      return cur === 'en-US' ? 'English' : '中文'
    })

    const handleLanguageChange = async (locale) => {
      await loadLocaleMessages?.(locale)
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
             route.name === 'ConfigManagement' ||
             route.name === 'Logs' ||
             route.name === 'Surgeries' ||
             route.name === 'DataReplay' ||
             route.name === 'GlobalDashboard' ||
             route.name === 'Feedback' ||
             route.name === 'Account' ||
             route.name === 'ExplanationTester'
    })
    
    return {
      collapsed,
      openKeys,
      toggleCollapsed,
      currentUser,
      getRoleDisplayName,
      getPageTitleKey,
      pageTitle,
      handleUserCommand,
      handleLanguageChange,
      currentLocaleLabel,
      activeMenuKey,
      handleMenuSelect,
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
  background: var(--black-white-white); /* 使用基础颜色值 */
}

.dashboard-sider {
  background: var(--el-aside-background-color) !important; /* 使用 Element Plus 变量 */
  border-right: 1px solid var(--el-aside-border-color); /* 使用 Element Plus 变量 */
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* 平滑的宽度过渡动画 */
}

/* Element Plus 侧边栏样式 */
:deep(.el-aside) {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.logo {
  height: var(--logo-area-height); /* 使用 Design Token */
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-aside-background-color); /* 使用 Element Plus 变量 */
  color: var(--el-menu-text-color); /* 使用 Element Plus 变量 */
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid var(--el-aside-border-color); /* 使用 Element Plus 变量 */
  padding: 0 var(--logo-area-padding); /* 使用 Design Token */
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* Logo 区域过渡动画 */
}

.logo-text {
  height: var(--logo-size); /* 使用 Design Token - 统一尺寸 */
  width: auto; /* 保持宽高比 */
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.logo-icon-svg {
  width: var(--logo-size); /* 使用 Design Token - 统一尺寸 */
  height: var(--logo-size); /* 使用 Design Token - 统一尺寸 */
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-menu-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

/* 侧边栏底部用户区域 - 固定在底部 */
.sidebar-footer {
  padding: 12px; /* 统一的 padding */
  border-top: 1px solid var(--gray-200); /* 使用 Design Token - 浅灰色分隔线 */
  flex-shrink: 0;
  background: var(--el-aside-background-color); /* 使用 Element Plus 变量 */
  margin-top: auto; /* 确保始终在底部 */
}

.user-menu-wrapper {
  width: 100%;
}

/* 让 el-dropdown 占满父容器宽度 */
.user-menu-wrapper :deep(.el-dropdown) {
  display: block !important;
  width: 100%;
}

.user-info-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 12px; /* 更舒适的内边距 */
  border-radius: var(--radius-md); /* 使用 Design Token - 8px 圆角 */
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); /* 平滑过渡动画 */
  width: 100%;
  background: transparent;
  border: 1px solid transparent; /* 预留边框位置，hover 时显示 */
  gap: 12px; /* 元素之间的间距 */
}

.user-info-btn:hover {
  background: var(--gray-50); /* 极浅灰色背景，更柔和的 hover 效果 */
  border-color: var(--gray-200); /* 浅灰色边框 */
}

.user-info-btn:active {
  background: var(--gray-100); /* 点击时的背景 */
}

/* 折叠状态下的按钮样式 */
.user-info-btn.is-collapsed {
  justify-content: center;
  padding: 8px;
  gap: 0;
}

.user-avatar {
  background: linear-gradient(135deg, var(--indigo-500) 0%, var(--purple-500) 100%); /* 渐变背景 */
  color: var(--black-white-white); /* 白色图标 */
  flex-shrink: 0;
  border: 2px solid var(--gray-100); /* 浅色边框 */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); /* 轻微阴影 */
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.user-info-btn:hover .user-avatar {
  transform: scale(1.05); /* hover 时轻微放大 */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); /* hover 时阴影加深 */
}

.user-info-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 0; /* 允许内容收缩 */
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.user-details {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  min-width: 0; /* 允许内容收缩 */
  gap: 2px; /* 用户名和角色之间的间距 */
}

.username-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-900); /* 使用 Design Token - 深灰色文字 */
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  line-height: 1.4;
}

.role-text {
  font-size: 12px;
  color: var(--gray-500); /* 使用 Design Token - 中等灰色文字 */
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  line-height: 1.4;
}

.chevron-icon {
  color: var(--gray-400); /* 使用 Design Token - 浅灰色图标 */
  font-size: 14px;
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-left: 8px;
}

.user-info-btn:hover .chevron-icon {
  color: var(--gray-600); /* hover 时图标颜色加深 */
  transform: translateY(1px); /* 轻微下移，表示可点击 */
}


.main-layout {
  background: var(--black-white-white); /* 使用基础颜色值 */
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.router-view-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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
  margin-right: 16px;
  color: var(--slate-600); /* 使用基础颜色值 - 次要文字颜色 */
}

.trigger-btn .el-icon {
  font-size: 20px;
  width: 20px;
  height: 20px;
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
  color: var(--slate-600); /* 使用基础颜色值 - 次要文字颜色 */
}

.dashboard-content {
  margin: 0;
  padding: 0;
  background: transparent;
  overflow-y: auto;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .dashboard-content {
    margin: 0;
    padding: 0;
  }
  
  .dashboard-header {
    padding: 0 16px;
  }
}
</style> 