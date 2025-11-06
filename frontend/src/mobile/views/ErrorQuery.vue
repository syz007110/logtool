<template>
  <div class="page">
    <!-- 顶部标题栏 -->
    <div class="header">
      <h1 class="page-title">{{ $t('mobile.titles.errorQuery') }}</h1>
      <van-icon name="setting-o" class="header-icon" />
    </div>
    
    <div class="content">
      <!-- Search Section -->
      <div class="search-section">
        <div class="search-input-wrapper">
          <div class="search-box">
            <van-icon name="search" class="search-icon-left" />
            <input
              :value="code"
              type="text"
              class="search-input"
              :placeholder="$t('mobile.errorQuery.searchPlaceholder')"
              autocomplete="off"
              @input="handleCodeInput($event)"
              @keyup.enter="onSearch"
            />
          </div>
          <van-button 
            type="primary" 
            size="small"
            :loading="loading" 
            :disabled="!canSearch" 
            class="search-button"
            @click="onSearch"
          >
            {{ $t('shared.search') }}
          </van-button>
        </div>
        <van-dropdown-menu v-if="needSubsystemSelect">
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
        <div class="card-title">{{ $t('mobile.errorQuery.usageGuide') }}</div>
        <div class="info-content">
          <!-- 输入格式 -->
          <div class="info-item">
            <div class="info-header">
              <span class="emoji">📝</span>
              <span class="info-header-text">{{ $t('mobile.errorQuery.inputFormat') }}</span>
            </div>
            <div class="info-body">
              <div class="info-text">
                • {{ $t('mobile.errorQuery.fullErrorCode') }}
                <span class="code-example">142010A</span>
              </div>
              <div class="info-text">
                • {{ $t('mobile.errorQuery.errorType') }}
                <span class="code-example">0X010A</span>
              </div>
            </div>
          </div>
          
          <!-- 故障码格式 -->
          <div class="info-item">
            <div class="info-header">
              <span class="emoji">✅</span>
              <span class="info-header-text">{{ $t('mobile.errorQuery.errorCodeFormat') }}</span>
            </div>
            <div class="info-body">
              <div class="info-text">
                • {{ $t('mobile.errorQuery.formatDescription') }}
              </div>
              <div class="info-text">
                • {{ $t('mobile.errorQuery.lastDigit') }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Recent Searches Card -->
      <div v-if="recentSearches.length > 0 && !loading && !foundRecord" class="recent-searches-card">
        <div class="recent-searches-header">
          <van-icon name="clock-o" class="clock-icon" />
          <span class="recent-searches-title">{{ $t('mobile.errorQuery.recentSearches') }}</span>
        </div>
        <div class="recent-searches-tags">
          <van-tag 
            v-for="(item, idx) in recentSearches" 
            :key="idx"
            class="recent-search-tag"
            @click="quickSearch(item)"
          >
            {{ item }}
          </van-tag>
        </div>
      </div>
      
      <div v-if="errorText" class="error">{{ errorText }}</div>
      <van-skeleton v-else-if="loading" title :row="3" />
      
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
            <div class="type-result-fullcode">{{ item.fullCode }}</div>
            <van-icon name="arrow" class="type-result-arrow" />
          </div>
        </div>
      </div>
      
      <!-- 查询结果 -->
      <div v-if="!loading && foundRecord" class="result-card">
        <!-- 结果头部 -->
        <div class="result-header">
          <div class="result-header-content">
            <div class="result-code-label">{{ $t('mobile.errorQuery.errorCodeLabel') }}</div>
            <div class="result-code-value">{{ code.toUpperCase() }}</div>
          </div>
          <van-button 
            size="small" 
            type="default" 
            class="copy-btn"
            @click="copyResult"
          >
            <van-icon name="copy" class="copy-icon" />
            {{ $t('shared.copy') }}
          </van-button>
                    </div>
                    
                    <!-- 结果主体 -->
        <div class="result-body">
          <!-- 结果信息（直接显示释义内容） -->
          <div class="result-explanation">{{ explanationText }}</div>
          
          <!-- 参数含义 -->
          <div class="result-section">
            <div class="section-label">{{ $t('mobile.errorQuery.paramMeanings') }}</div>
            <div class="params-list">
              <div v-for="(param, idx) in [1,2,3,4]" :key="idx" class="param-item">
                <span class="param-number">{{ idx + 1 }}</span>
                <span class="param-text">{{ record[`param${param}`] ?? '-' }}</span>
              </div>
            </div>
          </div>
          
          <!-- 详细信息 -->
          <div class="result-section">
            <div class="section-label">{{ $t('mobile.errorQuery.detailInfo') }}</div>
            <div class="section-text">{{ record.detail || '-' }}</div>
          </div>
          
          <!-- 检查方法 -->
          <div class="result-section">
            <div class="section-label">{{ $t('mobile.errorQuery.checkMethod') }}</div>
            <div class="section-text">{{ record.method || '-' }}</div>
          </div>
          
          <!-- 技术排查方案 -->
          <div class="result-section">
            <div class="section-label">{{ $t('mobile.errorQuery.techSolution') }}</div>
            <div class="solution-steps">{{ record.tech_solution || '-' }}</div>
          </div>
          
          <!-- 故障分类 -->
          <div class="result-section">
            <div class="section-label">{{ $t('mobile.errorQuery.faultCategory') }}</div>
            <div class="category-badge">{{ record.category || '-' }}</div>
          </div>
        </div>
      </div>
      
      <!-- 无数据 -->
      <van-empty v-else-if="!loading && !foundRecord && !typeSearchResults.length && code" :description="$t('shared.noData')" />
    </div>
  </div>
  </template>

<script>
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast, showSuccessToast } from 'vant'
import { Empty as VanEmpty, NavBar as VanNavBar, Card as VanCard, Skeleton as VanSkeleton, Field as VanField, CellGroup as VanCellGroup, Button as VanButton, Tag as VanTag, Icon as VanIcon, DropdownMenu, DropdownItem } from 'vant'
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
    const explanationText = computed(() => {
      // 检查当前输入是否为故障类型格式（如0X010A），如果是则不显示前缀
      const currentCode = (code.value || '').trim().toUpperCase()
      const isTypeFormat = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(currentCode)
      
      // 如果是故障类型格式，不显示前缀
      const prefix = isTypeFormat ? '' : (preview.value?.prefix || '')
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
    const loadRecentSearches = () => {
      try {
        const saved = localStorage.getItem('errorCodeRecentSearches')
        if (saved) {
          recentSearches.value = JSON.parse(saved).slice(0, 5)
        }
      } catch (_) {
        recentSearches.value = []
      }
    }
    
    // 保存搜索记录
    const saveRecentSearch = (searchText) => {
      try {
        const searches = recentSearches.value.filter(s => s !== searchText)
        searches.unshift(searchText)
        recentSearches.value = searches.slice(0, 5)
        localStorage.setItem('errorCodeRecentSearches', JSON.stringify(recentSearches.value))
      } catch (_) {}
    }
    
    // 输入处理
    const handleCodeInput = (event) => {
      // 获取输入值并转换为大写
      const inputValue = (event.target?.value || '').toUpperCase()
      code.value = inputValue
    }
    
        // 监听输入变化，清除相关状态
    watch(code, (newValue) => {
      errorText.value = ''
      // 清除故障类型查询结果
      typeSearchResults.value = []
      selectedTypeResult.value = null
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
    }
    
    const handleSubsystemChange = () => {
      errorText.value = ''
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
        `${resultTitle.value}`,
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
    
        // 查询单个故障码
    const querySingleErrorCode = async (normalizedCode, targetSubsystem, originalCode = null, userInput = null) => {
      loading.value = true
      errorText.value = ''
      foundRecord.value = null
      result.value = null
      preview.value = null

      try {
        // 获取解释预览（需要传递完整故障码以获取前缀，包含臂号和关节号信息）
        try { 
          // 如果有原始故障码（完整故障码），使用原始故障码，让后端自动解析子系统、臂号、关节号
          // 如果是故障类型（如0X010A），需要传递子系统参数   
          const codeForPreview = originalCode || normalizedCode
          const previewPayload = { code: codeForPreview }
          // 只有在使用故障类型（没有原始故障码）时才传递子系统
          if (!originalCode && targetSubsystem) {
            previewPayload.subsystem = targetSubsystem
          }
          preview.value = (await api.explanations.preview(previewPayload))?.data || null                                                                        
        } catch (_) {}

        // 查询故障码记录
        try {
          const recResp = await api.errorCodes.getByCodeAndSubsystem(normalizedCode, targetSubsystem)                                                           
          const fetchedRecord = recResp?.data?.errorCode || null
          if (fetchedRecord) {
            foundRecord.value = fetchedRecord
            result.value = { code: normalizedCode, subsystem: targetSubsystem, errorCode: fetchedRecord }                                                       
            // 保存搜索记录 - 使用用户原始输入内容
            const searchKey = userInput || code.value || `${normalizedCode} (${targetSubsystem})`        
            saveRecentSearch(searchKey)
          } else {
            foundRecord.value = null
            result.value = null
          }
        } catch (e) {
          if (e?.response?.status !== 404) {
            errorText.value = e?.response?.data?.message || t('errorCodes.message.queryFailed')                                                                 
          }
          foundRecord.value = null
          result.value = null
        }
      } catch (e) {
        errorText.value = e?.response?.data?.message || t('mobile.errorQuery.queryFailed')
      } finally {
        loading.value = false
      }
    }
    
    const onSearch = async () => {
      const c = (code.value || '').trim().toUpperCase()
      if (!c) { 
        errorText.value = ''; 
        result.value = null
        typeSearchResults.value = []
        selectedTypeResult.value = null
        return 
      }
      
      // 归一化故障码/故障类型
      const normalizeCode = (input) => {
        if (!input) return ''
        const raw = String(input).trim().toUpperCase()
        // 如果是故障类型格式（如010A, 0x010A），统一为0X010A格式
        if (/^(?:0X)?[0-9A-F]{3}[A-E]$/.test(raw)) {
          if (raw.startsWith('0X')) {
            return raw
          }
          return '0X' + raw
        }
        // 完整故障码处理
        if (raw.length >= 5) {
          const tail4 = raw.slice(-4)
          if (/^[0-9A-F]{3}[A-E]$/.test(tail4)) {
            return '0X' + tail4
          }
        }
        if (!raw.startsWith('0X') && /^[0-9A-F]{3}[A-E]$/.test(raw)) {
          return '0X' + raw
        }
        return raw
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
        // 保存用户原始输入的故障类型
        originalUserInput.value = c

        const normalizedType = normalizeCode(c)
        const SUBS = ['1','2','3','4','5','6','7','8','9','A']
        
        try {
          // 并行查询所有子系统
          const queries = SUBS.map(async (sub) => {
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
            } catch (e) {
              // 404是正常的，忽略
              return null
            }
          })
          
          const results = await Promise.all(queries)
          typeSearchResults.value = results.filter(r => r !== null)
          
          if (typeSearchResults.value.length === 0) {
            errorText.value = t('mobile.errorQuery.notFound')
          }
        } catch (e) {
          errorText.value = e?.response?.data?.message || t('mobile.errorQuery.queryFailed')
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
          errorText.value = String(t('errorCodes.selectSubsystem')); 
          return 
        }
      } else {
        const startsWithSubsystem = /^[1-9A]/.test(c)
        if (startsWithSubsystem && !isFull) { 
          errorText.value = String(t('errorCodes.validation.lengthNotEnough')); 
          return 
        }
        if (!isFull) { 
          errorText.value = String(t('errorCodes.validation.codeFormat')); 
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
        const normalizeFullCode = (input) => {
          if (!input) return ''
          const raw = String(input).trim().toUpperCase()
          if (raw.length >= 5) {
            const tail4 = raw.slice(-4)
            if (/^[0-9A-F]{3}[A-E]$/.test(tail4)) {
              return '0X' + tail4
            }
          }
          if (!raw.startsWith('0X') && /^[0-9A-F]{3}[A-E]$/.test(raw)) {
            return '0X' + raw
          }
          return raw
        }
        const codeOnly = normalizeFullCode(c)
        
        // 查询故障码记录（与桌面端逻辑一致）
        // 传递完整故障码（c）用于 preview API，以便获取正确的前缀（包含臂号和关节号）
        if (targetSubsystem) {
          await querySingleErrorCode(codeOnly, targetSubsystem, isFull ? c : null, c)
        }
        
        // 如果还没找到，且是完整码，尝试从首字符推断子系统
        if (!foundRecord.value && !isShort && isFull) {
          const SUBS = ['1','2','3','4','5','6','7','8','9','A']
          const inferredSub = c.charAt(0)
          if (SUBS.includes(inferredSub)) {
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
        handleCodeInput,
        handleClear,
        handleSubsystemChange,
        quickSearch,
        toggleSection,
        copyResult,
        getSolutionClass,
        subsystemOptions,
        typeSearchResults,
        selectedTypeResult,
        selectTypeResult,
        getSubsystemLabel,
        originalUserInput
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
  padding: 16px;
  /* 为顶部添加安全区域适配，防止被前置摄像头遮挡 */
  padding-top: max(16px, env(safe-area-inset-top) + 8px);
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

.header-icon {
  font-size: 16px;
  color: #969799;
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
  color: #ff9800;
  padding: 4px 12px;
  margin-top: -8px;
}

/* Search Section */
.search-section {
  margin-bottom: 12px;
}

.search-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  background: #f3f3f5;
  border-radius: 8px;
  position: relative;
}

.search-icon-left {
  position: absolute;
  right: 12px;
  color: #717182;
  font-size: 16px;
  pointer-events: none;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #323233;
  padding: 8px 36px 8px 12px;
}

.search-input::placeholder {
  color: #717182;
}

.search-button {
  background: #030213;
  border: none;
  border-radius: 8px;
  padding: 0 16px;
  font-size: 14px;
  white-space: nowrap;
  height: 36px;
}

.search-button:disabled {
  background: #e5e7eb !important;
  color: #9ca3af !important;
}

/* 使用说明卡片 */
.info-card {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  padding: 13px;
  margin-bottom: 12px;
}

.info-card .card-title {
  font-size: 16px;
  font-weight: 600;
  color: #323233;
  margin-bottom: 20px;
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.emoji {
  font-size: 16px;
}

.info-header-text {
  font-size: 14px;
  font-weight: 500;
  color: #323233;
}

.info-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 24px;
}

.info-text {
  font-size: 14px;
  color: #646566;
  line-height: 1.6;
}

.code-example {
  background: #eceef2;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  color: #030213;
  font-weight: 500;
}

/* Recent Searches Card */
.recent-searches-card {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  padding: 13px;
  margin-bottom: 12px;
}

.recent-searches-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.clock-icon {
  font-size: 12px;
  color: #4a5565;
}

.recent-searches-title {
  font-size: 12px;
  color: #4a5565;
  font-weight: 500;
}

.recent-searches-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recent-search-tag {
  background: #eceef2;
  color: #030213;
  border: none;
  border-radius: 8px;
  padding: 3px 9.84px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

/* 查询结果卡片 */
.result-card {
  margin-top: 12px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  overflow: hidden;
}

.result-header {
  background: #ecf5ff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.result-header-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-code-label {
  font-size: 12px;
  color: #4a5565;
  font-weight: 500;
}

.result-code-value {
  font-size: 24px;
  font-weight: 600;
  color: #155dfc;
}

.copy-btn {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 4px 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #030213;
}

.copy-icon {
  font-size: 12px;
}

.prefix-badge {
  background: #030213;
  color: white;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  margin: 12px;
  display: inline-block;
}

.result-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.result-section:first-child {
  border-top: none;
  padding-top: 0;
}

.highlight-section {
  background: #f7f8fa;
  border-left: 3px solid #155dfc;
  padding: 12px 12px;
  margin-bottom: 0;
}

.result-explanation {
  font-size: 14px;
  color: #101828;
  line-height: 1.6;
  padding: 0;
}

.section-label {
  font-size: 12px;
  color: #4a5565;
  font-weight: 500;
}

.section-text {
  font-size: 12px;
  color: #364153;
  line-height: 1.6;
}

.params-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.param-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.param-number {
  background: #cbd5e0;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #364153;
  font-weight: 600;
  flex-shrink: 0;
}

.param-text {
  font-size: 12px;
  color: #364153;
  line-height: 1.6;
}

.solution-steps {
  font-size: 12px;
  color: #364153;
  line-height: 1.6;
  white-space: pre-wrap;
}

.category-badge {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 4px 12px;
  display: inline-block;
  font-size: 12px;
  color: #030213;
}

.solution-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.solution-recoverable {
  background: #e8f5e9;
  color: #2e7d32;
}

.solution-unrecoverable {
  background: #ffebee;
  color: #c62828;
}

.solution-ignorable {
  background: #fff3e0;
  color: #ef6c00;
}

.solution-tips {
  background: #e3f2fd;
  color: #1565c0;
}

.solution-log {
  background: #f3e5f5;
  color: #7b1fa2;
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

.type-result-fullcode {
  font-size: 12px;
  color: #969799;
  margin-right: 8px;
  font-family: monospace;
}

.type-result-arrow {
  font-size: 14px;
  color: #c8c9cc;
}
</style>

