<template>
  <div class="dashboard-container">
    <!-- 侧边栏 -->
    <el-aside width="250px" class="sidebar">
      <div class="sidebar-header">
        <h2>LogTool</h2>
      </div>
      
      <el-menu
        :default-active="$route.path"
        class="sidebar-menu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/dashboard/error-codes">
          <el-icon><Document /></el-icon>
          <span>{{ $t('nav.errorCodes') }}</span>
        </el-menu-item>
        
        <el-menu-item index="/dashboard/i18n-error-codes">
          <el-icon><Globe /></el-icon>
          <span>{{ $t('i18nErrorCodes.title') }}</span>
        </el-menu-item>
        
        <el-menu-item index="/dashboard/logs">
          <el-icon><Upload /></el-icon>
          <span>{{ $t('nav.logs') }}</span>
        </el-menu-item>
        
        <el-menu-item index="/dashboard/account">
          <el-icon><User /></el-icon>
          <span>{{ $t('account.title') }}</span>
        </el-menu-item>
        
        <!-- 只有管理员可以看到历史记录 -->
        <el-menu-item v-if="isAdmin" index="/dashboard/history">
          <el-icon><Clock /></el-icon>
          <span>{{ $t('nav.history') }}</span>
        </el-menu-item>
        
        <!-- 管理员菜单 -->
        <template v-if="isAdmin">
          <el-divider />
          <el-menu-item index="/dashboard/users">
            <el-icon><Avatar /></el-icon>
            <span>{{ $t('users.title') }}</span>
          </el-menu-item>
          
          <el-menu-item index="/dashboard/roles">
            <el-icon><Setting /></el-icon>
            <span>{{ $t('roles.title') }}</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>
    
    <!-- 主内容区域 -->
    <el-container class="main-container">
      <!-- 顶部导航栏 -->
      <el-header class="header">
        <div class="header-left">
          <h3>{{ $t(getPageTitleKey) }}</h3>
        </div>
        
        <div class="header-right">
          <!-- 语言切换（暂时只显示中文） -->
          <el-dropdown @command="changeLanguage" disabled>
            <el-button type="text" disabled>
              <el-icon><Globe /></el-icon>
              中文
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="zh-CN">中文</el-dropdown-item>
                <el-dropdown-item command="en-US" disabled>English (暂不可用)</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <!-- 用户名显示 -->
          <span v-if="currentUser && currentUser.username" class="header-username">{{ currentUser.username }}</span>
          <!-- 用户菜单 -->
          <el-dropdown @command="handleUserCommand">
            <el-button type="text">
              <el-icon><User /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">{{ $t('nav.profile') }}</el-dropdown-item>
                <el-dropdown-item command="logout" divided>{{ $t('nav.logout') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <!-- 内容区域 -->
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Globe, Document, Upload, User, Clock, Avatar, Setting } from '@element-plus/icons-vue'

export default {
  name: 'Dashboard',
  components: { Globe, Document, Upload, User, Clock, Avatar, Setting },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    
    const currentUser = computed(() => store.getters['auth/currentUser'])
    const currentLanguage = computed(() => store.getters['auth/currentLanguage'])
    const isAdmin = computed(() => store.getters['auth/userRole'] === 'admin')
    
    const getPageTitleKey = computed(() => {
      const routeMap = {
        '/dashboard/error-codes': 'errorCodes.title',
        '/dashboard/i18n-error-codes': 'i18nErrorCodes.title',
        '/dashboard/logs': 'logs.title',
        '/dashboard/account': 'account.title',
        '/dashboard/history': 'history.title',
        '/dashboard/users': 'users.title',
        '/dashboard/roles': 'roles.title'
      }
      return routeMap[route.path] || 'nav.dashboard'
    })
    
    const changeLanguage = (language) => {
      store.dispatch('auth/setLanguage', language)
      window.location.reload()
    }
    
    const handleUserCommand = async (command) => {
      if (command === 'logout') {
        try {
          await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          })
          store.dispatch('auth/logout')
          router.push('/login')
        } catch {
          // 用户取消
        }
      } else if (command === 'profile') {
        router.push('/dashboard/account')
      }
    }
    
    return {
      currentUser,
      currentLanguage,
      isAdmin,
      getPageTitleKey,
      changeLanguage,
      handleUserCommand
    }
  }
}
</script>

<style scoped>
.dashboard-container {
  height: 100vh;
  display: flex;
}

.sidebar {
  background-color: #304156;
  color: white;
}

.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #435266;
}

.sidebar-header h2 {
  color: white;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.sidebar-menu {
  border: none;
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.header {
  background: white;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-left h3 {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.header-right .el-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  line-height: 32px;
  padding: 0 12px;
}

.main-content {
  background: #f5f5f5;
  padding: 20px;
  overflow-y: auto;
}

.el-divider {
  margin: 8px 0;
  border-color: #435266;
}

.header-username {
  margin: 0 12px;
  font-weight: 500;
  color: #333;
  font-size: 15px;
  letter-spacing: 1px;
}
</style> 