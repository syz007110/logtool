<template>
  <div class="card">
    <div class="card-title">缺陷提交</div>
    <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
      <el-form-item label="标题" prop="title">
        <el-input
          v-model="form.title"
          type="text"
          placeholder="请填写问题标题（100字以内）"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>
      <el-form-item label="描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="5"
          placeholder="请描述遇到的问题（500字以内）"
          maxlength="500"
          show-word-limit
          @input="onDescInput"
        />
      </el-form-item>
      <el-form-item label="图片" prop="images">
        <div class="uploader">
          <el-upload
            :class="['upload', { 'no-trigger': fileList.length >= 3 }]"
            action="#"
            :auto-upload="false"
            :limit="3"
            :on-exceed="onExceed"
            :before-upload="beforeUpload"
            :http-request="noop"
            list-type="picture-card"
            :file-list="fileList"
            :on-remove="handleRemove"
            :on-change="handleChange"
          >
            <el-icon v-if="fileList.length < 3"><Plus /></el-icon>
          </el-upload>
          <div class="tips">支持 JPG/PNG/WebP，单张≤2MB，最多3张</div>
        </div>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="submitting" @click="submit">提交</el-button>
      </el-form-item>
    </el-form>
  </div>
  <div class="card" style="margin-top: 24px;">
    <div class="card-title">反馈列表</div>
    <FeedbackList @view="openDetail" />
  </div>
  <el-dialog v-model="dialogImageVisible">
    <img :src="dialogImageUrl" alt="预览" style="width: 100%" />
  </el-dialog>
  <el-dialog v-model="detailDialogVisible" title="反馈详情" width="60%">
    <FeedbackDetail v-if="selectedId" :id="selectedId" />
  </el-dialog>
 </template>

<script>
import api from '../api'
import { Plus } from '@element-plus/icons-vue'
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import FeedbackList from './FeedbackList.vue'
import FeedbackDetail from './FeedbackDetail.vue'

export default {
  name: 'Feedback',
  components: { Plus, FeedbackList, FeedbackDetail },
  setup() {
    const form = reactive({ title: '', description: '' })
    const rules = {
      title: [
        { required: true, message: '请填写标题', trigger: 'blur' },
        { min: 1, max: 100, message: '标题需在100字以内', trigger: 'change' }
      ],
      description: [
        { required: true, message: '请填写描述', trigger: 'blur' },
        { min: 1, max: 500, message: '描述需在500字以内', trigger: 'change' }
      ]
    }
    const formRef = ref(null)
    const fileList = ref([])
    const submitting = ref(false)
    const dialogImageVisible = ref(false)
    const dialogImageUrl = ref('')
    const detailDialogVisible = ref(false)
    const selectedId = ref(null)

    const onDescInput = (val) => {
      if (val && val.length > 500) form.description = val.slice(0, 500)
    }

    const beforeUpload = (file) => {
      const okType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      if (!okType) {
        ElMessage.error('仅支持 JPG/PNG/WebP 图片')
        return false
      }
      const okSize = file.size <= 2 * 1024 * 1024
      if (!okSize) {
        ElMessage.error('图片大小不能超过 2MB')
        return false
      }
      return true
    }

    const handleChange = (file, files) => {
      fileList.value = files.slice(0, 3)
    }

    const handleRemove = (file, files) => {
      fileList.value = files
    }

    const noop = () => {}

    const onExceed = () => ElMessage.error('最多上传3张图片')

    const submit = async () => {
      if (submitting.value) return
      await formRef.value.validate()
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('description', form.description.trim())
      fileList.value.forEach(f => fd.append('images', f.raw))
      submitting.value = true
      try {
        await api.feedback.create(fd)
        ElMessage.success('提交成功，感谢反馈！')
        form.title = ''
        form.description = ''
        fileList.value = []
      } catch (e) {
        // 错误统一由拦截器处理
      } finally {
        submitting.value = false
      }
    }

    const openDetail = (id) => { selectedId.value = id; detailDialogVisible.value = true }

    return { form, rules, formRef, fileList, submitting, submit, beforeUpload, handleRemove, handleChange, onDescInput, dialogImageVisible, dialogImageUrl, noop, onExceed, detailDialogVisible, selectedId, openDetail }
  }
}
</script>

<style scoped>
.card { background: #fff; padding: 20px; border-radius: 8px; }
.card-title { font-weight: 600; margin-bottom: 12px; }
.uploader { display: flex; flex-direction: column; gap: 8px; }
.tips { color: #888; font-size: 12px; }
.no-trigger :deep(.el-upload--picture-card) { display: none; }
</style>


