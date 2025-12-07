<template>
  <div class="page">
    <!-- 顶部标题栏 -->
    <div class="header">
      <h1 class="page-title">{{ $t('mobile.titles.errorQuery') }}</h1>
    </div>
    
    <div class="content">
      <!-- Search Section -->
      <div class="search-section">
        <div class="search-input-wrapper">
          <div class="search-box">
            <input
              :value="code"
              type="text"
              class="search-input"
              :placeholder="$t('mobile.errorQuery.searchPlaceholder')"
              autocomplete="off"
              @compositionstart="isComposing = true"
              @compositionend="handleCompositionEnd"
              @input="handleInput"
              @keyup.enter="onSearch"
            />
            <button
              v-if="code"
              type="button"
              class="search-clear-btn"
              @click="handleClear"
              aria-label="clear"
            >
              <van-icon name="cross" />
            </button>
          </div>
          <button
            type="button"
            class="search-action-btn"
            :disabled="!canSearch"
            @click="onSearch"
          >
            <van-icon name="search" />
          </button>
        </div>
        <van-dropdown-menu v-if="needSubsystemSelect" class="subsystem-dropdown">
          <van-dropdown-item 
            v-model="subsystem" 
            :options="subsystemOptions"
            @change="handleSubsystemChange"
          />
        </van-dropdown-menu>
        <div v-if="!needSubsystemSelect && code && validationHint" class="validation-hint">
          {{ validationHint }}
        </div>
      </div>
      
      <!-- 使用说明卡片 - 仅在没有查询结果且没有输入时显示 -->
      <div v-if="!loading && !foundRecord && (!code || code === '')" class="info-card">
        <div class="info-card-body">
          <div class="info-card-icon">💡</div>
          <div class="info-card-content">
            <div class="info-card-title">{{ $t('mobile.errorQuery.guideTitle') }}</div>
            <ul class="info-card-list">
              <li>
                <span class="info-label">{{ $t('mobile.errorQuery.method2') }}</span>
                <span class="info-value">142010A</span>
              </li>
              <li>
                <span class="info-label">{{ $t('mobile.errorQuery.method1') }}</span>
                <span class="info-value">0X010A</span>
              </li>
              <li>
                <span class="info-label">{{ $t('mobile.errorQuery.method3') }}</span>
                <span class="info-value">{{ $t('mobile.errorQuery.keywordExample') }}</span>
              </li>
              <li class="info-legend">
                {{ $t('mobile.errorQuery.levelLegend') }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      
      <!-- Recent Searches Card -->
      <div
        v-if="recentSearches.length > 0 && !loading && !foundRecord"
        class="recent-searches-card"
      >
        <div class="recent-searches-header" @click="toggleRecentSearches">
          <div class="recent-searches-title-block">
            <van-icon name="clock-o" class="clock-icon" />
            <span class="recent-searches-title">{{ $t('mobile.errorQuery.recentSearches') }}</span>
            <span class="recent-searches-badge">{{ recentSearches.length }}</span>
          </div>
          <van-icon
            :name="showRecentSearches ? 'arrow-up' : 'arrow-down'"
            class="recent-searches-toggle"
          />
        </div>
        <div v-show="showRecentSearches" class="recent-searches-list">
          <button
            v-for="(item, idx) in recentSearches"
            :key="idx"
            type="button"
            class="recent-search-row"
            @click="quickSearch(item)"
          >
            <span class="recent-search-text">{{ item }}</span>
            <van-icon name="arrow" class="recent-search-arrow" />
          </button>
        </div>
      </div>
      
      <div v-if="offlineNotice" class="offline-notice">{{ offlineMessage }}</div>
      <div v-if="errorText" class="error">{{ errorText }}</div>
      <van-skeleton v-else-if="loading" title :row="3" />
      
      <!-- 关键词查询结果列表 -->
      <div v-if="!loading && keywordResults.length > 0 && !foundRecord" class="keyword-results-card">
        <div class="keyword-results-header">
          <div class="keyword-results-title">{{ $t('mobile.errorQuery.foundResults', { count: keywordResults.length }) }}</div>
          <div v-if="keywordQuery" class="keyword-results-subtitle">{{ keywordQuery }}</div>
        </div>
        <div class="keyword-results-list">
          <div
            v-for="(item, idx) in keywordResults"
            :key="item.id || idx"
            class="keyword-result-item"
            @click="selectKeywordResult(item)"
          >
            <div class="keyword-result-header">
              <div class="keyword-result-type">{{ item.normalizedCode }}</div>
              <div class="keyword-result-fullcode">
                {{ getSubsystemLabel(item.subsystem) }}
                <span class="keyword-result-suffix">{{ item.subsystem }}{{ (item.normalizedCode || '').replace('0X', '') }}</span>
              </div>
            </div>
            <div class="keyword-result-summary">{{ getKeywordSummary(item) }}</div>
            <van-icon name="arrow" class="keyword-result-arrow" />
          </div>
        </div>
      </div>

      <!-- 故障类型查询结果列表 -->
      <div v-if="!loading && typeSearchResults.length > 0 && !foundRecord" class="type-results-card">
        <div class="type-results-header">
          <div class="type-results-title">{{ $t('mobile.errorQuery.foundResults', { count: typeSearchResults.length }) }}</div>
          <div class="type-results-subtitle">{{ $t('mobile.errorQuery.selectErrorCode') }}</div>
        </div>
        <div class="type-results-list">
          <div 
            v-for="(item, idx) in typeSearchResults" 
            :key="idx"
            class="type-result-item"
            @click="selectTypeResult(item)"
          >
            <div class="type-result-code">
              <span class="type-result-label">{{ getSubsystemLabel(item.subsystem) }}-{{ item.normalizedCode }}</span>
            </div>
            <van-icon name="arrow" class="type-result-arrow" />
          </div>
        </div>
      </div>
      
      <!-- 查询结果 -->
      <div v-if="!loading && foundRecord" class="result-card">
        <div class="result-summary">
          <div class="summary-text">
            <span class="summary-label">{{ $t('mobile.errorQuery.errorCodeLabel') }}</span>
            <span class="summary-value">{{ resultCodeDisplay }}</span>
          </div>
          <button type="button" class="summary-copy-btn" @click="copyResult">
            <van-icon name="copy" />
            <span>{{ $t('mobile.errorQuery.copyAll') }}</span>
          </button>
        </div>
        <div class="result-section-group">
          <section class="result-section-item">
            <div class="section-card">
              <p class="section-paragraph">{{ explanationText }}</p>
            </div>
          </section>

          <section class="result-section-item">
            <header class="section-title">{{ $t('mobile.errorQuery.sectionTitles.params') }}</header>
            <div class="section-card">
              <ul class="parameter-list">
                <li v-for="(param, idx) in paramList" :key="idx">
                  <span class="param-bullet">•</span>
                  <span class="param-content">{{ param }}</span>
                </li>
              </ul>
            </div>
          </section>

          <section class="result-section-item">
            <header class="section-title">{{ $t('mobile.errorQuery.sectionTitles.detail') }}</header>
            <div class="section-card">
              <p class="section-paragraph">{{ record.detail || '-' }}</p>
            </div>
          </section>

          <section class="result-section-item">
            <header class="section-title">{{ $t('mobile.errorQuery.sectionTitles.method') }}</header>
            <div class="section-card">
              <p class="section-paragraph">{{ record.method || '-' }}</p>
            </div>
          </section>

          <section class="result-section-item">
            <header class="section-title">{{ $t('mobile.errorQuery.sectionTitles.solution') }}</header>
            <div class="section-card">
              <pre class="section-pre">{{ record.tech_solution || '-' }}</pre>
            </div>
          </section>

          <section class="result-section-item">
            <header class="section-title">{{ $t('mobile.errorQuery.sectionTitles.category') }}</header>
            <div class="section-card category-card">
              <span class="badge badge-outline">{{ getCategoryDisplayText(record.category) }}</span>
            </div>
          </section>
        </div>

      </div>
      
      <!-- 无数据 -->
      <van-empty v-else-if="!loading && !foundRecord && !typeSearchResults.length && !keywordResults.length && code" :description="$t('shared.noData')" />
    </div>
  </div>
  </template>

<script>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast, showSuccessToast } from 'vant'
import { Empty as VanEmpty, NavBar as VanNavBar, Card as VanCard, Skeleton as VanSkeleton, Field as VanField, CellGroup as VanCellGroup, Button as VanButton, Tag as VanTag, Icon as VanIcon, DropdownMenu, DropdownItem } from 'vant'
import api from '@/api'
import { fetchRecentSearches, storeRecentSearch } from '@/utils/offline/recentSearchStore'
import { replaceErrorCodes, upsertErrorCodes, getErrorCodeLocal, searchErrorCodesLocal, getErrorCodeSyncMeta, getErrorCodeCount } from '@/utils/offline/errorCodeTableStore'
import { derivePrefixFromRecord, derivePrefixLabel } from '@/utils/offline/prefixUtils'
import categoryKeyMap from '@/config/categoryKeyMap.json'
import prefixKeyMap from '@/config/prefixKeyMap.json'

export default {
  name: 'MErrorQuery',
  components: {
    'van-empty': VanEmpty,
    'van-nav-bar': VanNavBar,
    'van-card': VanCard,
    'van-skeleton': VanSkeleton,
    'van-field': VanField,
    'van-cell-group': VanCellGroup,
    'van-button': VanButton,
    'van-tag': VanTag,
    'van-icon': VanIcon,
    'van-dropdown-menu': DropdownMenu,
    'van-dropdown-item': DropdownItem
  },
  setup() {
    const { t } = useI18n()
    const code = ref('')
    const result = ref(null)
    const preview = ref(null)
    const offlinePrefix = ref('')
    const errorText = ref('')
    const loading = ref(false)
    const foundRecord = ref(null)
    const subsystem = ref('')
    const recentSearches = ref([])
    const expandedSections = ref({
      info: true,
      params: false,
      more: false
    })
    // 故障类型查询结果列表
    const typeSearchResults = ref([])
    const selectedTypeResult = ref(null)
    // 保存用户原始输入的故障类型（用于历史记录）
    const originalUserInput = ref('')
    
    const subsystemOptions = computed(() => [
      { text: t('shared.subsystemOptions.1'), value: '1' },
      { text: t('shared.subsystemOptions.2'), value: '2' },
      { text: t('shared.subsystemOptions.3'), value: '3' },
      { text: t('shared.subsystemOptions.4'), value: '4' },
      { text: t('shared.subsystemOptions.5'), value: '5' },
      { text: t('shared.subsystemOptions.6'), value: '6' },
      { text: t('shared.subsystemOptions.7'), value: '7' },
      { text: t('shared.subsystemOptions.8'), value: '8' },
      { text: t('shared.subsystemOptions.9'), value: '9' },
      { text: t('shared.subsystemOptions.A'), value: 'A' }
    ])

    const keywordResults = ref([])
    const keywordQuery = ref('')
    const isComposing = ref(false)
    const showRecentSearches = ref(true)
    const offlineNotice = ref(false)
    const offlineDatasetReady = ref(false)
    const lastSyncedAt = ref(null)
    const syncingErrorCodes = ref(false)
    const FULL_SYNC_INTERVAL = 1000 * 60 * 60 * 12
    const PAGE_SIZE = 200
    const SUBSYSTEM_CODES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A']
    
    const toNormalizedTypeCode = (input) => {
      if (!input) return ''
      const raw = String(input).trim().toUpperCase()
      if (/^(?:0X)?[0-9A-F]{3}[A-E]$/.test(raw)) {
        return raw.startsWith('0X') ? raw : `0X${raw}`
      }
      if (raw.length >= 4) {
        const tail4 = raw.slice(-4)
        if (/^[0-9A-F]{3}[A-E]$/.test(tail4)) {
          return `0X${tail4}`
        }
      }
      return raw
    }

    const isKeywordInput = computed(() => {
      const raw = (code.value || '').trim()
      if (!raw) return false
      if (/[\u4e00-\u9fff]/.test(raw)) return true
      const sanitized = raw.replace(/^0x/i, '')
      return /[^0-9A-F]/i.test(sanitized)
    })
    
    const resultTitle = computed(() => {
      const rawCode = (result.value?.code || foundRecord.value?.code || code.value || '-').toUpperCase()
      const displayCode = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(rawCode)
        ? (rawCode.startsWith('0X') ? rawCode : `0X${rawCode}`)
        : rawCode
      const subFromResult = (result.value?.subsystem || foundRecord.value?.subsystem || '').toString().toUpperCase()
      const subFromInput = '' + (subsystem?.value || '')
      const displaySub = (subFromResult || subFromInput || '').toString().toUpperCase()
      return displaySub ? `${displayCode} (${displaySub})` : displayCode
    })
    
    const inferredSubsystem = computed(() => {
      if (subsystem.value) return subsystem.value.toUpperCase()
      if (foundRecord.value?.subsystem) return foundRecord.value.subsystem.toUpperCase()
      if (code.value && /^[1-9A]/.test(code.value)) {
        return code.value.charAt(0).toUpperCase()
      }
      return ''
    })
    const record = computed(() => {
      return foundRecord.value || {}
    })
    // 将中文前缀转换为英文键名
    const getPrefixKey = (chinesePrefix) => {
      return prefixKeyMap[chinesePrefix] || chinesePrefix
    }
    
    // 翻译前缀文本（根据系统语言）
    const translatePrefix = (prefix) => {
      if (!prefix) return ''
      // 尝试直接翻译整个前缀（先转换为英文键名）
      const prefixKey = getPrefixKey(prefix)
      const directTranslation = t(`shared.prefixLabels.${prefixKey}`)
      if (directTranslation && directTranslation !== `shared.prefixLabels.${prefixKey}`) {
        return directTranslation
      }
      // 如果直接翻译失败，尝试分段翻译（处理复合前缀，如 "远程端 左主控制臂"）
      const parts = prefix.split(/\s+/)
      const translatedParts = parts.map(part => {
        const partKey = getPrefixKey(part)
        const translated = t(`shared.prefixLabels.${partKey}`)
        return (translated && translated !== `shared.prefixLabels.${partKey}`) ? translated : part
      })
      return translatedParts.join(' ')
    }
    
    const explanationText = computed(() => {
      // 检查当前输入是否为故障类型格式（如0X010A），如果是则不显示前缀
      const currentCode = (code.value || '').trim().toUpperCase()
      const isTypeFormat = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(currentCode)
      
      // 如果是故障类型格式，不显示前缀
      const rawPrefix = isTypeFormat ? '' : (preview.value?.prefix || offlinePrefix.value || '')
      const prefix = rawPrefix ? translatePrefix(rawPrefix) : ''
      const main = [record.value?.user_hint, record.value?.operation].filter(Boolean).join(' ')
      const text = main || record.value?.explanation || '-'
      // 如果有前缀，添加前缀；否则直接返回文本
      return prefix ? `${prefix} ${text}` : text
    })
    // 检测是否为故障类型格式（如010A, 0x010A, 0X010a等）
    const isErrorTypeFormat = computed(() => {
      const full = (code.value || '').trim().toUpperCase()
      if (!full) return false
      // 匹配：010A, 0x010A, 0X010A等，最后一位必须是A-E
      const typePattern = /^(?:0X)?[0-9A-F]{3}[A-E]$/
      return typePattern.test(full)
    })
    
    const needSubsystemSelect = computed(() => {
      const full = (code.value || '').trim().toUpperCase()
      if (!full) return false
       if (isKeywordInput.value) return false
      // 如果是故障类型格式，不需要子系统选择（会显示所有结果供选择）
      if (isErrorTypeFormat.value) return false
      const isShort = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(full)
      return isShort
    })
    
    const canSearch = computed(() => {
      const c = (code.value || '').trim()
      if (!c) return false
      // 如果是故障类型格式，可以直接搜索
      if (isErrorTypeFormat.value) return true
      if (needSubsystemSelect.value && !subsystem.value) return false
      return true
    })
    
    const validationHint = computed(() => {
      const c = (code.value || '').trim().toUpperCase()
      if (!c) return ''
      if (isKeywordInput.value) return ''
      // 如果是故障类型格式，显示提示
      if (isErrorTypeFormat.value) {
        return
      }
      const isFull = /^[1-9A][0-9A-F]{5}[A-E]$/.test(c)
      if (isFull) return ''
      const startsWithSubsystem = /^[1-9A]/.test(c)
      if (startsWithSubsystem) return t('errorCodes.validation.lengthNotEnough')
      return t('errorCodes.validation.codeFormat')
    })
    
    // 加载历史记录
    const loadRecentSearches = async () => {
      try {
        recentSearches.value = await fetchRecentSearches(5)
      } catch (_) {
        recentSearches.value = []
      }
    }
    
    // 保存搜索记录
    const saveRecentSearch = async (searchText) => {
      try {
        recentSearches.value = await storeRecentSearch(searchText, 5)
      } catch (_) {
        const searches = recentSearches.value.filter(s => s !== searchText)
        searches.unshift(searchText)
        recentSearches.value = searches.slice(0, 5)
      }
    }

    const ensureOfflineDataset = async () => {
      if (offlineDatasetReady.value) return true
      try {
        const count = await getErrorCodeCount()
        offlineDatasetReady.value = count > 0
        return offlineDatasetReady.value
      } catch (_) {
        offlineDatasetReady.value = false
        return false
      }
    }

    const cacheErrorCodesSafely = async (records) => {
      if (!records || !records.length) return
      try {
        await upsertErrorCodes(records)
        offlineDatasetReady.value = true
      } catch (cacheError) {
        console.warn('[ErrorQuery] Failed to persist offline cache', cacheError)
      }
    }

    const fetchAllErrorCodes = async () => {
      const aggregated = []
      let page = 1
      while (true) {
        const response = await api.errorCodes.getList({ page, limit: PAGE_SIZE })
        const list = response?.data?.errorCodes || []
        if (!list.length) break
        aggregated.push(...list)
        if (list.length < PAGE_SIZE) break
        page += 1
      }
      return aggregated
    }

    const ensureErrorCodesSynced = async (force = false) => {
      try {
        if (syncingErrorCodes.value) {
          await ensureOfflineDataset()
          return
        }
        const syncedAt = await getErrorCodeSyncMeta()
        lastSyncedAt.value = syncedAt
        if (!navigator.onLine && !force) return
        const shouldSync = force || !syncedAt || (Date.now() - syncedAt > FULL_SYNC_INTERVAL)
        if (!shouldSync) {
          await ensureOfflineDataset()
          return
        }
        if (!navigator.onLine) return
        syncingErrorCodes.value = true
        const records = await fetchAllErrorCodes()
        if (records.length) {
          await replaceErrorCodes(records)
          offlineDatasetReady.value = true
          lastSyncedAt.value = Date.now()
        }
      } catch (error) {
        console.error('Failed to sync error codes for offline use', error)
      } finally {
        syncingErrorCodes.value = false
        await ensureOfflineDataset()
      }
    }

    const handleOnline = () => {
      ensureErrorCodesSynced(false)
    }
    
    // 处理普通输入（非中文输入法）
    const handleInput = (event) => {
      // 如果正在输入中文，不处理（由compositionend处理）
      if (isComposing.value) {
        // 即使正在输入中文，也要更新code.value以保持同步
        code.value = event.target.value || ''
        return
      }
      
      const value = event.target.value || ''
      // 如果是非关键字输入（纯16进制），转换为大写
      const raw = String(value)
      const hasChinese = /[\u4e00-\u9fff]/.test(raw)
      const sanitized = raw.replace(/^0x/i, '')
      const isKeyword = hasChinese || /[^0-9A-F]/i.test(sanitized)
      
      if (!isKeyword && /^[0-9A-Fa-f0X\s]*$/.test(raw)) {
        const upperValue = raw.toUpperCase()
        // 避免重复设置相同的值
        if (upperValue !== code.value) {
          code.value = upperValue
        }
      } else {
        // 关键字输入，直接更新
        if (value !== code.value) {
          code.value = value
        }
      }
    }
    
    // 处理中文输入法结束
    const handleCompositionEnd = (event) => {
      isComposing.value = false
      const value = event.target.value || ''
      // 中文输入法结束后，直接更新值（中文输入肯定是关键字）
      if (value !== code.value) {
        code.value = value
      }
    }
    
    // 监听输入变化，清除相关状态
    watch(code, (newValue) => {
      // 如果正在输入中文，不处理
      if (isComposing.value) return
      
      errorText.value = ''
      // 清除故障类型查询结果
      typeSearchResults.value = []
      selectedTypeResult.value = null
      keywordResults.value = []
      keywordQuery.value = ''
      offlineNotice.value = false
      offlinePrefix.value = ''
      // 清除原始输入记录
      originalUserInput.value = ''
      // 如果输入改变，清除已找到的记录
      if (foundRecord.value) {                                                                             
        foundRecord.value = null
        result.value = null
      }
    })
    
    const handleClear = () => {
      code.value = ''
      errorText.value = ''
      foundRecord.value = null
      result.value = null
      typeSearchResults.value = []
      selectedTypeResult.value = null
      keywordResults.value = []
      keywordQuery.value = ''
      offlineNotice.value = false
      preview.value = null
      offlinePrefix.value = ''
    }
    
    const handleSubsystemChange = () => {
      errorText.value = ''
      offlineNotice.value = false
      offlinePrefix.value = ''
    }
    
    // 快捷搜索
    const quickSearch = (searchText) => {
      code.value = searchText
      onSearch()
    }
    
    // 切换章节展开/折叠
    const toggleSection = (section) => {
      expandedSections.value[section] = !expandedSections.value[section]
    }
    
    // 复制结果
    const copyResult = async () => {
      if (!foundRecord.value) return
      const text = [
        `${resultCodeDisplay.value}`,
        `${t('errorCodes.queryResult.explanation')}: ${explanationText.value}`,
        ...(record.value.param1 ? [`${t('errorCodes.formLabels.param1')}: ${record.value.param1}`] : []),
        ...(record.value.param2 ? [`${t('errorCodes.formLabels.param2')}: ${record.value.param2}`] : []),
        ...(record.value.param3 ? [`${t('errorCodes.formLabels.param3')}: ${record.value.param3}`] : []),
        ...(record.value.param4 ? [`${t('errorCodes.formLabels.param4')}: ${record.value.param4}`] : []),
        ...(record.value.detail ? [`${t('errorCodes.queryResult.detail')}: ${record.value.detail}`] : []),
        ...(record.value.method ? [`${t('errorCodes.queryResult.method')}: ${record.value.method}`] : []),
      ].join('\n')
      
      try {
        await navigator.clipboard.writeText(text)
        showSuccessToast(t('mobile.errorQuery.copySuccess'))
      } catch (e) {
        // 降级方案
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        try {
          document.execCommand('copy')
          showSuccessToast(t('mobile.errorQuery.copySuccess'))
        } catch (_) {
          showToast(t('mobile.errorQuery.copyFailed'))
        }
        document.body.removeChild(textarea)
      }
    }
    
    // 获取解决方案样式类
    const getSolutionClass = (solution) => {
      const classMap = {
        'recoverable': 'solution-recoverable',
        'unrecoverable': 'solution-unrecoverable',
        'ignorable': 'solution-ignorable',
        'tips': 'solution-tips',
        'log': 'solution-log'
      }
      return classMap[solution] || ''
    }
    
    onMounted(() => {
      loadRecentSearches()
      ensureErrorCodesSynced(false)
      ensureOfflineDataset()
      window.addEventListener('online', handleOnline)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('online', handleOnline)
    })
    // 选择故障类型查询结果
    const selectTypeResult = async (item) => {
      selectedTypeResult.value = item
      // 只显示故障类型，不拼接子系统号
      code.value = item.normalizedCode
      subsystem.value = item.subsystem
      // 使用用户原始输入的故障类型作为历史记录（如 571E），而不是拼接后的格式
      const userInputText = originalUserInput.value || item.normalizedCode
      // 直接查询选中的结果（使用完整故障码，但不生成前缀）
      // 传递完整故障码用于查询，但explanationText会根据code.value是否为故障类型格式决定是否显示前缀
      await querySingleErrorCode(item.normalizedCode, item.subsystem, item.fullCode, userInputText)
    }

    const getKeywordSummary = (item) => {
      if (!item) return ''
      return [item.user_hint, item.operation, item.detail].filter(Boolean).join(' · ') || '-'
    }

    const resultCodeDisplay = computed(() => {
      const userInput = (originalUserInput.value || code.value || '').toString().trim().toUpperCase()
      if (/^[1-9A][0-9A-F]{5}[A-E]$/.test(userInput)) {
        return userInput
      }
      const rec = record.value || {}
      const candidate =
        rec.full_code ||
        rec.code ||
        foundRecord.value?.full_code ||
        foundRecord.value?.code ||
        code.value ||
        ''
      return String(candidate).toUpperCase()
    })

    const subsystemBadge = computed(() => {
      const rawSubsystem = (foundRecord.value?.subsystem || inferredSubsystem.value || '').toString().toUpperCase()
      if (!rawSubsystem) return ''
      const label = getSubsystemLabel(rawSubsystem)
      return label ? `${rawSubsystem} - ${label}` : rawSubsystem
    })

    const levelBadge = computed(() => {
      const rawLevel = (record.value?.level || record.value?.level_code || '').toString().toUpperCase()
      if (!rawLevel) return null
      const map = {
        A: { label: t('mobile.errorQuery.levelBadge.A'), className: 'badge-danger' },
        B: { label: t('mobile.errorQuery.levelBadge.B'), className: 'badge-warning' },
        C: { label: t('mobile.errorQuery.levelBadge.C'), className: 'badge-info' },
        D: { label: t('mobile.errorQuery.levelBadge.D'), className: 'badge-info' },
        E: { label: t('mobile.errorQuery.levelBadge.E'), className: 'badge-neutral' }
      }
      return map[rawLevel] || null
    })

    const paramList = computed(() => {
      const params = []
      for (let i = 1; i <= 4; i += 1) {
        const value = record.value?.[`param${i}`]
        if (value) {
          params.push(value)
        }
      }
      return params.length ? params : [t('mobile.errorQuery.paramsFallback')]
    })

    const offlineMessage = computed(() => t('mobile.errorQuery.offlineNotice'))
    const isOfflineError = (error) => {
      if (!navigator.onLine) return true
      if (!error) return false
      if (error?.response?.status === 503) return true
      const message = error?.response?.data?.message || error?.message || ''
      if (message === 'offline') return true
      if (/network\s?error/i.test(message)) return true
      if (/failed to fetch/i.test(message)) return true
      return false
    }

    const mapToKeywordResults = (records) =>
      records.map((record) => ({
        ...record,
        normalizedCode: toNormalizedTypeCode(record.code)
      }))

    const handleOfflineKeywordSearch = async (target) => {
      keywordQuery.value = target
      keywordResults.value = []
      offlinePrefix.value = ''
      const hasDataset = await ensureOfflineDataset()
      if (!hasDataset) {
        offlineNotice.value = true
        errorText.value = offlineMessage.value
        return
      }
      const localResults = await searchErrorCodesLocal(target)
      offlineNotice.value = true
      if (!localResults.length) {
        errorText.value = t('mobile.errorQuery.notFound')
        return
      }
      const mapped = mapToKeywordResults(localResults)
      keywordResults.value = mapped.slice(0, 50)
      errorText.value = ''
      await saveRecentSearch(target)
      showRecentSearches.value = false
    }

    const performKeywordSearch = async (keyword) => {
      const target = (keyword || '').trim()
      if (!target) return
      loading.value = true
      errorText.value = ''
      offlineNotice.value = false
      foundRecord.value = null
      result.value = null
      preview.value = null
      typeSearchResults.value = []
      selectedTypeResult.value = null
      keywordResults.value = []
      offlinePrefix.value = ''
      try {
        if (!navigator.onLine) {
          await handleOfflineKeywordSearch(target)
          return
        }
        const response = await api.errorCodes.getList({ keyword: target, page: 1, limit: 50 })
        const records = response?.data?.errorCodes || []
        keywordQuery.value = target
        if (!records.length) {
          errorText.value = t('mobile.errorQuery.notFound')
          return
        }
        keywordResults.value = mapToKeywordResults(records)
        await saveRecentSearch(target)
        showRecentSearches.value = false
        errorText.value = ''
        offlineNotice.value = false
        await cacheErrorCodesSafely(records)
      } catch (e) {
        if (isOfflineError(e)) {
          await handleOfflineKeywordSearch(target)
        } else {
          errorText.value = e?.response?.data?.message || t('mobile.errorQuery.queryFailed')
        }
      } finally {
        loading.value = false
      }
    }

    const selectKeywordResult = async (item) => {
      if (!item) return
      const normalizedCode = toNormalizedTypeCode(item.code || item.normalizedCode)
      const targetSubsystem = String(item.subsystem || '').toUpperCase()
      code.value = normalizedCode
      subsystem.value = targetSubsystem
      await querySingleErrorCode(normalizedCode, targetSubsystem, null, keywordQuery.value || normalizedCode)
    }
    
    const toggleRecentSearches = () => {
      showRecentSearches.value = !showRecentSearches.value
    }

    const handleOfflineTypeSearch = async (normalizedType) => {
      typeSearchResults.value = []
      offlinePrefix.value = ''
      const hasDataset = await ensureOfflineDataset()
      if (!hasDataset) {
        offlineNotice.value = true
        errorText.value = offlineMessage.value
        return
      }
      const results = []
      for (const sub of SUBSYSTEM_CODES) {
        // eslint-disable-next-line no-await-in-loop
        const record = await getErrorCodeLocal(normalizedType, sub)
        if (record) {
          results.push({
            subsystem: sub,
            normalizedCode: normalizedType,
            fullCode: `${sub}${normalizedType.replace('0X', '')}`,
            errorCode: record
          })
        }
      }
      offlineNotice.value = true
      if (!results.length) {
        errorText.value = t('mobile.errorQuery.notFound')
        return
      }
      typeSearchResults.value = results
      errorText.value = ''
      showRecentSearches.value = false
    }

    const handleOfflineSingleResult = async (normalizedCode, targetSubsystem, userInput = null, rawCodeForPrefix = null) => {
      const hasDataset = await ensureOfflineDataset()
      if (!hasDataset) {
        offlineNotice.value = true
        errorText.value = offlineMessage.value
        foundRecord.value = null
        result.value = null
        offlinePrefix.value = ''
        return
      }
      const localRecord = await getErrorCodeLocal(normalizedCode, targetSubsystem)
      if (localRecord) {
        foundRecord.value = localRecord
        result.value = { code: normalizedCode, subsystem: targetSubsystem, errorCode: localRecord }
        preview.value = null
        const inferredRaw = rawCodeForPrefix || (targetSubsystem ? `${targetSubsystem}${normalizedCode.replace(/^0X/, '')}` : normalizedCode)
        const prefixLabel = derivePrefixFromRecord(localRecord, {
          subsystem: targetSubsystem,
          rawCode: inferredRaw
        }) || derivePrefixLabel(inferredRaw, targetSubsystem)
        offlinePrefix.value = prefixLabel
        offlineNotice.value = true
        errorText.value = ''
        const searchKey = userInput || code.value || `${normalizedCode} (${targetSubsystem})`
        await saveRecentSearch(searchKey)
      } else {
        offlineNotice.value = true
        foundRecord.value = null
        result.value = null
        errorText.value = t('mobile.errorQuery.notFound')
        offlinePrefix.value = ''
      }
    }

    // 查询单个故障码
    const querySingleErrorCode = async (normalizedCode, targetSubsystem, originalCode = null, userInput = null) => {
      loading.value = true
      errorText.value = ''
      offlineNotice.value = false
      foundRecord.value = null
      result.value = null
      preview.value = null
      offlinePrefix.value = ''

      const codeForPreview = originalCode || normalizedCode
      const previewPayload = { code: codeForPreview }
      if (!originalCode && targetSubsystem) {
        previewPayload.subsystem = targetSubsystem
      }

      const runOffline = async () => {
        await handleOfflineSingleResult(normalizedCode, targetSubsystem, userInput, codeForPreview)
      }

      if (!navigator.onLine) {
        await runOffline()
        loading.value = false
        return
      }

      let fetchedRecord = null
      try {
        try {
          const previewResp = await api.explanations.preview(previewPayload)
          preview.value = previewResp?.data || null
        } catch (previewError) {
          if (isOfflineError(previewError)) {
            offlineNotice.value = true
            offlinePrefix.value = derivePrefixLabel(codeForPreview, targetSubsystem)
          } else if (previewError?.response?.status && previewError.response.status >= 500) {
            errorText.value = previewError.response?.data?.message || t('mobile.errorQuery.queryFailed')
          }
        }
        try {
          const recResp = await api.errorCodes.getByCodeAndSubsystem(normalizedCode, targetSubsystem)
          fetchedRecord = recResp?.data?.errorCode || null
        } catch (fetchError) {
          if (isOfflineError(fetchError)) {
            await runOffline()
            return
          }
          if (fetchError?.response?.status === 404) {
            errorText.value = t('mobile.errorQuery.notFound')
            return
          }
          if (fetchError?.response?.status !== 404) {
            errorText.value = fetchError?.response?.data?.message || t('errorCodes.message.queryFailed')
          }
          return
        }
        if (!fetchedRecord) {
          errorText.value = t('mobile.errorQuery.notFound')
          return
        }

        foundRecord.value = fetchedRecord
        result.value = { code: normalizedCode, subsystem: targetSubsystem, errorCode: fetchedRecord }
        const searchKey = userInput || code.value || `${normalizedCode} (${targetSubsystem})`
        await saveRecentSearch(searchKey)
        offlineNotice.value = false
        errorText.value = ''
        offlinePrefix.value = ''
        await cacheErrorCodesSafely([fetchedRecord])
      } catch (e) {
        if (isOfflineError(e)) {
          await runOffline()
        } else if (!errorText.value) {
          errorText.value = e?.response?.data?.message || t('mobile.errorQuery.queryFailed')
        }
      } finally {
        loading.value = false
      }
    }
    
    const onSearch = async () => {
      const rawInput = (code.value || '').trim()
      const c = rawInput.toUpperCase()
      if (!c) { 
        errorText.value = ''
        result.value = null
        typeSearchResults.value = []
        selectedTypeResult.value = null
        keywordResults.value = []
        keywordQuery.value = ''
        return 
      }

      if (isKeywordInput.value) {
        await performKeywordSearch(rawInput)
        return
      }
      
      // 检测是否为故障类型格式
      const isTypeFormat = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(c)
      
      // 如果是故障类型格式，查询所有子系统
      if (isTypeFormat) {
        loading.value = true
        errorText.value = ''
        typeSearchResults.value = []
        selectedTypeResult.value = null
        foundRecord.value = null
        result.value = null
        preview.value = null
        keywordResults.value = []
        keywordQuery.value = ''
        // 保存用户原始输入的故障类型
        originalUserInput.value = c

        const normalizedType = toNormalizedTypeCode(c)
        try {
          if (!navigator.onLine) {
            await handleOfflineTypeSearch(normalizedType)
            return
          }
          const queries = SUBSYSTEM_CODES.map(async (sub) => {
            try {
              const recResp = await api.errorCodes.getByCodeAndSubsystem(normalizedType, sub)
              const fetchedRecord = recResp?.data?.errorCode || null
              if (fetchedRecord) {
                return {
                  subsystem: sub,
                  normalizedCode: normalizedType,
                  fullCode: `${sub}${normalizedType.replace('0X', '')}`,
                  errorCode: fetchedRecord
                }
              }
              return null
            } catch (error) {
              if (error?.response?.status === 404) {
                return null
              }
              if (isOfflineError(error)) {
                throw error
              }
              throw error
            }
          })

          const results = await Promise.all(queries)
          typeSearchResults.value = results.filter((r) => r !== null)

          if (typeSearchResults.value.length === 0) {
            errorText.value = t('mobile.errorQuery.notFound')
          } else {
            showRecentSearches.value = false
            errorText.value = ''
            offlineNotice.value = false
            await cacheErrorCodesSafely(typeSearchResults.value.map((item) => item.errorCode))
          }
        } catch (error) {
          if (isOfflineError(error)) {
            await handleOfflineTypeSearch(normalizedType)
          } else {
            errorText.value = error?.response?.data?.message || t('mobile.errorQuery.queryFailed')
          }
        } finally {
          loading.value = false
        }
        return
      }
      
      // 原有的查询逻辑（完整故障码或短码）
      const isFull = /^[1-9A][0-9A-F]{5}[A-E]$/.test(c)
      const isShort = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(c)
      if (isShort) {
        const sSel = (subsystem.value || '').trim().toUpperCase()
        if (!sSel) { 
          errorText.value = String(t('errorCodes.selectSubsystem'))
          return 
        }
      } else {
        const startsWithSubsystem = /^[1-9A]/.test(c)
        if (startsWithSubsystem && !isFull) { 
          errorText.value = String(t('errorCodes.validation.lengthNotEnough'))
          return 
        }
        if (!isFull) { 
          errorText.value = String(t('errorCodes.validation.codeFormat'))
          return 
        }
      }
      loading.value = true
      errorText.value = ''
      result.value = null
      foundRecord.value = null
      preview.value = null
      typeSearchResults.value = []
      selectedTypeResult.value = null
      keywordResults.value = []
      keywordQuery.value = ''
      // 保存用户原始输入（用于普通查询的历史记录）
      originalUserInput.value = c
      try {
        // 确定子系统（需要在获取 preview 之前确定）
        let targetSubsystem = null
        if (isShort) {
          targetSubsystem = (subsystem.value || '').trim().toUpperCase()
        } else if (isFull) {
          const s = c.charAt(0)
          if (/^[1-9A]$/.test(s)) targetSubsystem = s
        }
        
        // 归一化故障码
        const codeOnly = toNormalizedTypeCode(c)
        
        // 查询故障码记录（与桌面端逻辑一致）
        // 传递完整故障码（c）用于 preview API，以便获取正确的前缀（包含臂号和关节号）
        if (targetSubsystem) {
          await querySingleErrorCode(codeOnly, targetSubsystem, isFull ? c : null, c)
        }
        
        // 如果还没找到，且是完整码，尝试从首字符推断子系统
        if (!foundRecord.value && !isShort && isFull) {
          const inferredSub = c.charAt(0)
          if (SUBSYSTEM_CODES.includes(inferredSub)) {
            await querySingleErrorCode(codeOnly, inferredSub, c, c)
          }
        }
        
      } catch (e) {
        errorText.value = e?.response?.data?.message || t('mobile.errorQuery.queryFailed')
      } finally {
        loading.value = false
      }
    }
    
    // 获取处理措施的中文显示
    const getSolutionDisplay = (solution) => {
      if (!solution) return '-'
      const solutionMap = {
        'recoverable': t('errorCodes.solutionTypes.recoverable'),
        'unrecoverable': t('errorCodes.solutionTypes.unrecoverable'),
        'ignorable': t('errorCodes.solutionTypes.ignorable'),
        'tips': t('errorCodes.solutionTypes.tips'),
        'log': t('errorCodes.solutionTypes.log')
      }
      return solutionMap[solution] || solution
    }
    
    // 将数据库中的分类值（可能是任何语言的翻译）转换为英文键值
    const convertCategoryToKey = (categoryValue) => {
      if (!categoryValue) return ''
      // 优先使用直接映射（因为数据库必定写入中文）
      if (categoryKeyMap[categoryValue]) {
        return categoryKeyMap[categoryValue]
      }
      // 如果直接映射失败，返回原值（可能是英文 key）
      return categoryValue
    }
    
    // 获取分类的显示名称（根据系统语言翻译）
    const getCategoryDisplayText = (categoryValue) => {
      if (!categoryValue) return '-'
      // 先将中文值转换为英文 key（因为数据库可能存储中文值）
      const categoryKey = convertCategoryToKey(categoryValue)
      // 使用 i18n 翻译分类选项
      return t(`errorCodes.categoryOptions.${categoryKey}`) || categoryKey || categoryValue
    }
    
    // 获取子系统标签文字
    const getSubsystemLabel = (subsystem) => {
      if (!subsystem) return ''
      return t(`shared.subsystemOptions.${subsystem}`) || subsystem
    }
    
      return {
        code, 
        subsystem, 
        needSubsystemSelect,
        isErrorTypeFormat,
        canSearch,
        validationHint,
        recentSearches,
        showRecentSearches,
        expandedSections,
        result, 
        foundRecord, 
        onSearch, 
        errorText, 
        loading, 
        resultTitle, 
        record, 
        explanationText, 
        inferredSubsystem,
        getSolutionDisplay,
        handleInput,
        handleCompositionEnd,
        isComposing,
        handleClear,
        handleSubsystemChange,
        quickSearch,
        toggleSection,
        copyResult,
        getSolutionClass,
        subsystemOptions,
        typeSearchResults,
        selectedTypeResult,
        keywordResults,
        keywordQuery,
        selectTypeResult,
        selectKeywordResult,
        toggleRecentSearches,
        getSubsystemLabel,
        getKeywordSummary,
        subsystemBadge,
        levelBadge,
        resultCodeDisplay,
        paramList,
        originalUserInput,
        offlineNotice,
        offlineMessage,
        getCategoryDisplayText,
        translatePrefix
      }
  }
}
</script>

<style scoped>
.page {
  /* 使用 100% 而不是 100vh，避免超出视口 */
  min-height: 100%;
  background-color: #f7f8fa;
  /* 底部留白由 App.vue 全局样式统一设置 */
  box-sizing: border-box;
}

.header {
  background-color: #fff;
  padding: 16px 20px;
  padding-top: max(16px, env(safe-area-inset-top) + 12px);
  border-bottom: 1px solid #ebedf0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #323233;
  margin: 0;
}

.content {
  padding: 12px;
}

.error { 
  color: #ee0a24; 
  font-size: 14px; 
  margin: 8px 0; 
  padding: 8px;
  background: #fef0f0;
  border-radius: 4px;
}

.validation-hint {
  font-size: 12px;
  color: #f79009;
  padding: 4px 0;
}

.offline-notice {
  color: #027a48;
  background: #ecfdf3;
  border: 1px solid rgba(2, 122, 72, 0.18);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  margin: 8px 0;
}

/* Search Section */
.search-section {
  margin-bottom: 16px;
}

.search-input-wrapper {
  display: flex;
  gap: 10px;
  align-items: center;
}

.search-box {
  flex: 1;
  background: #f3f3f5;
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border: 1px solid transparent;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #323233;
}

.search-input::placeholder {
  color: #717182;
}

.search-clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #969799;
  cursor: pointer;
}

.search-action-btn {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  border: none;
  background: #101828;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.search-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.subsystem-dropdown {
  width: 100%;
  margin-top: 12px;
}

/* 使用说明卡片 */
.info-card {
  background: #f3f4f6;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 16px;
}

.info-card-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.info-card-icon {
  font-size: 24px;
  line-height: 1;
}

.info-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-card-title {
  font-size: 12px;
  color: #4a5565;
}

.info-card-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-card-list li {
  font-size: 12px;
  color: #364153;
  display: flex;
  gap: 6px;
}

.info-label {
  color: #4a5565;
}

.info-value {
  color: #101828;
}

.info-legend {
  color: #6a7282;
}

/* Recent Searches Card */
.recent-searches-card {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  margin-bottom: 16px;
  overflow: hidden;
}

.recent-searches-header {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.recent-searches-title-block {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clock-icon {
  font-size: 12px;
  color: #4a5565;
}

.recent-searches-title {
  font-size: 14px;
  color: #4a5565;
  font-weight: 500;
}

.recent-searches-badge {
  background: #eceef2;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  color: #030213;
  font-weight: 500;
}

.recent-searches-toggle {
  font-size: 16px;
  color: #99a1af;
}

.recent-searches-list {
  display: flex;
  flex-direction: column;
  padding: 0 12px 12px;
  gap: 8px;
}

.recent-search-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  font-size: 13px;
  color: #364153;
  text-align: left;
  background-clip: padding-box;
  transition: background 0.2s ease;
}

.recent-search-row:active {
  background: #f3f4f6;
}

.recent-search-text {
  font-weight: 500;
}

.recent-search-arrow {
  font-size: 14px;
  color: #c8c9cc;
}

/* 查询结果卡片 */
.result-card {
  margin-top: 16px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  padding: 18px 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #ecf5ff;
  border: 1px solid rgba(21, 93, 252, 0.18);
  border-radius: 16px 16px 0 0;
  padding: 16px 18px;
  margin: -18px -18px 0;
}

.summary-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-label {
  font-size: 12px;
  color: #364153;
  font-weight: 600;
}

.summary-value {
  font-size: 26px;
  font-weight: 600;
  color: #155dfc;
  letter-spacing: 1px;
}

.summary-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(21, 93, 252, 0.25);
  background: rgba(255, 255, 255, 0.95);
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 12px;
  color: #155dfc;
  cursor: pointer;
}

.result-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 8px;
  font-weight: 500;
  border: 1px solid transparent;
}

.badge-light {
  background: #eceef2;
  color: #030213;
}

.badge-danger {
  background: #ffe8e5;
  color: #d64045;
}

.badge-warning {
  background: #fff4e5;
  color: #d87300;
}

.badge-info {
  background: #e8f1ff;
  color: #155dfc;
}

.badge-neutral {
  background: #ecf2f6;
  color: #364153;
}

.badge-outline {
  background: transparent;
  border-color: rgba(0, 0, 0, 0.16);
  color: #030213;
}

.result-section-group {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.result-section-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 12px;
  color: #364153;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  margin-bottom: 4px;
  font-weight: 600;
}

.section-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 2px;
}

.section-paragraph,
.section-pre {
  font-size: 13px;
  color: #364153;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.parameter-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.parameter-list li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 13px;
  color: #364153;
  line-height: 1.6;
}

.param-bullet {
  color: #99a1af;
}

.param-content {
  flex: 1;
}

.category-card {
  align-items: flex-start;
}

.result-copy-all {
  margin-top: 8px;
  width: 100%;
  border: 1px dashed rgba(0, 0, 0, 0.16);
  border-radius: 12px;
  padding: 10px 16px;
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: #364153;
  cursor: pointer;
}

/* Dropdown Menu Styles */
:deep(.van-dropdown-menu) {
  margin-top: 8px;
}

:deep(.van-dropdown-menu__item) {
  padding: 0 12px;
}

/* 故障类型查询结果列表 */
.type-results-card {
  margin-top: 12px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  overflow: hidden;
}

.type-results-header {
  background: #ecf5ff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding: 12px;
}

.type-results-title {
  font-size: 14px;
  font-weight: 600;
  color: #155dfc;
  margin-bottom: 4px;
}

.type-results-subtitle {
  font-size: 12px;
  color: #4a5565;
}

.type-results-list {
  display: flex;
  flex-direction: column;
}

.type-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: background-color 0.2s;
}

.type-result-item:last-child {
  border-bottom: none;
}

.type-result-item:active {
  background-color: #f7f8fa;
}

.type-result-code {
  display: flex;
  align-items: center;
  flex: 1;
}

.type-result-label {
  font-size: 14px;
  font-weight: 500;
  color: #323233;
  line-height: 1.4;
}

.type-result-arrow {
  font-size: 14px;
  color: #c8c9cc;
}

/* 关键词查询结果 */
.keyword-results-card {
  margin-top: 12px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  overflow: hidden;
}

.keyword-results-header {
  background: #f4f6fb;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.keyword-results-title {
  font-size: 14px;
  font-weight: 600;
  color: #155dfc;
}

.keyword-results-subtitle {
  font-size: 12px;
  color: #4a5565;
  word-break: break-all;
}

.keyword-results-list {
  display: flex;
  flex-direction: column;
}

.keyword-result-item {
  position: relative;
  padding: 12px 36px 12px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.keyword-result-item:last-child {
  border-bottom: none;
}

.keyword-result-item:active {
  background-color: #f7f8fa;
}

.keyword-result-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.keyword-result-type {
  font-size: 16px;
  font-weight: 600;
  color: #155dfc;
}

.keyword-result-fullcode {
  font-size: 12px;
  color: #4a5565;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.keyword-result-suffix {
  font-family: monospace;
  color: #969799;
}

.keyword-result-summary {
  font-size: 12px;
  color: #364153;
  line-height: 1.6;
  word-break: break-word;
}

.keyword-result-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  color: #c8c9cc;
}
</style>

