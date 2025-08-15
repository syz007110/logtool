<template>
  <div class="data-replay">
    <el-card class="upload-card">
      <div class="upload-row">
        <el-upload
          action=""
          :http-request="handleUploadRequest"
          :show-file-list="false"
          accept=".bin"
        >
          <el-button type="primary">上传二进制文件(.bin)</el-button>
        </el-upload>
        <el-button :disabled="!fileId" @click="downloadCsv" plain>下载CSV</el-button>
      </div>
      <div v-if="fileName" class="file-meta">
        <span>文件: {{ fileName }}</span>
        <span>大小: {{ prettySize(fileSize) }}</span>
        <span>总条数: {{ totalEntries }}</span>
      </div>
    </el-card>

    
  </div>
  
</template>

<script>
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

export default {
  name: 'DataReplay',
  setup() {
    const fileId = ref('')
    const fileName = ref('')
    const fileSize = ref(0)
    const totalEntries = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(500)
    const rows = ref([])
    const columns = ref([])

    // charts removed for now

    const prettySize = (size) => {
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
      if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
      return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
    }

    const handleUploadRequest = async ({ file, onSuccess, onError }) => {
      try {
        const form = new FormData()
        form.append('file', file)
        const { data } = await api.motionData.upload(form)
        fileId.value = data.id
        fileName.value = data.filename
        fileSize.value = data.size
        currentPage.value = 1
        await fetchPreview(1)
        if (onSuccess) onSuccess(data)
      } catch (err) {
        ElMessage.error('上传失败')
        if (onError) onError(err)
      }
    }

    const fetchConfig = async () => {
      const { data } = await api.motionData.getConfig()
      columns.value = data.columns
    }

    const columnsToShow = ref([])
    watch(columns, () => {
      const wanted = [
        'ulint_data',
        ...Array.from({ length: 7 }, (_, i) => `real_data_${i}`),
        ...Array.from({ length: 7 }, (_, i) => `real_data_${i + 7}`),
        ...Array.from({ length: 7 }, (_, i) => `real_data_${i + 42}`),
        ...Array.from({ length: 7 }, (_, i) => `real_data_${i + 49}`),
        'real_data_18','real_data_19','real_data_20',
        'real_data_25','real_data_26','real_data_27',
      ]
      columnsToShow.value = columns.value.filter(c => wanted.includes(c.index))
    })

    const fetchPreview = async (page = currentPage.value) => {
      if (!fileId.value) return
      const offset = (page - 1) * pageSize.value
      const { data } = await api.motionData.preview(fileId.value, { offset, limit: pageSize.value })
      rows.value = data.rows
      totalEntries.value = data.totalEntries
    }

    const downloadCsv = async () => {
      if (!fileId.value) return
      try {
        const { data } = await api.motionData.downloadCsv(fileId.value)
        const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = (fileName.value?.replace(/\.bin$/i, '') || 'motion') + '.csv'
        a.click()
        URL.revokeObjectURL(url)
      } catch (e) {
        ElMessage.error('下载失败')
      }
    }

    onMounted(async () => {
      await fetchConfig()
    })

    return {
      fileId, fileName, fileSize, totalEntries, currentPage, pageSize, rows, columnsToShow,
      handleUploadRequest, fetchPreview, downloadCsv, prettySize
    }
  }
}
</script>

<style scoped>
.data-replay { display: flex; flex-direction: column; gap: 16px; }
.upload-card .upload-row { display: flex; gap: 12px; align-items: center; }
.file-meta { margin-top: 8px; display: flex; gap: 16px; color: #666; }
</style>
 
