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
          <h2>LogTool</h2>
        </template>
        <template v-else>
          <div class="logo-icon">LT</div>
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
        <!-- 主要功能模块 -->
        <a-menu-item key="/dashboard/error-codes">
          <template #icon>
            <div class="custom-icon">
              <img src="/Icons/book-shelf-line.svg" alt="Error Codes" />
            </div>
          </template>
          <span>{{ $t('nav.errorCodes') }}</span>
        </a-menu-item>
        
        <a-menu-item key="/dashboard/i18n-error-codes">
          <template #icon>
            <TranslationOutlined />
          </template>
          <span>{{ $t('i18nErrorCodes.title') }}</span>
        </a-menu-item>
        
        <a-menu-item key="/dashboard/logs">
          <template #icon>
            <DatabaseOutlined />
          </template>
          <span>{{ $t('nav.logs') }}</span>
        </a-menu-item>

        <a-menu-item v-if="isAdminOrExpert" key="/dashboard/devices">
          <template #icon>
            <ToolOutlined />
          </template>
          <span>{{ $t('devices.title') }}</span>
        </a-menu-item>
        
        <a-menu-item v-if="isAdmin" key="/dashboard/data-replay">
          <template #icon>
            <PlayCircleOutlined />
          </template>
          <span>{{ $t('dataReplay.title') }}</span>
        </a-menu-item>
        
        <a-menu-item key="/dashboard/feedback">
          <template #icon>
            <BugOutlined />
          </template>
          <span>{{ $t('feedback.title') }}</span>
        </a-menu-item>
        
        <a-menu-item key="/dashboard/account">
          <template #icon>
            <UserOutlined />
          </template>
          <span>{{ $t('account.title') }}</span>
        </a-menu-item>
        
        <a-menu-item key="/dashboard/global-dashboard">
          <template #icon>
            <AppstoreOutlined />
          </template>
          <span>全局看板</span>
        </a-menu-item>
        
        <!-- 只有管理员可以看到历史记录 -->
        <a-menu-item v-if="isAdmin" key="/dashboard/history">
          <template #icon>
            <BookOutlined />
          </template>
          <span>{{ $t('nav.history') }}</span>
        </a-menu-item>
        
        <!-- 管理员菜单 -->
        <template v-if="isAdmin">
          <a-divider v-if="!collapsed" class="menu-divider" />
          
          <a-menu-item key="/dashboard/users">
            <template #icon>
              <TeamOutlined />
            </template>
            <span>{{ $t('users.title') }}</span>
          </a-menu-item>
          
          <a-menu-item key="/dashboard/roles">
            <template #icon>
              <SafetyOutlined />
            </template>
            <span>{{ $t('roles.title') }}</span>
          </a-menu-item>

          <a-menu-item key="/dashboard/explanation-tester">
            <template #icon>
              <ExperimentOutlined />
            </template>
            <span>释义测试</span>
          </a-menu-item>
        </template>
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
  AppstoreOutlined
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
    AppstoreOutlined
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    
    // 侧边栏折叠状态
    const collapsed = ref(localStorage.getItem('sidebarCollapsed') === '1')
    
    // 菜单选中状态
    const selectedKeys = ref([route.path])
    const openKeys = ref([])
    
    // 监听路由变化，更新选中菜单
    watch(() => route.path, (newPath) => {
      selectedKeys.value = [newPath]
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
        Logs: 'logs.title',
        Devices: 'devices.title',
        Feedback: 'feedback.title',
        DataReplay: 'dataReplay.title',
        Account: 'account.title',
        History: 'history.title',
        Users: 'users.title',
        Roles: 'roles.title',
        LogDetail: 'logDetail.title',
        BatchAnalysis: 'batchAnalysis.title',
        GlobalDashboard: '全局看板'
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
}

.logo h2 {
  margin: 0;
  color: white;
  font-size: 20px;
  font-weight: 600;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: #1890ff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  color: white;
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