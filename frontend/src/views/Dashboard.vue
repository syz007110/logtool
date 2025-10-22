<template>
  <a-layout class="dashboard-layout">
    <!-- 侧边栏 -->
    <a-layout-sider
      v-model:collapsed="collapsed"
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
        v-model:selectedKeys="selectedKeys"
        v-model:openKeys="openKeys"
        mode="inline"
        theme="dark"
        class="dashboard-menu"
        @click="handleMenuClick"
      >
        <!-- 数据管理 -->
        <a-sub-menu key="data-management">
          <template #icon>
            <DatabaseOutlined />
          </template>
          <template #title>数据管理</template>
          <a-menu-item key="/dashboard/error-codes">
            <span>故障码管理</span>
          </a-menu-item>
          <a-menu-item key="/dashboard/i18n-error-codes">
            <span>多语言管理</span>
          </a-menu-item>
          <a-menu-item key="/dashboard/analysis-categories">
            <span>日志分析等级管理</span>
          </a-menu-item>
        </a-sub-menu>
        
        <!-- 日志与手术分析 -->
        <a-sub-menu key="log-analysis">
          <template #icon>
            <FileTextOutlined />
          </template>
          <template #title>日志与手术分析</template>
          <a-menu-item key="/dashboard/logs">
            <span>日志解析</span>
          </a-menu-item>
          <a-menu-item v-if="isAdminOrExpert" key="/dashboard/data-replay">
            <span>数据解析</span>
          </a-menu-item>
          <a-menu-item key="/dashboard/surgery-analysis" disabled>
            <span>手术分析（暂无内容）</span>
          </a-menu-item>
        </a-sub-menu>
        
        <!-- 缺陷反馈 -->
        <a-menu-item key="/dashboard/feedback">
          <template #icon>
            <BugOutlined />
          </template>
          <span>缺陷反馈</span>
        </a-menu-item>
        
        <!-- 账户信息 -->
        <a-menu-item key="/dashboard/account">
          <template #icon>
            <UserOutlined />
          </template>
          <span>账户信息</span>
        </a-menu-item>
        
        <!-- 系统管理 -->
        <a-sub-menu v-if="isAdmin" key="system-management">
          <template #icon>
            <SettingOutlined />
          </template>
          <template #title>系统管理</template>
          <a-menu-item key="/dashboard/users">
            <span>用户管理</span>
          </a-menu-item>
          <a-menu-item key="/dashboard/roles">
            <span>角色管理</span>
          </a-menu-item>
          <a-menu-item key="/dashboard/devices">
            <span>设备管理</span>
          </a-menu-item>
          <a-menu-item key="/dashboard/history">
            <span>历史记录</span>
          </a-menu-item>
          <a-menu-item key="/dashboard/monitoring">
            <span>系统监控</span>
          </a-menu-item>
        </a-sub-menu>
        
        <!-- 测试 -->
        <a-menu-item v-if="isAdmin" key="/dashboard/explanation-tester">
          <template #icon>
            <ExperimentOutlined />
          </template>
          <span>测试</span>
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
          <h3 class="page-title">{{ $t(getPageTitleKey) }}</h3>
        </div>
        
        <div class="header-right">
          <!-- 语言切换 -->
          <a-dropdown :disabled="true">
            <a-button type="text" disabled>
              <template #icon>
                <GlobalOutlined />
              </template>
              中文
            </a-button>
            <template #overlay>
              <a-menu @click="handleLanguageChange">
                <a-menu-item key="zh-CN">中文</a-menu-item>
                <a-menu-item key="en-US" disabled>English (暂不可用)</a-menu-item>
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
  MonitorOutlined
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
    MonitorOutlined
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    
    // 侧边栏折叠状态
    const collapsed = ref(localStorage.getItem('sidebarCollapsed') === '1')
    
    // 菜单选中状态
    const selectedKeys = ref([route.path])
    
    // 根据当前路径确定应该展开的子菜单
    const getOpenKeysFromPath = (path) => {
      if (path.includes('/error-codes') || path.includes('/i18n-error-codes') || path.includes('/analysis-categories')) {
        return ['data-management']
      }
      if (path.includes('/logs') || path.includes('/data-replay')) {
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
    
    const handleMenuClick = ({ key }) => {
      router.push(key)
    }
    
    const currentUser = computed(() => store.getters['auth/currentUser'])
    const isAdmin = computed(() => store.getters['auth/userRole'] === 'admin')
    const isAdminOrExpert = computed(() => {
      const role = store.getters['auth/userRole']
      return role === 'admin' || role === 'expert'
    })
    
    const getPageTitleKey = computed(() => {
      const nameMap = {
        ErrorCodes: 'errorCodes.title',
        I18nErrorCodes: 'i18nErrorCodes.title',
        AnalysisCategories: 'analysisCategories.title',
        Logs: 'logs.title',
        Devices: 'devices.title',
        Feedback: 'feedback.title',
        DataReplay: 'dataReplay.title',
        Account: 'account.title',
        History: 'history.title',
        Users: 'users.title',
        Roles: 'roles.title',
        BatchAnalysis: 'batchAnalysis.title',
        GlobalDashboard: '全局看板',
        Monitoring: '系统监控'
      }
      return nameMap[route.name] || 'nav.dashboard'
    })
    
    const handleUserCommand = async ({ key }) => {
      console.log('用户菜单点击:', key) // 添加调试信息
      if (key === 'logout') {
        try {
          await Modal.confirm({
            title: '提示',
            content: '确定要退出登录吗？',
            okText: '确定',
            cancelText: '取消',
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
    
    const handleLanguageChange = ({ key }) => {
      console.log('语言切换:', key)
      // 暂时只支持中文
      if (key === 'zh-CN') {
        store.dispatch('auth/setLanguage', key)
        window.location.reload()
      }
    }
    
    return {
      collapsed,
      selectedKeys,
      openKeys,
      toggleCollapsed,
      handleMenuClick,
      currentUser,
      isAdmin,
      isAdminOrExpert,
      getPageTitleKey,
      handleUserCommand,
      handleLanguageChange
    }
  }
}
</script>

<style scoped>
.dashboard-layout {
  min-height: 100vh;
}

.dashboard-sider {
  background: #001529;
}

.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #002140;
  color: white;
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid #002140;
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