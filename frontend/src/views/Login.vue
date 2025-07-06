<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h1>{{ $t('login.title') }}</h1>
        <div class="language-switch">
          <el-button 
            :type="currentLanguage === 'zh-CN' ? 'primary' : 'default'"
            size="small"
            @click="changeLanguage('zh-CN')"
          >
            中文
          </el-button>
          <el-button 
            :type="currentLanguage === 'en-US' ? 'primary' : 'default'"
            size="small"
            @click="changeLanguage('en-US')"
          >
            English
          </el-button>
        </div>
      </div>
      
      <el-form 
        ref="loginForm" 
        :model="formData" 
        :rules="rules" 
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="formData.username"
            :placeholder="$t('login.username')"
            prefix-icon="User"
            size="large"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="formData.password"
            type="password"
            :placeholder="$t('login.password')"
            prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        
        <el-form-item>
          <el-button 
            type="primary" 
            size="large" 
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            {{ $t('login.login') }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="login-footer">
        <router-link to="/register" class="register-link">
          {{ $t('login.register') }}
        </router-link>
        <router-link to="/forgot-password" class="forgot-link">
          {{ $t('login.forgotPassword') }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

export default {
  name: 'Login',
  setup() {
    const store = useStore()
    const router = useRouter()
    const loginForm = ref(null)
    
    const formData = reactive({
      username: '',
      password: ''
    })
    
    const loading = ref(false)
    
    const currentLanguage = computed(() => store.getters['auth/currentLanguage'])
    
    const rules = {
      username: [
        { required: true, message: '请输入用户名', trigger: 'blur' }
      ],
      password: [
        { required: true, message: '请输入密码', trigger: 'blur' }
      ]
    }
    
    const handleLogin = async () => {
      try {
        await loginForm.value.validate()
        loading.value = true
        
        await store.dispatch('auth/login', formData)
        ElMessage.success('登录成功')
        router.push('/dashboard')
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '登录失败')
      } finally {
        loading.value = false
      }
    }
    
    const changeLanguage = (language) => {
      store.dispatch('auth/setLanguage', language)
    }
    
    return {
      loginForm,
      formData,
      loading,
      rules,
      currentLanguage,
      handleLogin,
      changeLanguage
    }
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-box {
  background: white;
  border-radius: 10px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  padding: 40px;
  width: 400px;
  max-width: 90vw;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h1 {
  color: #333;
  margin-bottom: 20px;
  font-size: 24px;
  font-weight: 600;
}

.language-switch {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.login-form {
  margin-bottom: 20px;
}

.login-button {
  width: 100%;
  height: 45px;
  font-size: 16px;
}

.login-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
}

.register-link,
.forgot-link {
  color: #409eff;
  text-decoration: none;
  font-size: 14px;
}

.register-link:hover,
.forgot-link:hover {
  color: #66b1ff;
}
</style> 