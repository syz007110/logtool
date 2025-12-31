<template>
  <div class="smart-search-container">
    <!-- 消息列表区域 -->
    <div class="messages-container" ref="messagesContainerRef">
      <!-- 空状态 -->
      <div v-if="messages.length === 0 && !sending" class="empty-state">
        <div class="empty-icon-wrapper">
          <el-icon class="empty-icon"><Search /></el-icon>
        </div>
        <h2 class="empty-title">{{ $t('smartSearch.welcomeTitle') }}</h2>
        <p class="empty-text">{{ $t('smartSearch.welcomeText') }}</p>
      </div>
      
      <!-- 消息列表 -->
      <div v-else class="messages-list">
        <div 
          v-for="(message, index) in messages" 
          :key="index" 
          class="message-item"
          :class="{ 'message-user': message.role === 'user', 'message-assistant': message.role === 'assistant' }"
        >
          <div class="message-content">
            <div class="message-text" v-html="formatMessage(message.content)"></div>
            <div class="message-time">{{ formatTime(message.timestamp) }}</div>
          </div>
        </div>
        
        <!-- 加载中提示 -->
        <div v-if="sending" class="message-item message-assistant">
          <div class="message-content">
            <div class="message-text">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>{{ $t('smartSearch.thinking') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 输入框区域（固定在底部） -->
    <div class="input-container">
      <!-- 已上传的文件列表（如果有） -->
      <div v-if="uploadFileList.length > 0" class="uploaded-files-bar">
        <div class="uploaded-files-list">
          <div 
            v-for="(file, index) in uploadFileList" 
            :key="index" 
            class="uploaded-file-item"
          >
            <el-icon><Document /></el-icon>
            <span class="file-name">{{ file.name }}</span>
            <el-icon class="remove-icon" @click="removeFile(index)"><Close /></el-icon>
          </div>
        </div>
        <div class="upload-options">
          <el-input
            v-model="decryptKey"
            :placeholder="$t('logs.decryptKeyPlaceholder')"
            size="small"
            style="width: 180px; margin-right: 8px;"
            clearable
          >
            <template #prefix>
              <el-icon><Key /></el-icon>
            </template>
          </el-input>
          <el-input
            v-model="deviceId"
            :placeholder="$t('logs.deviceId')"
            size="small"
            style="width: 180px;"
            clearable
          >
            <template #prefix>
              <el-icon><Monitor /></el-icon>
            </template>
          </el-input>
        </div>
      </div>
      
      <!-- 主流AI样式：按钮内嵌在输入框左右 -->
      <div class="composer">
        <!-- 左侧：上传按钮（内嵌） -->
        <el-upload
          ref="uploadRef"
          class="composer-upload"
          :action="uploadUrl"
          :headers="uploadHeaders"
          :before-upload="beforeUpload"
          :on-success="onUploadSuccess"
          :on-error="onUploadError"
          :on-exceed="onExceed"
          :on-change="onFileChange"
          :on-remove="onFileRemove"
          :auto-upload="false"
          :show-file-list="false"
          :multiple="true"
          :limit="50"
          accept=".medbot"
          name="file"
          :disabled="uploading || sending"
        >
          <button
            type="button"
            class="composer-icon-btn"
            :disabled="uploading || sending"
            :title="$t('smartSearch.uploadLogs')"
          >
            <el-icon><Plus /></el-icon>
          </button>
        </el-upload>

        <!-- 中间：文本输入 -->
        <el-input
          v-model="searchQuery"
          ref="inputRef"
          class="composer-input"
          type="textarea"
          :rows="1"
          :placeholder="$t('smartSearch.placeholder')"
          :disabled="sending"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.shift.enter.exact="handleNewLine"
          @input="handleInput"
        />

        <!-- 右侧：发送按钮（内嵌） -->
        <button
          type="button"
          class="composer-send-btn"
          :class="{ disabled: sending || !canSend }"
          :disabled="sending || !canSend"
          @click="handleSend"
          :title="$t('smartSearch.send')"
        >
          <el-icon v-if="!sending"><Top /></el-icon>
          <el-icon v-else class="is-loading"><Loading /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Document, Key, Monitor, Loading, Close, Plus, Top } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import api from '@/api'

export default {
  name: 'SmartSearch',
  components: {
    Search,
    Document,
    Key,
    Monitor,
    Loading,
    Close,
    Plus,
    Top
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const { t } = useI18n()
    
    const searchQuery = ref('')
    const sending = ref(false)
    const messages = ref([])
    const messagesContainerRef = ref(null)
    const inputRef = ref(null)
    
    // 日志上传相关
    const uploading = ref(false)
    const uploadFileList = ref([])
    const decryptKey = ref('')
    const deviceId = ref('')
    const uploadRef = ref(null)
    
    // 上传配置（直接使用相对路径，api 实例已配置 baseURL）
    const uploadUrl = computed(() => '/api/logs/upload')
    
    const uploadHeaders = computed(() => {
      const token = store.getters['auth/token']
      return {
        'Authorization': `Bearer ${token}`,
        'x-device-id': deviceId.value || '0000-00'
      }
    })
    
    const canSend = computed(() => {
      return searchQuery.value.trim().length > 0 || uploadFileList.value.length > 0
    })
    
    // 自动滚动到底部
    const scrollToBottom = () => {
      nextTick(() => {
        if (messagesContainerRef.value) {
          messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
        }
      })
    }
    
    // 监听消息变化，自动滚动
    watch(() => messages.value.length, () => {
      scrollToBottom()
    })
    
    // 处理输入框输入
    const handleInput = () => {
      // 自动调整输入框高度
      nextTick(() => {
        if (inputRef.value && inputRef.value.$el) {
          const textarea = inputRef.value.$el.querySelector('textarea')
          if (textarea) {
            textarea.style.height = 'auto'
            const height = Math.min(textarea.scrollHeight, 400) // 最大高度400px
            textarea.style.height = height + 'px'
          }
        }
      })
    }
    
    // 处理换行（Shift+Enter）
    const handleNewLine = () => {
      // 默认行为，插入换行
    }
    
    // 文件上传相关方法
    const beforeUpload = (file) => {
      if (!file.name.endsWith('.medbot')) {
        ElMessage.error('只能上传 .medbot 文件')
        return false
      }
      
      const maxSize = 200 * 1024 * 1024
      if (file.size > maxSize) {
        ElMessage.error('文件大小不能超过 200MB')
        return false
      }
      
      const totalSize = uploadFileList.value.reduce((sum, f) => sum + (f.size || 0), 0) + file.size
      if (totalSize > maxSize) {
        ElMessage.error('所有文件总大小不能超过 200MB')
        return false
      }
      
      if (uploadFileList.value.length >= 50) {
        ElMessage.error('最多只能上传 50 个文件')
        return false
      }
      
      return true
    }
    
    const onFileChange = (file, fileList) => {
      if (beforeUpload(file.raw)) {
        const fileObj = {
          name: file.name,
          size: file.size,
          sizeText: formatFileSize(file.size),
          raw: file.raw
        }
        uploadFileList.value.push(fileObj)
      }
    }
    
    const onFileRemove = (file, fileList) => {
      const index = uploadFileList.value.findIndex(f => f.name === file.name)
      if (index > -1) {
        uploadFileList.value.splice(index, 1)
      }
    }
    
    const removeFile = (index) => {
      uploadFileList.value.splice(index, 1)
    }
    
    const onExceed = () => {
      ElMessage.warning('最多只能上传 50 个文件')
    }
    
    const onUploadSuccess = (response, file) => {
      // 上传成功会在发送时处理
    }
    
    const onUploadError = (error, file) => {
      ElMessage.error('日志上传失败：' + (error.message || '未知错误'))
    }
    
    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
    }
    
    // 发送消息
    const handleSend = async () => {
      if (!canSend.value) {
        return
      }
      
      const query = searchQuery.value.trim()
      const hasFiles = uploadFileList.value.length > 0
      
      // 如果只有文件没有文本，也需要能够发送
      if (!query && !hasFiles) {
        return
      }
      
      // 添加用户消息
      if (query) {
        messages.value.push({
          role: 'user',
          content: query,
          timestamp: new Date()
        })
      }
      
      // 如果有文件，添加文件信息到消息
      if (hasFiles) {
        const fileNames = uploadFileList.value.map(f => f.name).join(', ')
        messages.value.push({
          role: 'user',
          content: `📎 已上传 ${uploadFileList.value.length} 个日志文件：${fileNames}`,
          timestamp: new Date(),
          isFileInfo: true
        })
      }
      
      // 清空输入框
      searchQuery.value = ''
      handleInput() // 重置输入框高度
      
      // 滚动到底部
      scrollToBottom()
      
      // 如果启用了日志上传且有文件，先上传日志
      if (hasFiles) {
        await uploadLogs()
      }
      
      // 执行智能搜索
      sending.value = true
      try {
        // TODO: 调用智能搜索API
        // 这里暂时模拟一个响应
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        const response = query || '已分析上传的日志文件'
        messages.value.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        })
        
        scrollToBottom()
      } catch (error) {
        ElMessage.error('搜索失败：' + (error.message || '未知错误'))
        messages.value.push({
          role: 'assistant',
          content: '抱歉，搜索过程中出现错误，请稍后重试。',
          timestamp: new Date(),
          isError: true
        })
      } finally {
        sending.value = false
        scrollToBottom()
      }
    }
    
    // 上传日志
    const uploadLogs = async () => {
      if (uploadFileList.value.length === 0) {
        return
      }
      
      uploading.value = true
      try {
        const formData = new FormData()
        uploadFileList.value.forEach(file => {
          formData.append('file', file.raw)
        })
        
        if (decryptKey.value) {
          formData.append('decrypt_key', decryptKey.value)
        }
        
        const response = await api.post('/logs/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'x-device-id': deviceId.value || '0000-00'
          }
        })
        
        // 上传成功后清空文件列表
        uploadFileList.value = []
        decryptKey.value = ''
        deviceId.value = ''
      } catch (error) {
        ElMessage.error('日志上传失败：' + (error.response?.data?.message || error.message || '未知错误'))
        throw error
      } finally {
        uploading.value = false
      }
    }
    
    const formatTime = (date) => {
      if (!date) return ''
      const d = new Date(date)
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    
    const formatMessage = (content) => {
      // 简单的格式化，将换行转换为<br>
      return content.replace(/\n/g, '<br>')
    }
    
    onMounted(() => {
      scrollToBottom()
    })
    
    return {
      searchQuery,
      sending,
      messages,
      messagesContainerRef,
      inputRef,
      uploading,
      uploadFileList,
      decryptKey,
      deviceId,
      uploadRef,
      uploadUrl,
      uploadHeaders,
      canSend,
      beforeUpload,
      onFileChange,
      onFileRemove,
      removeFile,
      onExceed,
      onUploadSuccess,
      onUploadError,
      handleInput,
      handleNewLine,
      handleSend,
      formatTime,
      formatMessage
    }
  }
}
</script>

<style scoped>
.smart-search-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f7f7f8;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
}

.empty-icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}

.empty-icon {
  font-size: 32px;
  color: #9ca3af;
}

.empty-title {
  font-size: 24px;
  font-weight: 600;
  color: #374151;
  margin: 0 0 8px 0;
}

.empty-text {
  font-size: 16px;
  color: #6b7280;
  margin: 0;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
}

.message-item {
  display: flex;
  width: 100%;
}

.message-user {
  justify-content: flex-end;
}

.message-assistant {
  justify-content: flex-start;
}

.message-content {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 12px;
  word-wrap: break-word;
}

.message-user .message-content {
  background: #409eff;
  color: white;
  border-bottom-right-radius: 4px;
}

.message-assistant .message-content {
  background: white;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-bottom-left-radius: 4px;
}

.message-text {
  line-height: 1.6;
  font-size: 15px;
  margin-bottom: 4px;
}

.message-time {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 4px;
}

.message-user .message-time {
  text-align: right;
}

/* 输入框容器（固定在底部） */
.input-container {
  position: sticky;
  bottom: 0;
  padding: 14px 12px 18px;
  background: linear-gradient(180deg, rgba(247, 247, 248, 0) 0%, #f7f7f8 35%, #f7f7f8 100%);
}

.uploaded-files-bar {
  max-width: 800px;
  margin: 0 auto 10px auto;
  padding: 10px 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  backdrop-filter: blur(8px);
}

.uploaded-files-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.uploaded-file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
}

.uploaded-file-item .file-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-icon {
  cursor: pointer;
  color: #9ca3af;
  font-size: 14px;
}

.remove-icon:hover {
  color: #ef4444;
}

.upload-options {
  display: flex;
  gap: 8px;
}

/* 主流AI输入框：一个整体容器，内部放上传/发送按钮 */
.composer {
  position: relative;
  max-width: 1200px;
  margin: 0 auto;
  border-radius: 28px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.composer:focus-within {
  border-color: #c7d2fe;
  box-shadow: 0 10px 28px rgba(0,0,0,0.08);
}

.composer-upload {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 2;
}

.composer-icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e5e7eb;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.composer-icon-btn:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #d1d5db;
}

.composer-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-send-btn {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 2;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: none;
  background: #111827;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.12s ease, background 0.12s ease;
}

.composer-send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  opacity: 0.92;
}

.composer-send-btn:disabled,
.composer-send-btn.disabled {
  background: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
  transform: none;
  opacity: 1;
}

.composer-input {
  width: 100%;
}

.composer-input :deep(.el-textarea__inner) {
  min-height: 480px;
  max-height: 400px;
  padding: 24px 72px 24px 72px; /* 给左右按钮留空间 */
  border-radius: 28px;
  border: none;
  font-size: 18px;
  line-height: 1.7;
  resize: none;
  background: transparent;
  transition: background-color 0.2s;
  color: #374151;
}

.composer-input :deep(.el-textarea__inner)::placeholder {
  color: #9ca3af;
  font-size: 18px;
  line-height: 1.7;
  opacity: 0.6;
}

.composer-input :deep(.el-textarea__inner):focus {
  outline: none;
}

.composer-input :deep(.el-textarea__inner):disabled {
  background-color: #f9fafb;
  cursor: not-allowed;
}

/* 滚动条样式 */
.messages-container::-webkit-scrollbar {
  width: 8px;
}

.messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>

