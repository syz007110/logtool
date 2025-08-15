<template>
  <div class="card" v-if="detail">
    <div class="header">
      <h3>{{ detail.title }}</h3>
      <el-tag :type="statusType(detail.status)">{{ statusText(detail.status) }}</el-tag>
    </div>
    <div class="meta">提交时间：{{ formatTime(detail.created_at) }}</div>
    <div class="desc" v-text="detail.description"></div>
    <div class="images" v-if="detail.images && detail.images.length">
      <el-image v-for="img in detail.images" :key="img.id" :src="toAbs(img.url)" :preview-src-list="detail.images.map(i=>toAbs(i.url))" />
    </div>
  </div>
</template>

<script>
import api from '../api'
import { ref, onMounted, watch } from 'vue'

export default {
  name: 'FeedbackDetail',
  props: { id: { type: Number, required: true } },
  setup(props) {
    const detail = ref(null)
    const fetchDetail = async () => {
      const { data } = await api.feedback.getDetail(props.id)
      detail.value = data
    }
    const statusText = (s) => ({ open: '待处理', in_progress: '处理中', resolved: '已解决' }[s] || s)
    const statusType = (s) => ({ open: 'danger', in_progress: 'warning', resolved: 'success' }[s] || 'info')
    const formatTime = (t) => new Date(t).toLocaleString()
    const toAbs = (u) => {
      if (!u) return ''
      if (u.startsWith('http')) return u
      const backend = window.location.origin.replace(':8080', ':3000')
      return u.startsWith('/') ? backend + u : backend + '/' + u
    }
    onMounted(fetchDetail)
    watch(() => props.id, fetchDetail)
    return { detail, statusText, statusType, formatTime, toAbs }
  }
}
</script>

<style scoped>
.card { background: #fff; padding: 20px; border-radius: 8px; }
.header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.header h3 { margin: 0; }
.meta { color: #888; margin-bottom: 12px; }
.desc { white-space: pre-wrap; margin-bottom: 12px; }
.images { display: flex; gap: 12px; flex-wrap: wrap; }
.images .el-image { width: 160px; height: 160px; object-fit: cover; }
</style>


