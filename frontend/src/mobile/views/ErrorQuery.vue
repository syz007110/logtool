<template>
  <div class="page">
    <van-nav-bar :title="$t('mobile.titles.errorQuery')" fixed safe-area-inset-top />
    <div class="content">
      <van-search v-model="keyword" :placeholder="$t('errorCodes.searchPlaceholder')" show-action @search="onSearch" />
      <div v-if="errorText" class="error">{{ errorText }}</div>
      <van-skeleton v-else-if="loading" title :row="3" />
      <van-empty v-else-if="!result" :description="$t('shared.noData')" />
      <van-card v-else :title="resultTitle" style="margin-top:6px">
        <div v-if="result.description"><strong>{{ $t('errorCodes.description') }}：</strong>{{ result.description }}</div>
        <div v-if="result.category"><strong>{{ $t('errorCodes.category') }}：</strong>{{ result.category }}</div>
        <div v-if="result.solution"><strong>{{ $t('errorCodes.solution') }}：</strong>{{ result.solution }}</div>
        <div v-if="result.explanation"><strong>{{ $t('errorCodes.queryResult.explanation') }}：</strong>{{ result.explanation }}</div>
      </van-card>
    </div>
  </div>
  </template>

<script>
import { computed, ref } from 'vue'
import { Search as VanSearch, Empty as VanEmpty, NavBar as VanNavBar, Card as VanCard, Skeleton as VanSkeleton } from 'vant'
import api from '@/api'

export default {
  name: 'MErrorQuery',
  components: {
    'van-search': VanSearch,
    'van-empty': VanEmpty,
    'van-nav-bar': VanNavBar,
    'van-card': VanCard,
    'van-skeleton': VanSkeleton
  },
  setup() {
    const keyword = ref('')
    const result = ref(null)
    const errorText = ref('')
    const loading = ref(false)
    const resultTitle = computed(() => {
      const code = result.value?.code || keyword.value || '-'
      const sub = result.value?.subsystem ? ` (${result.value.subsystem})` : ''
      return `${code}${sub}`
    })
    const onSearch = async () => {
      const code = (keyword.value || '').trim()
      if (!code) { errorText.value = ''; result.value = null; return }
      loading.value = true
      errorText.value = ''
      result.value = null
      try {
        const resp = await api.errorCodes.getByCodeAndSubsystem(code, '')
        result.value = resp?.data || null
        if (!resp?.data) errorText.value = ''
      } catch (e) {
        errorText.value = e?.response?.data?.message || '查询失败'
      } finally {
        loading.value = false
      }
    }
    return { keyword, result, onSearch, errorText, loading, resultTitle }
  }
}
</script>

<style scoped>
.page { padding-top: 46px; }
.content { padding: 12px; }
.error { color: #e44; font-size: 14px; margin: 8px 0; }
</style>


