<template>
  <a-layout class="dashboard-layout">
    <!-- 侧边栏 -->
    <a-layout-sider
      :collapsed="collapsed"
      @update:collapsed="onSiderCollapsedChange"
      :trigger="null"
      collapsible
      class="dashboard-sider"
      :width="256"
      :collapsed-width="80"
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
      
      <!-- 菜单 -->
      <a-menu
        :selectedKeys="selectedKeys"
        @update:selectedKeys="onSelectedKeys"
        :openKeys="openKeys"
        @update:openKeys="onOpenKeys"
        mode="inline"
        theme="dark"
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
          <a-menu-item key="/dashboard/analysis-categories">
            <span>{{ $t('analysisCategories.title') }}</span>
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
    </a-layout-sider>
    
    <!-- 主内容区域 -->
    <a-layout class="main-layout">
      <!-- 顶部导航栏 -->
      <a-layout-header class="dashboard-header">
        <div class="header-left">
          <a-button
            type="text"
            class="trigger-btn"
            @click="toggleCollapsed"
          >
            <template #icon>
              <MenuUnfoldOutlined v-if="collapsed" />
              <MenuFoldOutlined v-else />
            </template>
          </a-button>
          <h3 class="page-title">{{ pageTitle }}</h3>
        </div>
        
        <div class="header-right">
          <!-- 语言切换 -->
          <a-dropdown>
            <a-button type="text">
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
          
          <!-- 用户名显示 -->
          <span v-if="currentUser && currentUser.username" class="username">
            {{ currentUser.username }}
          </span>
          
          <!-- 用户菜单 -->
          <a-dropdown>
            <a-button type="text">
              <template #icon>
                <UserOutlined />
              </template>
            </a-button>
            <template #overlay>
              <a-menu @click="handleUserCommand">
                <a-menu-item key="profile">{{ $t('nav.profile') }}</a-menu-item>
                <a-menu-item key="logout" divided>{{ $t('nav.logout') }}</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>
      
      <!-- 内容区域 -->
      <a-layout-content class="dashboard-content">
        <router-view />
      </a-layout-content>
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
  SearchOutlined
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
    SearchOutlined
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    // i18n helpers
    const { getCurrentLocale, loadLocaleMessages } = require('../i18n')
    
    // 侧边栏折叠状态
    const collapsed = ref(localStorage.getItem('sidebarCollapsed') === '1')
    
    // 菜单选中状态
    const selectedKeys = ref([route.path])
    
    // 根据当前路径确定应该展开的子菜单
    const getOpenKeysFromPath = (path) => {
      if (path.includes('/error-codes') || path.includes('/i18n-error-codes') || path.includes('/fault-cases') || path.includes('/analysis-categories')) {
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
      onSiderCollapsedChange
    }
  }
}
</script>

<style scoped>
.dashboard-layout {
  min-height: 100vh;
}

.dashboard-sider {
  background: #002446;
}

.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #002446;
  color: white;
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid #002446;
  padding: 0 16px;
}

.logo-text {
  height: 32px;
  width: auto;
  filter: brightness(0) invert(1);
}

.logo-icon-svg {
  width: 40px;
  height: 40px;
  filter: brightness(0) invert(1);
}

.dashboard-menu {
  border-right: none;
  overflow: hidden;
}

.menu-divider {
  margin: 8px 0;
  border-color: #303030;
  width: 100%;
  overflow: hidden;
}

/* 确保分割线在折叠状态下完全隐藏 */
.dashboard-sider.ant-layout-sider-collapsed .menu-divider {
  display: none !important;
}

.main-layout {
  background: #f0f2f5;
}

.dashboard-header {
  background: white;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  z-index: 1;
}

.header-left {
  display: flex;
  align-items: center;
}

.trigger-btn {
  font-size: 18px;
  margin-right: 16px;
  color: #666;
}

.page-title {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.username {
  color: #666;
  font-weight: 500;
  margin: 0 8px;
}

.dashboard-content {
  margin: 24px;
  padding: 24px;
  background: white;
  border-radius: 6px;
  min-height: calc(100vh - 112px);
  overflow-y: auto;
}

/* 自定义图标样式 */
.custom-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.custom-icon img {
  width: 16px;
  height: 16px;
  filter: brightness(0) invert(1);
  opacity: 0.8;
  transition: opacity 0.3s ease;
}

.custom-icon img:hover {
  opacity: 1;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .dashboard-content {
    margin: 16px;
    padding: 16px;
  }
  
  .dashboard-header {
    padding: 0 16px;
  }
  
  .page-title {
    font-size: 16px;
  }
}
</style> 