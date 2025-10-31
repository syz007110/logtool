<template>
  <div class="page">
    <van-nav-bar :title="$t('mobile.titles.errorQuery')" fixed safe-area-inset-top />
    <div class="content">
      <van-cell-group inset>
        <van-field 
          v-model="code" 
          :label="$t('errorCodes.code')" 
          :placeholder="$t('errorCodes.fullCodePlaceholder') || $t('errorCodes.searchPlaceholder')" 
          clearable 
          autocomplete="off"
          autocapitalize="characters"
          @input="handleCodeInput"
          @keyup.enter="onSearch"
          @clear="handleClear"
        >
          <template #button>
            <van-button size="small" type="primary" :loading="loading" :disabled="!canSearch" @click="onSearch">
              {{ $t('shared.search') }}
            </van-button>
          </template>
        </van-field>
        <van-field 
          v-if="needSubsystemSelect" 
          v-model="subsystem" 
          :label="$t('errorCodes.subsystem')" 
          :placeholder="$t('errorCodes.selectSubsystem')" 
          type="number"
          clearable 
          @input="handleSubsystemInput"
          @clear="handleSubsystemClear"
        />
        <div v-if="!needSubsystemSelect && code && validationHint" class="validation-hint">
          {{ validationHint }}
        </div>
      </van-cell-group>
      
      <!-- 快捷操作 -->
      <div v-if="recentSearches.length > 0" class="quick-actions">
        <div class="quick-actions-title">{{ $t('mobile.errorQuery.recentSearches') || '最近搜索' }}</div>
        <div class="quick-actions-tags">
          <van-tag 
            v-for="(item, idx) in recentSearches" 
            :key="idx"
            type="primary" 
            plain 
            size="medium"
            class="quick-tag"
            @click="quickSearch(item)"
          >
            {{ item }}
          </van-tag>
        </div>
      </div>
      <div v-if="errorText" class="error">{{ errorText }}</div>
      <van-skeleton v-else-if="loading" title :row="3" />
      
      <!-- 查询结果 -->
      <div v-if="!loading && foundRecord" class="result-card">
        <div class="card-header">
          <div class="card-title">{{ resultTitle }}</div>
          <van-button 
            size="mini" 
            type="primary" 
            plain
            class="copy-btn"
            @click="copyResult"
          >
            {{ $t('mobile.errorQuery.copy') || '复制' }}
          </van-button>
        </div>
        <div class="card-body">
          <!-- 结果信息 -->
          <div class="section">
            <div class="section-title" @click="toggleSection('info')">
              <span>{{ $t('errorCodes.queryResult.resultInfo') }}</span>
              <van-icon :name="expandedSections.info ? 'arrow-up' : 'arrow-down'" class="section-toggle" />
            </div>
            <div v-show="expandedSections.info" class="section-content">
              <div class="kv highlight">
                <span class="kv-label">{{ $t('errorCodes.queryResult.explanation') }}：</span>
                <span class="kv-value">{{ explanationText }}</span>
              </div>
            </div>
          </div>
          
          <!-- 参数含义 -->
          <div class="section">
            <div class="section-title" @click="toggleSection('params')">
              <span>{{ $t('errorCodes.queryResult.paramMeanings') }}</span>
              <van-icon :name="expandedSections.params ? 'arrow-up' : 'arrow-down'" class="section-toggle" />
            </div>
            <div v-show="expandedSections.params" class="section-content">
              <div v-for="(param, idx) in [1,2,3,4]" :key="idx" class="kv">
                <span class="kv-label">{{ $t(`errorCodes.formLabels.param${param}`) }}：</span>
                <span class="kv-value">{{ record[`param${param}`] ?? '-' }}</span>
              </div>
            </div>
          </div>
          
          <!-- 更多信息 -->
          <div class="section">
            <div class="section-title" @click="toggleSection('more')">
              <span>{{ $t('errorCodes.queryResult.moreInfo') }}</span>
              <van-icon :name="expandedSections.more ? 'arrow-up' : 'arrow-down'" class="section-toggle" />
            </div>
            <div v-show="expandedSections.more" class="section-content">
              <div class="kv">
                <span class="kv-label">{{ $t('errorCodes.queryResult.detail') }}：</span>
                <span class="kv-value">{{ record.detail || '-' }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ $t('errorCodes.queryResult.method') }}：</span>
                <span class="kv-value">{{ record.method || '-' }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ $t('errorCodes.queryResult.techSolution') }}：</span>
                <span class="kv-value">{{ record.tech_solution || '-' }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ $t('errorCodes.queryResult.category') }}：</span>
                <span class="kv-value">{{ record.category || '-' }}</span>
              </div>
              <div class="kv">
                <span class="kv-label">{{ $t('errorCodes.solution') }}：</span>
                <span class="kv-value solution-badge" :class="getSolutionClass(record.solution)">
                  {{ getSolutionDisplay(record.solution) || '-' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 无数据 -->
      <van-empty v-else-if="!loading && !foundRecord" :description="$t('shared.noData')" />
    </div>
  </div>
  </template>

<script>
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast, showSuccessToast } from 'vant'
import { Empty as VanEmpty, NavBar as VanNavBar, Card as VanCard, Skeleton as VanSkeleton, Field as VanField, CellGroup as VanCellGroup, Button as VanButton, Tag as VanTag, Icon as VanIcon } from 'vant'
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
    'van-icon': VanIcon
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
    const record = computed(() => {
      return foundRecord.value || {}
    })
    const explanationText = computed(() => {
      const prefix = preview.value?.prefix || ''
      const main = [record.value?.user_hint, record.value?.operation].filter(Boolean).join(' ')
      const text = main || record.value?.explanation || '-'
      return prefix ? `${prefix} ${text}` : text
    })
    const needSubsystemSelect = computed(() => {
      const full = (code.value || '').trim().toUpperCase()
      if (!full) return false
      const isShort = /^(?:0X)?[0-9A-F]{3}[A-E]$/.test(full)
      return isShort
    })
    
    const canSearch = computed(() => {
      const c = (code.value || '').trim()
      if (!c) return false
      if (needSubsystemSelect.value && !subsystem.value) return false
      return true
    })
    
    const validationHint = computed(() => {
      const c = (code.value || '').trim().toUpperCase()
      if (!c) return ''
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
    const handleCodeInput = (value) => {
      // 自动转换为大写
      if (value) {
        code.value = value.toUpperCase()
      }
      errorText.value = ''
    }
    
    const handleSubsystemInput = (value) => {
      // 只允许数字和字母A
      subsystem.value = value.replace(/[^0-9A]/gi, '').toUpperCase()
      errorText.value = ''
    }
    
    const handleClear = () => {
      code.value = ''
      errorText.value = ''
      foundRecord.value = null
      result.value = null
    }
    
    const handleSubsystemClear = () => {
      subsystem.value = ''
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
        showSuccessToast(t('mobile.errorQuery.copySuccess') || '复制成功')
      } catch (e) {
        // 降级方案
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        try {
          document.execCommand('copy')
          showSuccessToast(t('mobile.errorQuery.copySuccess') || '复制成功')
        } catch (_) {
          showToast(t('mobile.errorQuery.copyFailed') || '复制失败')
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
    const onSearch = async () => {
      const c = (code.value || '').trim().toUpperCase()
      if (!c) { 
        errorText.value = ''; 
        result.value = null; 
        return 
      }
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
      try {
        // 获取解释预览
        try { 
          preview.value = (await api.explanations.preview({ code: c }))?.data || null 
        } catch (_) {}
        
        // 确定子系统
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
        if (targetSubsystem) {
          try {
            const recResp = await api.errorCodes.getByCodeAndSubsystem(codeOnly, targetSubsystem)
            // 后端返回 { errorCode: ... }，桌面端使用 recResp?.data?.errorCode
            const fetchedRecord = recResp?.data?.errorCode || null
            if (fetchedRecord) {
              foundRecord.value = fetchedRecord
              result.value = { code: codeOnly, subsystem: targetSubsystem, errorCode: fetchedRecord }
              // 保存搜索记录（使用实际查询的代码）
              const searchKey = targetSubsystem ? `${codeOnly} (${targetSubsystem})` : codeOnly
              saveRecentSearch(searchKey)
              // 确保数据正确设置
              if (!foundRecord.value || typeof foundRecord.value !== 'object') {
                foundRecord.value = null
                result.value = null
              }
            } else {
              // 查询返回但没有 errorCode，可能是未找到
              foundRecord.value = null
              result.value = null
            }
          } catch (e) {
            // 如果是404，说明没找到，这是正常的，不要显示错误
            if (e?.response?.status !== 404) {
              errorText.value = e?.response?.data?.message || t('errorCodes.message.queryFailed')
            }
            foundRecord.value = null
            result.value = null
          }
        }
        
        // 如果还没找到，且是完整码，尝试从首字符推断子系统
        if (!foundRecord.value && !isShort && isFull) {
          const SUBS = ['1','2','3','4','5','6','7','8','9','A']
          const inferredSub = c.charAt(0)
          if (SUBS.includes(inferredSub)) {
            try { 
              const r1 = await api.errorCodes.getByCodeAndSubsystem(codeOnly, inferredSub)
              const fetchedRecord = r1?.data?.errorCode || null
              if (fetchedRecord) {
                foundRecord.value = fetchedRecord
                result.value = { code: codeOnly, subsystem: inferredSub, errorCode: fetchedRecord }
              }
            } catch (_) {
              // 404是正常的，忽略
            }
          }
        }
        
      } catch (e) {
        errorText.value = e?.response?.data?.message || '查询失败'
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
    
    return { 
      code, 
      subsystem, 
      needSubsystemSelect, 
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
      getSolutionDisplay,
      handleCodeInput,
      handleSubsystemInput,
      handleClear,
      handleSubsystemClear,
      quickSearch,
      toggleSection,
      copyResult,
      getSolutionClass
    }
  }
}
</script>

<style scoped>
.page { padding-top: 46px; }
.content { padding: 12px; }
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

.quick-actions {
  margin-top: 12px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
}

.quick-actions-title {
  font-size: 13px;
  color: #969799;
  margin-bottom: 8px;
}

.quick-actions-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-tag {
  cursor: pointer;
  user-select: none;
}

.result-card {
  margin-top: 12px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.card-header {
  padding: 16px;
  border-bottom: 1px solid #ebedf0;
  background: #fafafa;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #323233;
  flex: 1;
}

.copy-btn {
  flex-shrink: 0;
  margin-left: 8px;
}

.card-body {
  padding: 16px;
}

.section { 
  margin-top: 16px; 
}
.section:first-of-type { 
  margin-top: 0; 
}

.section-title { 
  font-weight: 600; 
  font-size: 15px; 
  margin-bottom: 10px; 
  color: #323233;
  padding: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebedf0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
}

.section-title:active {
  background-color: #f7f8fa;
}

.section-toggle {
  color: #969799;
  font-size: 16px;
}

.section-content {
  padding-top: 8px;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.kv { 
  display: flex; 
  gap: 8px; 
  margin: 8px 0; 
  color: #555; 
  align-items: flex-start; 
  line-height: 1.6;
}

.kv.highlight {
  background: #f0f9ff;
  padding: 8px;
  border-radius: 4px;
  margin: 12px 0;
}

.kv-label {
  min-width: 80px;
  font-weight: 500;
  color: #646566;
  flex-shrink: 0;
}

.kv-value { 
  white-space: pre-wrap; 
  word-break: break-word; 
  flex: 1; 
  color: #323233;
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
</style>



