<template>
  <div class="forgot-password-container">
    <div class="forgot-password-box">
      <div class="forgot-password-header">
        <h1>忘记密码</h1>
        <p>请输入您的邮箱地址，我们将发送重置密码的链接</p>
      </div>
      
      <el-form 
        ref="forgotPasswordForm" 
        :model="formData" 
        :rules="rules" 
        class="forgot-password-form"
      >
        <el-form-item prop="email">
          <el-input
            v-model="formData.email"
            placeholder="邮箱地址"
            prefix-icon="Message"
            size="large"
          />
        </el-form-item>
        
        <el-form-item>
          <el-button 
            type="primary" 
            size="large" 
            class="submit-button"
            :loading="loading"
            @click="handleSubmit"
          >
            发送重置邮件
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="forgot-password-footer">
        <router-link to="/login" class="back-to-login">
          返回登录
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive } from 'vue'
import { useStore } from 'vuex'
import { ElMessage } from 'element-plus'

export default {
  name: 'ForgotPassword',
  setup() {
    const store = useStore()
    const forgotPasswordForm = ref(null)
    
    const formData = reactive({
      email: ''
    })
    
    const loading = ref(false)
    
    const rules = {
      email: [
        { required: true, message: '请输入邮箱地址', trigger: 'blur' },
        { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
      ]
    }
    
    const handleSubmit = async () => {
      try {
        await forgotPasswordForm.value.validate()
        loading.value = true
        
        await store.dispatch('auth/forgotPassword', formData.email)
        ElMessage.success('重置邮件已发送，请检查您的邮箱')
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '发送失败')
      } finally {
        loading.value = false
      }
    }
    
    return {
      forgotPasswordForm,
      formData,
      loading,
      rules,
      handleSubmit
    }
  }
}
</script>

<style scoped>
.forgot-password-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.forgot-password-box {
  background: white;
  border-radius: 10px;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  padding: 40px;
  width: 400px;
  max-width: 90vw;
}

.forgot-password-header {
  text-align: center;
  margin-bottom: 30px;
}

.forgot-password-header h1 {
  color: #333;
  margin-bottom: 10px;
  font-size: 24px;
  font-weight: 600;
}

.forgot-password-header p {
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}

.forgot-password-form {
  margin-bottom: 20px;
}

.submit-button {
  width: 100%;
  height: 45px;
  font-size: 16px;
}

.forgot-password-footer {
  text-align: center;
  margin-top: 20px;
}

.back-to-login {
  color: #409eff;
  text-decoration: none;
  font-size: 14px;
}

.back-to-login:hover {
  color: #66b1ff;
}
</style> 