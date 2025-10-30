<template>
  <div class="card">
    <div class="card-title">{{ $t('feedback.submitTitle') }}</div>
    <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
      <el-form-item :label="$t('feedback.title')" prop="title">
        <el-input
          v-model="form.title"
          type="text"
          :placeholder="$t('feedback.titlePlaceholder')"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>
      <el-form-item :label="$t('feedback.description')" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="5"
          :placeholder="$t('feedback.descriptionPlaceholder')"
          maxlength="500"
          show-word-limit
          @input="onDescInput"
        />
      </el-form-item>
      <el-form-item :label="$t('feedback.images')" prop="images">
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
          <div class="tips">{{ $t('feedback.uploadTips') }}</div>
        </div>
      </el-form-item>
      <el-form-item>
        <el-button class="btn-primary" :loading="submitting" @click="submit">{{ $t('shared.save') }}</el-button>
      </el-form-item>
    </el-form>
  </div>
  <div class="card" style="margin-top: 24px;">
    <div class="card-title">{{ $t('feedback.listTitle') }}</div>
    <FeedbackList @view="openDetail" />
  </div>
  <el-dialog v-model="dialogImageVisible">
    <img :src="dialogImageUrl" :alt="$t('feedback.preview')" style="width: 100%" />
  </el-dialog>
  <el-dialog v-model="detailDialogVisible" :title="$t('feedback.detailTitle')" width="60%">
    <FeedbackDetail v-if="selectedId" :id="selectedId" />
  </el-dialog>
 </template>

<script>
import api from '../api'
import { Plus } from '@element-plus/icons-vue'
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import FeedbackList from './FeedbackList.vue'
import FeedbackDetail from './FeedbackDetail.vue'

export default {
  name: 'Feedback',
  components: { Plus, FeedbackList, FeedbackDetail },
  setup() {
    const { t } = useI18n()
    const form = reactive({ title: '', description: '' })
    const rules = {
      title: [
        { required: true, message: t('feedback.rules.titleRequired'), trigger: 'blur' },
        { min: 1, max: 100, message: t('feedback.rules.titleLen'), trigger: 'change' }
      ],
      description: [
        { required: true, message: t('feedback.rules.descRequired'), trigger: 'blur' },
        { min: 1, max: 500, message: t('feedback.rules.descLen'), trigger: 'change' }
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
        ElMessage.error(t('feedback.onlyImagesTip'))
        return false
      }
      const okSize = file.size <= 2 * 1024 * 1024
      if (!okSize) {
        ElMessage.error(t('feedback.imageTooLarge'))
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

    const onExceed = () => ElMessage.error(t('feedback.max3Images'))

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
        ElMessage.success(t('feedback.submitSuccess'))
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


