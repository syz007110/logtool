<template>
  <div class="detail-card" v-if="detail">
    <div class="header">
      <h3>{{ detail.title }}</h3>
      <el-tag :type="statusType(detail.status)">{{ statusText(detail.status) }}</el-tag>
    </div>
    <div class="meta">{{ $t('feedback.submitTime') }}：{{ formatTime(detail.created_at) }}</div>
    <div class="desc" v-text="detail.description"></div>
    <div class="images" v-if="detail.images && detail.images.length">
      <el-image 
        v-for="img in detail.images" 
        :key="img.id" 
        :src="toAbs(img.url)" 
        :preview-src-list="detail.images.map(i=>toAbs(i.url))"
        fit="cover"
      />
    </div>
  </div>
</template>

<script>
import api from '../api'
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export default {
  name: 'FeedbackDetail',
  props: { id: { type: Number, required: true } },
  setup(props) {
    const { t: $t } = useI18n()
    const detail = ref(null)
    const fetchDetail = async () => {
      const { data } = await api.feedback.getDetail(props.id)
      detail.value = data
    }
    const statusText = (s) => ({ open: $t('feedback.statusOpen'), in_progress: $t('feedback.statusInProgress'), resolved: $t('feedback.statusResolved') }[s] || s)
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
.detail-card {
  background: rgb(var(--background));
  padding: 20px;
  border-radius: var(--radius);
}

.header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.header h3 {
  margin: 0;
  color: rgb(var(--text-primary));
  font-weight: 600;
}

.meta {
  color: rgb(var(--text-secondary));
  margin-bottom: 12px;
  font-size: 14px;
}

.desc {
  white-space: pre-wrap;
  margin-bottom: 12px;
  color: rgb(var(--text-primary));
  line-height: 1.6;
}

.images {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.images .el-image {
  width: 160px;
  height: 160px;
  object-fit: cover;
  border-radius: var(--radius);
  border: 1px solid rgb(var(--border));
}
</style>
