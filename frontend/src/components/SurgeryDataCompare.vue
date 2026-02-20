<template>
  <el-dialog
    v-model="visible"
    :title="$t('surgeryCompare.title')"
    width="880px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="compare-wrap">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="$t('surgeryCompare.differencesCount', { id: surgeryId || '-', count: differenceCount })"
      />

      <div class="top-actions">
        <el-button
          v-if="!fullDataIncluded"
          size="small"
          :loading="loadingFullData"
          @click="emit('load-full-data')"
        >
          {{ $t('surgeryCompare.loadFullData') }}
        </el-button>
        <template v-if="diffLineElements.length > 0">
          <el-button
            size="small"
            :disabled="currentDiffIndex <= 0"
            @click="goToPrevDiff"
          >
            {{ $t('surgeryCompare.prevDiff') }}
          </el-button>
          <el-button
            size="small"
            :disabled="currentDiffIndex >= diffLineElements.length - 1"
            @click="goToNextDiff"
          >
            {{ $t('surgeryCompare.nextDiff') }}
          </el-button>
          <span class="diff-nav-hint">{{ currentDiffIndex + 1 }} / {{ diffLineElements.length }}</span>
        </template>
      </div>

      <div class="diff-block">
        <div class="diff-label">{{ $t('surgeryCompare.diffContent') }}</div>
        <div class="diff-vue-diff-wrapper" ref="diffWrapperRef">
          <Diff
            ref="diffRef"
            :prev="prevText"
            :current="currentText"
            mode="unified"
            theme="light"
            language="json"
            :folding="true"
            :virtual-scroll="false"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ $t('surgeryCompare.cancel') }}</el-button>
      <el-button
        v-if="allowKeepExisting && hasPendingExportId"
        :loading="submittingKeep"
        @click="handleKeepExisting"
      >
        {{ $t('surgeryCompare.keepExisting') }}
      </el-button>
      <el-button type="primary" :loading="submittingOverride" @click="handleOverride">
        {{ $t('surgeryCompare.confirmOverride') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  surgeryId: { type: String, default: '' },
  existingData: { type: Object, default: () => ({}) },
  newData: { type: Object, default: () => ({}) },
  differences: { type: Array, default: () => [] },
  textDiff: { type: String, default: '' },
  surgeryData: { type: Object, default: () => ({}) },
  allowKeepExisting: { type: Boolean, default: false },
  pendingExportId: { type: [Number, String, null], default: null },
  fullDataIncluded: { type: Boolean, default: false },
  loadingFullData: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'confirmed', 'load-full-data'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const hasPendingExportId = computed(() => {
  const n = Number(props.pendingExportId)
  return Number.isFinite(n) && n > 0
})

const differenceCount = computed(() => Array.isArray(props.differences) ? props.differences.length : 0)

const submittingOverride = ref(false)
const submittingKeep = ref(false)
const diffRef = ref(null)
const diffWrapperRef = ref(null)
const diffLineElements = ref([])
const currentDiffIndex = ref(0)

const formatValue = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch (_) {
      return String(value)
    }
  }
  return String(value)
}

const prevText = computed(() => formatValue(props.existingData))
const currentText = computed(() => formatValue(props.newData))

function collectDiffLineElements() {
  diffLineElements.value = []
  currentDiffIndex.value = 0
  nextTick(() => {
    setTimeout(() => {
      const root = diffRef.value?.$el || diffWrapperRef.value
      if (!root) return
    const sel = [
      '[class*="insert"]',
      '[class*="delete"]',
      '[class*="Insert"]',
      '[class*="Delete"]',
      '[class*="line-add"]',
      '[class*="line-remove"]',
      '[class*="add"]',
      '[class*="remove"]'
    ]
    const set = new Set()
    sel.forEach((s) => {
      try {
        root.querySelectorAll(s).forEach((el) => {
          if (el && !set.has(el)) {
            set.add(el)
          }
        })
      } catch (_) {}
    })
    const arr = Array.from(set)
    arr.sort((a, b) => {
      const pos = a.compareDocumentPosition(b)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })
    diffLineElements.value = arr
    }, 150)
  })
}

watch([visible, prevText, currentText], () => {
  if (visible.value && prevText.value && currentText.value) {
    collectDiffLineElements()
  }
})

function goToPrevDiff() {
  if (currentDiffIndex.value <= 0) return
  currentDiffIndex.value--
  scrollToCurrentDiff()
}

function goToNextDiff() {
  if (currentDiffIndex.value >= diffLineElements.value.length - 1) return
  currentDiffIndex.value++
  scrollToCurrentDiff()
}

function scrollToCurrentDiff() {
  const el = diffLineElements.value[currentDiffIndex.value]
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    el.classList.add('diff-line-highlight')
    setTimeout(() => el.classList.remove('diff-line-highlight'), 1500)
  }
}

const closeAndNotify = () => {
  emit('confirmed')
  visible.value = false
}

const handleOverride = async () => {
  try {
    await ElMessageBox.confirm(
      t('surgeryCompare.confirmOverrideMessage'),
      t('surgeryCompare.confirmOverrideTitle'),
      {
        type: 'warning',
        confirmButtonText: t('surgeryCompare.confirmOverride'),
        cancelButtonText: t('surgeryCompare.cancel')
      }
    )
    submittingOverride.value = true

    if (hasPendingExportId.value) {
      await api.surgeryStatistics.resolvePendingExport(Number(props.pendingExportId), 'override')
    } else {
      await api.surgeryStatistics.confirmOverrideSurgeryData(props.surgeryData, true)
    }

    ElMessage.success(t('surgeryCompare.overrideSuccess'))
    closeAndNotify()
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error?.response?.data?.message || error?.message || t('surgeryCompare.overrideFailed'))
  } finally {
    submittingOverride.value = false
  }
}

const handleKeepExisting = async () => {
  if (!hasPendingExportId.value) return
  try {
    await ElMessageBox.confirm(
      t('surgeryCompare.confirmKeepMessage'),
      t('surgeryCompare.confirmKeepTitle'),
      {
        type: 'warning',
        confirmButtonText: t('surgeryCompare.keepExisting'),
        cancelButtonText: t('surgeryCompare.cancel')
      }
    )
    submittingKeep.value = true
    await api.surgeryStatistics.resolvePendingExport(Number(props.pendingExportId), 'keep_existing')
    ElMessage.success(t('surgeryCompare.keepSuccess'))
    closeAndNotify()
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error(error?.response?.data?.message || error?.message || t('surgeryCompare.operationFailed'))
  } finally {
    submittingKeep.value = false
  }
}
</script>

<style scoped>
.compare-wrap {
  max-height: 70vh;
  overflow: auto;
}

.top-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin: 10px 0 12px;
  flex-wrap: wrap;
}

.diff-nav-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 4px;
}

.diff-block {
  margin-top: 8px;
}

.diff-label {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.diff-vue-diff-wrapper {
  max-height: 400px;
  overflow: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.diff-vue-diff-wrapper :deep(.diff-line-highlight) {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -1px;
  animation: diff-highlight 1.5s ease-out;
}

@keyframes diff-highlight {
  0% { opacity: 1; }
  100% { opacity: 1; }
}
</style>
