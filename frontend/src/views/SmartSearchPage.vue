<template>
  <div class="ss-page">
    <!-- Left history -->
    <aside class="ss-history" :class="{ collapsed: sidebarCollapsed }">
      <!-- Logo and Collapse Button -->
      <div class="ss-history-top">
        <div class="ss-history-logo" :class="{ collapsed: sidebarCollapsed }">
          <img src="/Icons/logo.svg" alt="Logo" class="ss-logo-img" />
          <el-button 
            v-if="sidebarCollapsed"
            text 
            size="small" 
            @click="toggleSidebar"
            :title="$t('smartSearch.expandSidebar')"
            class="ss-logo-collapse-btn"
          >
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
        <el-button 
          v-if="!sidebarCollapsed"
          text 
          size="small" 
          @click="toggleSidebar"
          :title="$t('smartSearch.collapseSidebar')"
          class="ss-history-collapse-btn"
        >
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
      </div>
      
      <div v-if="!sidebarCollapsed" class="ss-history-content-wrapper">
        <div class="ss-history-menu">
        <!-- 新对话 - 第一个一级菜单 -->
        <div class="ss-menu-item" @click="startNewConversation">
          <span class="ss-menu-item-text">{{ $t('smartSearch.newConversation') }}</span>
        </div>
        
        <!-- 历史对话 - 第二个一级菜单，可折叠 -->
        <div class="ss-menu-section">
          <div class="ss-menu-item" @click="toggleHistoryCollapsed">
            <span class="ss-menu-item-text">{{ $t('smartSearch.history') }}</span>
            <el-icon class="ss-menu-arrow" :class="{ collapsed: historyCollapsed }">
              <ArrowDown />
            </el-icon>
          </div>
          
          <!-- 历史对话列表 - 可折叠 -->
          <div v-show="!historyCollapsed" class="ss-history-content">
            <div v-if="conversations.length === 0" class="ss-history-empty">
              {{ $t('smartSearch.emptyHistory') }}
            </div>

            <div v-else class="ss-history-list">
              <div
                v-for="c in conversations"
                :key="c.id"
                class="ss-history-item"
                :class="{ active: c.id === activeConversationId }"
                @click="selectConversation(c.id)"
              >
                <span class="ss-history-item-text" :title="c.title">{{ c.title }}</span>
                <button
                  class="ss-history-item-delete"
                  type="button"
                  :title="$t('smartSearch.deleteConversation')"
                  @click.stop="deleteConversation(c.id)"
                >
                  ×
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部用户名 -->
      <div v-if="!sidebarCollapsed" class="ss-history-footer">
        <div class="ss-history-username">
          {{ currentUser?.username || currentUser?.name || 'User' }}
        </div>
      </div>
    </aside>

    <!-- Main -->
    <main class="ss-main">
      <div ref="messagesEl" class="ss-messages">
        <div v-if="activeMessages.length === 0" class="ss-empty">
          <div class="ss-empty-title">{{ $t('smartSearch.welcomeTitle') }}</div>
          <div class="ss-empty-sub">{{ $t('smartSearch.welcomeText') }}</div>
        </div>

        <div v-else class="ss-thread">
          <div
            v-for="m in activeMessages"
            :key="m.id"
            class="ss-msg"
            :class="{ user: m.role === 'user', assistant: m.role === 'assistant' }"
          >
            <!-- User message: keep in bubble -->
            <template v-if="m.role === 'user'">
              <div class="ss-msg-bubble">
                <div class="ss-msg-text">{{ m.content }}</div>
                <div class="ss-msg-time">{{ formatTime(m.createdAt) }}</div>
              </div>
            </template>

            <!-- Assistant message: search result - display directly on background (ChatGPT style) -->
            <template v-else-if="m.type === 'search_result' && m.payload && m.payload.ok">
              <div class="ss-answer-container">
                <!-- 1) 答案区 -->
                <div class="ss-answer-area">
                  <!-- 识别到的查询要点 -->
                  <div v-if="m.payload.recognized && (m.payload.recognized.fullCodes?.length || m.payload.recognized.typeCodes?.length || m.payload.recognized.symptom?.length || m.payload.recognized.trigger?.length)" class="ss-answer-section">
                    <div class="ss-answer-section-title">识别到的查询要点</div>
                    <div class="ss-answer-section-content">
                      <div class="ss-query-points">
                        <template v-if="m.payload.recognized.fullCodes?.length">
                          <div>故障码：{{ m.payload.recognized.fullCodes.join(' / ') }}</div>
                        </template>
                        <template v-else-if="m.payload.recognized.typeCodes?.length">
                          <div>故障类型：{{ m.payload.recognized.typeCodes.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.symptom?.length">
                          <div>现象：{{ m.payload.recognized.symptom.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.trigger?.length">
                          <div>触发条件：{{ m.payload.recognized.trigger.join(' / ') }}</div>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- 故障码解析 -->
                  <div v-if="m.payload.sources && (m.payload.sources.faultCodes || []).length > 0" class="ss-answer-section">
                    <div class="ss-answer-section-title">故障码解析</div>
                    <div class="ss-answer-section-content">
                      <div
                        v-for="f in (m.payload.sources?.faultCodes || [])"
                        :key="f.ref"
                        class="ss-fault-item"
                      >
                          <div class="ss-fault-code-line">
                            <span class="ss-fault-code">{{ f.subsystem ? `${f.subsystem} - ` : '' }}{{ f.code }}</span>
                            <span v-if="f.short_message" class="ss-fault-message">：{{ f.short_message }}</span>
                            <span class="ss-fault-ref">[{{ f.ref }}]</span>
                          </div>
                          
                          <!-- 解释 -->
                          <div v-if="f.user_hint || f.operation" class="ss-fault-field">
                            <span class="ss-fault-field-label">解释：</span>
                            <span class="ss-fault-field-value">{{ [f.user_hint, f.operation].filter(Boolean).join(' ') || '-' }}</span>
                          </div>
                          
                          <!-- 参数含义 -->
                          <div v-if="f.param1 || f.param2 || f.param3 || f.param4" class="ss-fault-field">
                            <span class="ss-fault-field-label">参数含义：</span>
                            <div class="ss-fault-params">
                              <span v-if="f.param1" class="ss-fault-param">参数1：{{ f.param1 }}</span>
                              <span v-if="f.param2" class="ss-fault-param">参数2：{{ f.param2 }}</span>
                              <span v-if="f.param3" class="ss-fault-param">参数3：{{ f.param3 }}</span>
                              <span v-if="f.param4" class="ss-fault-param">参数4：{{ f.param4 }}</span>
                            </div>
                          </div>
                          
                          <!-- 详细信息 -->
                          <div v-if="f.detail" class="ss-fault-field">
                            <span class="ss-fault-field-label">详细信息：</span>
                            <span class="ss-fault-field-value">{{ f.detail }}</span>
                          </div>
                          
                          <!-- 检查方法 -->
                          <div v-if="f.method" class="ss-fault-field">
                            <span class="ss-fault-field-label">检查方法：</span>
                            <span class="ss-fault-field-value">{{ f.method }}</span>
                          </div>
                          
                          <!-- 分类 -->
                          <div v-if="f.category" class="ss-fault-field">
                            <span class="ss-fault-field-label">分类：</span>
                            <span class="ss-fault-field-value">{{ f.category }}</span>
                          </div>
                          
                          <!-- 技术排查方案 -->
                          <div class="ss-fault-field">
                            <span class="ss-fault-field-label">技术排查方案：</span>
                            <div class="ss-fault-tech-solution">
                              <div v-if="f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution" class="ss-fault-tech-solution-text">
                                {{ f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution }}
                              </div>
                              
                              <!-- 加载按钮 -->
                              <div v-if="f.id && !f.tech_solution && !faultTechSolutions.get(f.id)" class="ss-fault-tech-load">
                                <el-button
                                  size="small"
                                  text
                                  :loading="faultTechSolutions.get(f.id)?.loading"
                                  @click="loadTechSolution(f.id)"
                                >
                                  加载技术排查方案
                                </el-button>
                              </div>
                              
                              <!-- 附件 -->
                              <div v-if="faultTechSolutions.get(f.id)?.loading" class="ss-fault-attachments">
                                <div class="ss-fault-attachments-title">附件：</div>
                                <div class="ss-fault-field-value">加载中...</div>
                              </div>
                              <div v-else-if="(faultTechSolutions.get(f.id)?.images || []).length > 0" class="ss-fault-attachments">
                                <div class="ss-fault-attachments-title">附件：</div>
                                <div class="ss-fault-attachments-list">
                                  <!-- 图片：可预览 -->
                                  <div
                                    v-for="img in (faultTechSolutions.get(f.id)?.images || []).filter(img => isImageFile(img))"
                                    :key="img.uid || img.url"
                                    class="ss-fault-attachment-image"
                                  >
                                    <el-image
                                      :src="img.url"
                                      :preview-src-list="getImagePreviewList(faultTechSolutions.get(f.id).images)"
                                      fit="cover"
                                      class="ss-attachment-image"
                                      :initial-index="getImageIndex(faultTechSolutions.get(f.id).images, img)"
                                    />
                                    <div class="ss-attachment-image-name">{{ img.original_name || img.filename || '图片' }}</div>
                                  </div>
                                  <!-- PDF/其他文件：显示文件名，可点击下载 -->
                                  <a
                                    v-for="img in (faultTechSolutions.get(f.id)?.images || []).filter(img => !isImageFile(img))"
                                    :key="img.uid || img.url"
                                    class="ss-fault-attachment-file"
                                    :href="img.url"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    @click.stop
                                  >
                                    <span>{{ img.original_name || img.filename || '文件' }}</span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                    </div>
                  </div>

                  <!-- 相似历史案例 -->
                  <div v-if="m.payload.meta?.jiraError" class="ss-answer-section">
                    <div class="ss-answer-section-title">相似历史案例（来自 Jira）</div>
                    <div class="ss-answer-section-content">
                      <div class="ss-jira-error">
                        <el-alert
                          :title="m.payload.meta.jiraError.timeout ? 'Jira 连接超时' : 'Jira 连接失败'"
                          :description="m.payload.meta.jiraError.message || '无法连接到 Jira，历史案例检索已跳过'"
                          type="warning"
                          :closable="false"
                          show-icon
                        />
                      </div>
                    </div>
                  </div>
                  <div v-else-if="m.payload.sources && (m.payload.sources.jira || []).length > 0" class="ss-answer-section">
                    <div class="ss-answer-section-title">相似历史案例（来自 Jira）</div>
                    <div class="ss-answer-section-content">
                      <div
                        v-for="j in (m.payload.sources?.jira || [])"
                        :key="j.ref"
                        class="ss-case-line"
                      >
                        <a
                          v-if="j.url"
                          :href="j.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="ss-case-link"
                        >
                          <span class="ss-case-key">{{ j.key }}</span>
                          <span v-if="j.summary" class="ss-case-summary">：{{ j.summary }}</span>
                          <span class="ss-case-ref">[{{ j.ref }}]</span>
                        </a>
                        <template v-else>
                          <span class="ss-case-key">{{ j.key }}</span>
                          <span v-if="j.summary" class="ss-case-summary">：{{ j.summary }}</span>
                          <span class="ss-case-ref">[{{ j.ref }}]</span>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- 引导按钮 -->
                  <div v-if="m.payload.suggestedRoutes && m.payload.suggestedRoutes.length" class="ss-answer-actions">
                    <el-button size="small" @click="goErrorCodes">故障码搜索</el-button>
                    <el-button size="small" @click="goFaultCases">故障案例搜索</el-button>
                  </div>
                </div>

                <!-- 2) 查看检索详情 -->
                <details v-if="m.payload.meta?.llmAvailable !== false && m.payload.debug" class="ss-result-debug">
                  <summary class="ss-result-debug-summary">查看检索详情</summary>
                  <div class="ss-result-debug-body">
                    <div v-if="m.payload.debug.llmPrompt" class="ss-debug-block">
                      <div class="ss-debug-title">LLM Prompt（messages）</div>
                      <pre class="ss-debug-pre">{{ JSON.stringify(m.payload.debug.llmPrompt, null, 2) }}</pre>
                    </div>
                    <div v-if="m.payload.debug.llmRaw" class="ss-debug-block">
                      <div class="ss-debug-title">LLM Raw（request/response）</div>
                      <pre class="ss-debug-pre">{{ formatLlmRaw(m.payload.debug.llmRaw) }}</pre>
                    </div>
                    <div v-if="m.payload.debug.queryPlan" class="ss-debug-block">
                      <div class="ss-debug-title">解析结果（QueryPlan + Planner）</div>
                      <pre class="ss-debug-pre">{{ JSON.stringify(m.payload.debug.queryPlan, null, 2) }}</pre>
                    </div>
                    <div class="ss-debug-block">
                      <div class="ss-debug-title">故障码检索参数</div>
                      <pre class="ss-debug-pre">{{ JSON.stringify(m.payload.debug.errorCodes, null, 2) }}</pre>
                    </div>
                    <div class="ss-debug-block">
                      <div class="ss-debug-title">Jira 检索式</div>
                      <div class="ss-debug-row"><span class="ss-debug-k">jql：</span>{{ m.payload.debug.jira?.jql || '--' }}</div>
                    </div>
                  </div>
                </details>
              </div>
            </template>

            <!-- Assistant message: other content - keep in bubble -->
            <template v-else>
              <div class="ss-msg-bubble">
                <div class="ss-msg-text">{{ m.content }}</div>
                <div class="ss-msg-time">{{ formatTime(m.createdAt) }}</div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="ss-composer-wrap" :class="{ centered: activeMessages.length === 0 }">
        <div class="ss-composer">
          <el-input
            v-model="draft"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 8 }"
            :placeholder="$t('smartSearch.placeholder')"
            class="ss-input"
            :maxlength="MAX_INPUT_CHARS"
            show-word-limit
            @keydown.enter.exact.prevent="send"
            @keydown.shift.enter.exact="noop"
          />

          <button
            type="button"
            class="ss-send-btn"
            :class="{ disabled: !canSend }"
            :disabled="!canSend"
            @click="send"
            :title="$t('smartSearch.send')"
          >
            {{ $t('smartSearch.send') }}
          </button>
        </div>

        <div class="ss-actions">
          <el-button text @click="goClassicPanel">
            {{ $t('smartSearch.classicPanel') }}
          </el-button>
        </div>
      </div>

      <el-drawer
        v-model="sourceDrawerVisible"
        :title="sourceDrawerTitle"
        size="520px"
        direction="rtl"
      >
        <div v-if="sourceDrawerType === 'fault'" class="ss-drawer">
          <div class="ss-drawer-block">
            <div class="ss-drawer-k">故障码</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem?.subsystem ? `${sourceDrawerItem.subsystem} - ` : '' }}{{ sourceDrawerItem?.code }}</div>
          </div>
          <div v-if="sourceDrawerItem?.short_message" class="ss-drawer-block">
            <div class="ss-drawer-k">摘要</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem.short_message }}</div>
          </div>
          <div v-if="sourceDrawerItem?.explanation" class="ss-drawer-block">
            <div class="ss-drawer-k">解释</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem.explanation }}</div>
          </div>
          <div v-if="sourceDrawerItem?.operation" class="ss-drawer-block">
            <div class="ss-drawer-k">操作</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem.operation }}</div>
          </div>
          <div v-if="sourceDrawerItem?.detail" class="ss-drawer-block">
            <div class="ss-drawer-k">详情</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem.detail }}</div>
          </div>

          <div class="ss-drawer-block">
            <div class="ss-drawer-k">技术排查方案</div>
            <div v-if="sourceDrawerLoading" class="ss-drawer-v">加载中...</div>
            <template v-else>
              <div v-if="sourceDrawerTech?.tech_solution" class="ss-drawer-v ss-drawer-pre">{{ sourceDrawerTech.tech_solution }}</div>
              <div v-else class="ss-drawer-v">-</div>

              <div v-if="(sourceDrawerTech?.images || []).length" class="ss-drawer-attachments">
                <div class="ss-drawer-k">附件</div>
                <div class="ss-drawer-attach-list">
                  <a
                    v-for="img in sourceDrawerTech.images"
                    :key="img.uid || img.url"
                    class="ss-drawer-attach"
                    :href="img.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ img.original_name || img.filename || img.url }}
                  </a>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div v-else-if="sourceDrawerType === 'jira'" class="ss-drawer">
          <div class="ss-drawer-block">
            <div class="ss-drawer-k">Key</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem?.key }}</div>
          </div>
          <div v-if="sourceDrawerItem?.summary" class="ss-drawer-block">
            <div class="ss-drawer-k">摘要</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem.summary }}</div>
          </div>
          <div v-if="sourceDrawerItem?.module" class="ss-drawer-block">
            <div class="ss-drawer-k">模块</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem.module }}</div>
          </div>
          <div v-if="sourceDrawerItem?.status" class="ss-drawer-block">
            <div class="ss-drawer-k">状态</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem.status }}</div>
          </div>
          <div v-if="sourceDrawerItem?.updated" class="ss-drawer-block">
            <div class="ss-drawer-k">更新时间</div>
            <div class="ss-drawer-v">{{ sourceDrawerItem.updated }}</div>
          </div>
          <div v-if="sourceDrawerItem?.url" class="ss-drawer-block">
            <el-button size="small" type="primary" @click="() => window.open(sourceDrawerItem.url, '_blank')">
              跳转 Jira
            </el-button>
          </div>
        </div>
      </el-drawer>

    </main>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ArrowRight, ArrowDown } from '@element-plus/icons-vue'
import api from '@/api'

const MAX_CONVERSATIONS = 5
const MAX_QUESTIONS_PER_CONVERSATION = 5
const MAX_INPUT_CHARS = 150

function nowIso () {
  return new Date().toISOString()
}

function shortId () {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function normalizeTitle (text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ')
  // 只取前10个字
  return t.length > 10 ? `${t.slice(0, 10)}` : (t || '新对话')
}

export default {
  name: 'SmartSearchPage',
  setup () {
    const store = useStore()
    const router = useRouter()
    const { t } = useI18n()

    const currentUser = computed(() => store.getters['auth/currentUser'])
    const userKey = computed(() => {
      const u = currentUser.value || {}
      return u.id || u.user_id || u.username || 'anonymous'
    })
    const storageKey = computed(() => `smartSearchHistory:${userKey.value}`)

    const conversations = ref([])
    const activeConversationId = ref(null)
    const draft = ref('')
    const messagesEl = ref(null)
    const sidebarCollapsed = ref(false)
    const historyCollapsed = ref(false)
    const sending = ref(false)

    const sourceDrawerVisible = ref(false)
    const sourceDrawerType = ref('') // 'fault' | 'jira'
    const sourceDrawerItem = ref(null)
    const sourceDrawerLoading = ref(false)
    const sourceDrawerTech = ref(null)
    const faultTechSolutions = ref(new Map()) // Map<faultId, { tech_solution, images, loading }>

    const sourceDrawerTitle = computed(() => {
      const it = sourceDrawerItem.value || {}
      if (sourceDrawerType.value === 'fault') {
        return `${it.ref || ''} ${it.subsystem ? `${it.subsystem} - ` : ''}${it.code || ''}`.trim() || '故障码详情'
      }
      if (sourceDrawerType.value === 'jira') {
        return `${it.ref || ''} ${it.key || ''}`.trim() || 'Jira 详情'
      }
      return '详情'
    })

    const load = () => {
      try {
        const raw = localStorage.getItem(storageKey.value)
        const parsed = raw ? JSON.parse(raw) : []
        conversations.value = Array.isArray(parsed) ? parsed : []
        // 确保每个对话都有标题（从第一个用户消息提取前10个字）
        conversations.value.forEach(conv => {
          if (!conv.title || conv.title === '新对话') {
            const firstUserMsg = (conv.messages || []).find(m => m && m.role === 'user')
            if (firstUserMsg && firstUserMsg.content) {
              conv.title = normalizeTitle(firstUserMsg.content)
            }
          }
        })
        persist() // 保存更新后的标题
      } catch {
        conversations.value = []
      }
      // 默认打开最近一个
      if (conversations.value.length > 0) {
        activeConversationId.value = conversations.value[0].id
      } else {
        activeConversationId.value = null
      }
    }

    const persist = () => {
      localStorage.setItem(storageKey.value, JSON.stringify(conversations.value))
    }

    const activeConversation = computed(() => {
      if (!activeConversationId.value) return null
      return conversations.value.find(c => c.id === activeConversationId.value) || null
    })

    const activeMessages = computed(() => {
      return Array.isArray(activeConversation.value?.messages) ? activeConversation.value.messages : []
    })

    const questionCount = computed(() => {
      return activeMessages.value.filter(m => m && m.role === 'user').length
    })

    const canSend = computed(() => !sending.value && draft.value.trim().length > 0)

    const scrollToBottom = async () => {
      await nextTick()
      if (messagesEl.value) {
        messagesEl.value.scrollTop = messagesEl.value.scrollHeight
      }
    }

    watch(() => activeMessages.value.length, () => {
      scrollToBottom()
    })

    const upsertConversation = (conv) => {
      const idx = conversations.value.findIndex(c => c.id === conv.id)
      if (idx >= 0) conversations.value.splice(idx, 1)
      // 最新放顶部
      conversations.value.unshift(conv)
      // 限制最多 5 个
      if (conversations.value.length > MAX_CONVERSATIONS) {
        conversations.value = conversations.value.slice(0, MAX_CONVERSATIONS)
      }
      persist()
    }

    const ensureActiveConversation = () => {
      if (activeConversation.value) return activeConversation.value
      const conv = {
        id: shortId(),
        title: '新对话',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        messages: []
      }
      activeConversationId.value = conv.id
      upsertConversation(conv)
      return conv
    }

    const send = async () => {
      const text = draft.value.trim()
      if (!text) return
      if (text.length > MAX_INPUT_CHARS) {
        ElMessage.warning(t('smartSearch.maxInputChars', { max: MAX_INPUT_CHARS }))
        return
      }

      // 每个对话最多 5 个问题（只计 user 消息）
      if (activeConversation.value && questionCount.value >= MAX_QUESTIONS_PER_CONVERSATION) {
        ElMessage.warning(t('smartSearch.maxQuestionsReached', { max: MAX_QUESTIONS_PER_CONVERSATION }))
        return
      }

      const conv = ensureActiveConversation()
      const userMsg = { id: shortId(), role: 'user', content: text, createdAt: nowIso() }
      conv.messages = [...(conv.messages || []), userMsg]
      // 首问生成标题
      if (!conv.title || conv.title === '新对话') conv.title = normalizeTitle(text)
      conv.updatedAt = nowIso()
      upsertConversation({ ...conv })

      draft.value = ''

      sending.value = true
      try {
        const resp = await api.smartSearch.search({
          query: text,
          limits: { errorCodes: 10, jira: 10 },
          debug: true,
        })
        const payload = resp?.data || null
        const assistantMsg = {
          id: shortId(),
          role: 'assistant',
          type: 'search_result',
          content: '',
          payload,
          createdAt: nowIso()
        }
      const conv2 = conversations.value.find(c => c.id === conv.id)
      if (conv2) {
        conv2.messages = [...(conv2.messages || []), assistantMsg]
        conv2.updatedAt = nowIso()
        upsertConversation({ ...conv2 })
        }
      } catch (e) {
        const assistantMsg = { id: shortId(), role: 'assistant', content: t('shared.requestFailed'), createdAt: nowIso() }
        const conv2 = conversations.value.find(c => c.id === conv.id)
        if (conv2) {
          conv2.messages = [...(conv2.messages || []), assistantMsg]
          conv2.updatedAt = nowIso()
          upsertConversation({ ...conv2 })
        }
      } finally {
        sending.value = false
      }
    }

    const loadTechSolution = async (faultId) => {
      if (!faultId || faultTechSolutions.value.has(faultId)) return
      faultTechSolutions.value.set(faultId, { loading: true, tech_solution: null, images: [] })
      try {
        const resp = await api.errorCodes.getTechSolution(faultId)
        const data = resp?.data || null
        faultTechSolutions.value.set(faultId, {
          loading: false,
          tech_solution: data?.tech_solution || null,
          images: data?.images || []
        })
      } catch (_) {
        faultTechSolutions.value.set(faultId, { loading: false, tech_solution: null, images: [] })
      }
    }

    // Auto-fetch tech-solution + attachments for fault codes in the latest search result
    const prefetchedFaultTechIds = new Set()
    watch(() => activeMessages.value.length, () => {
      const last = activeMessages.value[activeMessages.value.length - 1]
      if (!last || last.type !== 'search_result' || !last.payload || !last.payload.ok) return
      const faults = last.payload?.sources?.faultCodes || []
      for (const f of faults) {
        const id = f?.id
        if (!id) continue
        if (prefetchedFaultTechIds.has(id)) continue
        prefetchedFaultTechIds.add(id)
        // fire and forget
        loadTechSolution(id)
      }
    })

    const isImageFile = (file) => {
      const name = (file.original_name || file.filename || file.url || '').toLowerCase()
      return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.gif') || name.endsWith('.webp') || name.endsWith('.bmp')
    }

    const getImagePreviewList = (images) => {
      if (!Array.isArray(images)) return []
      return images.filter(img => isImageFile(img)).map(img => img.url)
    }

    const getImageIndex = (images, currentImg) => {
      if (!Array.isArray(images)) return 0
      const imageList = images.filter(img => isImageFile(img))
      return imageList.findIndex(img => (img.uid || img.url) === (currentImg.uid || currentImg.url))
    }

    const openSource = async (type, item) => {
      sourceDrawerType.value = type
      sourceDrawerItem.value = item
      sourceDrawerVisible.value = true
      sourceDrawerTech.value = null

      if (type !== 'fault') return
      const id = item?.id
      if (!id) return
      sourceDrawerLoading.value = true
      try {
        const resp = await api.errorCodes.getTechSolution(id)
        sourceDrawerTech.value = resp?.data || null
      } catch (_) {
        sourceDrawerTech.value = null
      } finally {
        sourceDrawerLoading.value = false
      }
    }

    const startNewConversation = () => {
      activeConversationId.value = null
      draft.value = ''
    }

    const selectConversation = (id) => {
      activeConversationId.value = id
      draft.value = ''
    }

    const deleteConversation = (id) => {
      const nextList = conversations.value.filter(c => c.id !== id)
      conversations.value = nextList
      persist()
      if (activeConversationId.value === id) {
        activeConversationId.value = nextList[0]?.id || null
      }
    }

    const goClassicPanel = () => {
      router.push('/dashboard/logs')
    }

    const goErrorCodes = () => {
      router.push('/dashboard/error-codes')
    }

    const goFaultCases = () => {
      router.push('/dashboard/fault-cases')
    }

    const formatLlmRaw = (raw) => {
      if (!raw || typeof raw !== 'object') return JSON.stringify(raw, null, 2)
      const formatted = { ...raw }
      // If content is a JSON string, parse and format it
      if (typeof formatted.content === 'string' && formatted.content.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(formatted.content)
          formatted.content = parsed
        } catch (e) {
          // If parsing fails, keep original string
        }
      }
      return JSON.stringify(formatted, null, 2)
    }

    const formatTime = (iso) => {
      try {
        return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      } catch {
        return ''
      }
    }

    const formatShortTime = (iso) => {
      try {
        const d = new Date(iso)
        return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
      } catch {
        return ''
      }
    }

    const noop = () => {}

    const toggleSidebar = () => {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }

    const toggleHistoryCollapsed = () => {
      historyCollapsed.value = !historyCollapsed.value
    }

    onMounted(() => {
      load()
      scrollToBottom()
    })

    return {
      conversations,
      activeConversationId,
      activeMessages,
      questionCount,
      draft,
      canSend,
      sending,
      messagesEl,
      MAX_INPUT_CHARS,
      currentUser,
      sidebarCollapsed,
      historyCollapsed,
      sourceDrawerVisible,
      sourceDrawerType,
      sourceDrawerItem,
      sourceDrawerLoading,
      sourceDrawerTech,
      sourceDrawerTitle,
      faultTechSolutions,
      loadTechSolution,
      isImageFile,
      getImagePreviewList,
      getImageIndex,
      ArrowLeft,
      ArrowRight,
      ArrowDown,
      send,
      openSource,
      startNewConversation,
      selectConversation,
      deleteConversation,
      goClassicPanel,
      goErrorCodes,
      goFaultCases,
      formatTime,
      formatShortTime,
      formatLlmRaw,
      toggleSidebar,
      toggleHistoryCollapsed,
      noop
    }
  }
}
</script>

<style scoped>
.ss-page {
  height: 100vh;
  display: flex;
  background: #f7f7f8;
}

.ss-history {
  width: 280px;
  border-right: 1px solid #e5e7eb;
  background: #f5f5f5;
  color: #374151;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
}

.ss-history.collapsed {
  width: 60px;
}

.ss-history-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.ss-history-logo {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  position: relative;
}

.ss-history-logo.collapsed {
  justify-content: center;
  width: 100%;
  cursor: pointer;
}

.ss-logo-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  transition: opacity 0.2s;
}

.ss-logo-collapse-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.ss-history-logo.collapsed:hover .ss-logo-img {
  opacity: 0;
}

.ss-history-logo.collapsed:hover .ss-logo-collapse-btn {
  opacity: 1;
  pointer-events: auto;
}

.ss-history-collapse-btn {
  flex-shrink: 0;
}

.ss-history-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.ss-history-menu {
  padding: 8px 0;
  border-bottom: 1px solid #e5e7eb;
  overflow-y: auto;
  flex: 1;
}

.ss-menu-section {
  border-top: 1px solid #e5e7eb;
}

.ss-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.15s;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.ss-menu-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.ss-menu-item-text {
  flex: 1;
}

.ss-menu-arrow {
  width: 16px;
  height: 16px;
  transition: transform 0.2s;
  color: #6b7280;
}

.ss-menu-arrow.collapsed {
  transform: rotate(-90deg);
}

.ss-history-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 400px;
  overflow-y: auto;
}

.ss-history-empty {
  padding: 12px 16px 12px 32px;
  font-size: 12px;
  color: #6b7280;
}

.ss-history-list {
  padding: 4px 0;
  display: flex;
  flex-direction: column;
}

.ss-history-item {
  position: relative;
  padding: 8px 16px 8px 32px;
  cursor: pointer;
  transition: background-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ss-history-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.ss-history-item.active {
  background-color: rgba(99, 102, 241, 0.1);
}

.ss-history-item.active .ss-history-item-text {
  color: #6366f1;
  font-weight: 500;
}

.ss-history-item-text {
  font-size: 14px;
  color: #374151;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex: 1;
  line-height: 1.5;
}

.ss-history-item-delete {
  display: none;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  margin-left: 8px;
  flex-shrink: 0;
  transition: color 0.15s;
  align-items: center;
  justify-content: center;
}

.ss-history-item:hover .ss-history-item-delete {
  display: flex;
}

.ss-history-item-delete:hover {
  color: #ef4444;
}

.ss-history-footer {
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
  margin-top: auto;
}

.ss-history-username {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ss-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 8px;
}

.ss-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
  gap: 10px;
}

.ss-empty-title {
  font-size: 26px;
  font-weight: 700;
  color: #111827;
}

.ss-empty-sub {
  max-width: 720px;
  font-size: 14px;
  color: #6b7280;
}

.ss-thread {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ss-msg {
  display: flex;
}
.ss-msg.user {
  justify-content: flex-end;
}
.ss-msg.assistant {
  justify-content: flex-start;
}
.ss-msg.assistant .ss-msg-bubble {
  max-width: 80%;
}

.ss-msg-bubble {
  max-width: 80%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #fff;
}
.ss-msg.user .ss-msg-bubble {
  background: #111827;
  border-color: #111827;
  color: #fff;
}

.ss-msg-text {
  white-space: pre-wrap;
  line-height: 1.7;
  font-size: 14px;
}

.ss-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ss-answer {
  padding: 14px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #ffffff;
  color: #111827;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.ss-answer-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ss-sources {
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #ffffff;
}

.ss-sources-summary {
  cursor: pointer;
  font-size: 13px;
  color: #111827;
  font-weight: 600;
}

.ss-sources-body {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ss-sources-title {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.ss-sources-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ss-source-item {
  width: 100%;
  text-align: left;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  display: block;
}

.ss-source-item:hover {
  background: #f3f4f6;
  text-decoration: none;
  color: inherit;
}

.ss-source-ref {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  color: #111827;
  margin-right: 8px;
}

.ss-source-text {
  font-size: 13px;
  color: #111827;
}

.ss-drawer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ss-drawer-block {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 12px;
  background: #ffffff;
}

.ss-drawer-k {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.ss-drawer-v {
  font-size: 13px;
  color: #111827;
  white-space: pre-wrap;
  line-height: 1.7;
}

.ss-drawer-pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  background: #f9fafb;
  border-radius: 10px;
  padding: 10px;
  border: 1px solid #e5e7eb;
}

.ss-drawer-attach-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.ss-drawer-attach {
  font-size: 12px;
  color: #2563eb;
  text-decoration: none;
  word-break: break-all;
}

.ss-drawer-attach:hover {
  text-decoration: underline;
}

.ss-result-summary {
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #ffffff;
}

.ss-result-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8px;
}

.ss-result-line {
  font-size: 13px;
  color: #374151;
  margin-top: 4px;
}

.ss-result-notes {
  margin-top: 8px;
}

.ss-result-note {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.ss-result-section-title {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  margin: 6px 0 8px;
}

.ss-result-debug {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #ffffff;
  padding: 10px 12px;
}

.ss-result-debug-summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.ss-result-debug-body {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ss-debug-block {
  border-top: 1px dashed #e5e7eb;
  padding-top: 10px;
}

.ss-debug-title {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 6px;
}

.ss-debug-row {
  font-size: 12px;
  color: #374151;
  margin-top: 4px;
}

.ss-debug-k {
  color: #6b7280;
}

.ss-debug-pre {
  margin: 8px 0 0;
  padding: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  max-height: 280px;
}

.ss-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ss-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #ffffff;
  color: inherit;
  text-decoration: none;
}

.ss-card-link:hover {
  border-color: #c7d2fe;
  box-shadow: 0 10px 24px rgba(0,0,0,0.06);
}

.ss-card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.ss-card-code {
  font-weight: 800;
  color: #111827;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-card-meta {
  font-size: 12px;
  color: #6b7280;
  flex-shrink: 0;
}

.ss-card-title {
  margin-top: 6px;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}

.ss-card-row {
  margin-top: 6px;
  font-size: 12px;
  color: #374151;
}

.ss-card-k {
  color: #6b7280;
}

@media (max-width: 900px) {
  .ss-cards {
    grid-template-columns: 1fr;
  }
}

.ss-msg-time {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.6;
}

.ss-composer-wrap {
  padding: 14px 16px 18px;
  border-top: 1px solid #e5e7eb;
  background: linear-gradient(180deg, rgba(247,247,248,0) 0%, #f7f7f8 40%, #f7f7f8 100%);
}

.ss-composer-wrap.centered {
  position: sticky;
  bottom: 0;
}

.ss-composer {
  position: relative;
  max-width: 900px;
  margin: 0 auto;
  border-radius: 18px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  box-shadow: 0 1px 0 rgba(0,0,0,0.02);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.ss-composer:focus-within {
  border-color: #c7d2fe;
  box-shadow: 0 10px 28px rgba(0,0,0,0.08);
}

.ss-input :deep(.el-textarea__inner) {
  padding: 16px 92px 16px 16px; /* 给发送按钮留空间 */
  border-radius: 18px;
  border: none;
  resize: none;
  font-size: 16px;
  line-height: 1.7;
}

.ss-input :deep(.el-input__count) {
  padding-right: 92px;
}

.ss-send-btn {
  position: absolute;
  right: 12px;
  bottom: 12px;
  height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  border: none;
  background: #111827;
  color: #ffffff;
  cursor: pointer;
  font-size: 14px;
  transition: transform 0.12s ease, opacity 0.12s ease, background 0.12s ease;
}

.ss-send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  opacity: 0.92;
}

.ss-send-btn:disabled,
.ss-send-btn.disabled {
  background: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
  transform: none;
  opacity: 1;
}

.ss-actions {
  max-width: 900px;
  margin: 8px auto 0;
  display: flex;
  justify-content: center;
}

/* Answer container: ChatGPT style - display directly on background */
.ss-answer-container {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ss-answer-area {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 0;
}

.ss-answer-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ss-answer-section-title {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

.ss-answer-section-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

.ss-query-points {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

/* Fault code explanation - pure text */
.ss-fault-item {
  margin-bottom: 16px;
}

.ss-fault-code-line {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.7;
}

.ss-fault-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.ss-fault-message {
  font-size: 14px;
  color: #374151;
}

.ss-fault-ref {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  color: #6b7280;
  margin-left: 8px;
}

.ss-fault-field {
  margin-top: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

.ss-fault-field-label {
  font-weight: 500;
  color: #111827;
  margin-right: 4px;
}

.ss-fault-field-value {
  color: #374151;
}

.ss-fault-params {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 4px;
}

.ss-fault-param {
  font-size: 13px;
  color: #374151;
}

.ss-fault-more-info {
  margin-top: 4px;
}

.ss-fault-more-item {
  font-size: 13px;
  color: #374151;
  margin-top: 4px;
  line-height: 1.6;
}

/* Technical solution in fault code explanation */
.ss-fault-tech-solution {
  margin-top: 4px;
}

.ss-fault-tech-solution-text {
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
  white-space: pre-wrap;
  margin-top: 4px;
}

.ss-fault-tech-load {
  margin-top: 8px;
}

.ss-fault-attachments {
  margin-top: 12px;
}

.ss-fault-attachments-title {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}

.ss-fault-attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
}

.ss-fault-attachment-image {
  display: inline-block;
  margin-right: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.ss-fault-attachment-image:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.ss-fault-attachment-file {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  text-decoration: none;
  transition: all 0.2s;
}

.ss-fault-attachment-file:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #111827;
}

.ss-fault-attachment-file::before {
  content: '📎';
  margin-right: 6px;
  font-size: 14px;
}

/* Troubleshooting steps - pure text */
.ss-troubleshoot-item {
  margin-bottom: 16px;
}

.ss-troubleshoot-header-line {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.7;
}

.ss-troubleshoot-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.ss-troubleshoot-message {
  font-size: 14px;
  color: #374151;
}

.ss-troubleshoot-ref {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  color: #6b7280;
  margin-left: 8px;
}

.ss-troubleshoot-solution-text {
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
  white-space: pre-wrap;
  margin-top: 8px;
  margin-bottom: 8px;
}

.ss-troubleshoot-load {
  margin-top: 8px;
  margin-bottom: 8px;
}

/* Historical cases - pure text */
.ss-jira-error {
  margin-top: 8px;
}

.ss-case-line {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

.ss-case-link {
  text-decoration: none;
  color: inherit;
  display: inline;
}

.ss-case-link:hover {
  text-decoration: underline;
  color: #2563eb;
}

.ss-case-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.ss-case-link:hover .ss-case-key {
  color: #2563eb;
}

.ss-case-summary {
  font-size: 14px;
  color: #374151;
}

.ss-case-ref {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  color: #6b7280;
  margin-left: 8px;
}

/* Missing notes */
.ss-miss-note {
  font-size: 13px;
  color: #6b7280;
  padding: 6px 0;
}

/* Answer actions */
.ss-answer-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

/* Troubleshooting attachments */
.ss-troubleshoot-attachments {
  margin-top: 12px;
}

.ss-troubleshoot-attachments-title {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}

.ss-troubleshoot-attachments-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ss-troubleshoot-attachment {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  text-decoration: none;
  transition: all 0.2s;
}

.ss-troubleshoot-attachment:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
  color: #111827;
}

.ss-troubleshoot-attachment::before {
  content: '📎';
  margin-right: 6px;
  font-size: 14px;
}

/* Image attachment preview */
.ss-troubleshoot-attachment-image {
  display: inline-block;
  margin-right: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.ss-troubleshoot-attachment-image:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.ss-attachment-image {
  width: 120px;
  height: 120px;
  display: block;
}

.ss-attachment-image-name {
  padding: 6px 8px;
  font-size: 12px;
  color: #6b7280;
  background: #f9fafb;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>



