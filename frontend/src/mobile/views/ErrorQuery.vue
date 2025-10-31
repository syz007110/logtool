<template>
  <div class="page">
    <van-nav-bar :title="$t('mobile.titles.errorQuery')" fixed safe-area-inset-top />
    <div class="content">
      <van-cell-group inset>
        <van-field v-model="code" :label="$t('errorCodes.code')" :placeholder="$t('errorCodes.fullCodePlaceholder') || $t('errorCodes.searchPlaceholder')" clearable @keyup.enter="onSearch" />
        <van-field v-if="needSubsystemSelect" v-model="subsystem" :label="$t('errorCodes.subsystem')" :placeholder="$t('errorCodes.selectSubsystem')" clearable />
        <div style="margin:10px 0;"><van-button size="small" block type="primary" :loading="loading" @click="onSearch">{{ $t('shared.search') }}</van-button></div>
      </van-cell-group>
      <div v-if="errorText" class="error">{{ errorText }}</div>
      <van-skeleton v-else-if="loading" title :row="3" />
      <van-empty v-else-if="!result" :description="$t('shared.noData')" />
      <van-card v-else :title="resultTitle" style="margin-top:6px">
        <div class="section">
          <div class="label">{{ $t('errorCodes.queryResult.explanation') }}</div>
          <div class="text">{{ explanationText }}</div>
        </div>
        <div class="section">
          <div class="label">{{ $t('errorCodes.queryResult.paramMeanings') }}</div>
          <div class="kv"><span>{{ $t('errorCodes.formLabels.param1') }}：</span><span>{{ record.param1 ?? '-' }}</span></div>
          <div class="kv"><span>{{ $t('errorCodes.formLabels.param2') }}：</span><span>{{ record.param2 ?? '-' }}</span></div>
          <div class="kv"><span>{{ $t('errorCodes.formLabels.param3') }}：</span><span>{{ record.param3 ?? '-' }}</span></div>
          <div class="kv"><span>{{ $t('errorCodes.formLabels.param4') }}：</span><span>{{ record.param4 ?? '-' }}</span></div>
        </div>
        <div class="section">
          <div class="label">{{ $t('errorCodes.queryResult.moreInfo') }}</div>
          <div class="kv"><span>{{ $t('errorCodes.queryResult.detail') }}：</span><span>{{ record.detail || '-' }}</span></div>
          <div class="kv"><span>{{ $t('errorCodes.queryResult.method') }}：</span><span>{{ record.method || '-' }}</span></div>
          <div class="kv"><span>{{ $t('errorCodes.queryResult.techSolution') }}：</span><span>{{ record.tech_solution || '-' }}</span></div>
          <div class="kv"><span>{{ $t('errorCodes.queryResult.category') }}：</span><span>{{ record.category || '-' }}</span></div>
        </div>
        <div class="section">
          <div class="label">{{ $t('errorCodes.title') }}</div>
          <div class="kv"><span>{{ $t('errorCodes.description') }}：</span><span>{{ record.description || '-' }}</span></div>
          <div class="kv"><span>{{ $t('i18nErrorCodes.userHint') }}：</span><span>{{ record.user_hint || '-' }}</span></div>
          <div class="kv"><span>{{ $t('errorCodes.formLabels.operationZh') }}：</span><span>{{ record.operation || '-' }}</span></div>
          <div class="kv"><span>{{ $t('errorCodes.solution') }}：</span><span>{{ record.solution || '-' }}</span></div>
        </div>
      </van-card>
    </div>
  </div>
  </template>

<script>
import { computed, ref } from 'vue'
import { Empty as VanEmpty, NavBar as VanNavBar, Card as VanCard, Skeleton as VanSkeleton, Field as VanField, CellGroup as VanCellGroup, Button as VanButton } from 'vant'
import api from '@/api'

export default {
  name: 'MErrorQuery',
  components: {
    'van-empty': VanEmpty,
    'van-nav-bar': VanNavBar,
    'van-card': VanCard,
    'van-skeleton': VanSkeleton,
    'van-field': VanField,
    'van-cell-group': VanCellGroup,
    'van-button': VanButton
  },
  setup() {
    const code = ref('')
    const result = ref(null)
    const preview = ref(null)
    const errorText = ref('')
    const loading = ref(false)
    const resultTitle = computed(() => {
      const rawCode = (result.value?.code || code.value || '-').toUpperCase()
      const displayCode = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(rawCode)
        ? (rawCode.startsWith('0X') ? rawCode : `0X${rawCode}`)
        : rawCode
      const subFromResult = (result.value?.subsystem || '').toString().toUpperCase()
      const subFromInput = '' + (subsystem?.value || '')
      const displaySub = (subFromResult || subFromInput || '').toString().toUpperCase()
      return displaySub ? `${displayCode} (${displaySub})` : displayCode
    })
    const record = computed(() => result.value?.errorCode || result.value || {})
    const explanationText = computed(() => {
      const prefix = preview.value?.prefix || ''
      const main = [record.value?.user_hint, record.value?.operation].filter(Boolean).join(' ')
      const text = main || record.value?.explanation || '-'
      return prefix ? `${prefix} ${text}` : text
    })
    const subsystem = ref('')
    const needSubsystemSelect = computed(() => {
      const full = (code.value || '').trim().toUpperCase()
      if (!full) return false
      const isShort = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(full)
      return isShort
    })
    const onSearch = async () => {
      const c = (code.value || '').trim().toUpperCase()
      if (!c) { errorText.value = ''; result.value = null; return }
      const isFull = /^[1-9A][0-9A-F]{5}[A-E]$/.test(c)
      const isShort = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(c)
      if (isShort) {
        const sSel = (subsystem.value || '').trim().toUpperCase()
        if (!sSel) { errorText.value = String($t('errorCodes.selectSubsystem')); return }
      } else {
        const startsWithSubsystem = /^[1-9A]/.test(c)
        if (startsWithSubsystem && !isFull) { errorText.value = String($t('errorCodes.validation.lengthNotEnough')); return }
        if (!isFull) { errorText.value = String($t('errorCodes.validation.codeFormat')); return }
      }
      loading.value = true
      errorText.value = ''
      result.value = null
      preview.value = null
      try {
        try { preview.value = (await api.explanations.preview({ code: c }))?.data || null } catch (_) {}
        let resp = null
        try {
          resp = await api.errorCodes.getByCodeAndSubsystem(c, isShort ? (subsystem.value || '').toUpperCase() : undefined)
        } catch (_) {}
        if (resp?.data) {
          result.value = resp.data
        } else {
          const SUBS = ['1','2','3','4','5','6','7','8','9','A']
          if (!isShort && SUBS.includes(c[0])) {
            try { const r1 = await api.errorCodes.getByCodeAndSubsystem(c, c[0]); if (r1?.data) result.value = r1.data } catch (_) {}
          }
          if (!result.value && isShort) {
            const sSel = (subsystem.value || '').toUpperCase()
            if (sSel) {
              try { const r2 = await api.errorCodes.getByCodeAndSubsystem(c, sSel); if (r2?.data) result.value = r2.data } catch (_) {}
            }
            if (!result.value) {
              for (const sub of SUBS) {
                try { const r = await api.errorCodes.getByCodeAndSubsystem(c, sub); if (r?.data) { result.value = r.data; break } } catch (_) {}
              }
            }
          }
          if (!result.value) errorText.value = ''
        }
      } catch (e) {
        errorText.value = e?.response?.data?.message || '查询失败'
      } finally {
        loading.value = false
      }
    }
    return { code, subsystem, needSubsystemSelect, result, onSearch, errorText, loading, resultTitle, record, explanationText }
  }
}
</script>

<style scoped>
.page { padding-top: 46px; }
.content { padding: 12px; }
.error { color: #e44; font-size: 14px; margin: 8px 0; }
.section { margin-top: 10px; }
.label { font-weight: 600; margin: 6px 0; }
.kv { display: flex; gap: 6px; margin: 4px 0; color: #555; align-items: flex-start; }
.kv span:last-child { white-space: pre-wrap; word-break: break-word; flex: 1; }
.text { white-space: pre-wrap; word-break: break-word; }
</style>


