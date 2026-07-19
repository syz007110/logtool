<template>
  <div class="ss-page">
    <!-- Left history -->
    <el-aside
      :width="sidebarCollapsed ? '80px' : '280px'"
      class="ss-history"
      :class="{ 'is-collapsed': sidebarCollapsed }"
    >
      <!-- Logo area matching Dashboard.vue -->
      <div class="logo" :class="{ 'is-collapsed': sidebarCollapsed }">
        <template v-if="!sidebarCollapsed">
          <img src="/Icons/logo-text.svg" alt="LogTool" class="logo-text" />
        </template>
        <template v-else>
          <img src="/Icons/logo.svg" alt="LogTool" class="logo-icon-svg" />
        </template>
        <!-- Collapse button - visible when expanded, or on hover when collapsed -->
          <el-button 
          v-if="!sidebarCollapsed"
            text 
            size="small" 
            @click="toggleSidebar"
          class="ss-collapse-btn"
          >
          <el-icon><ArrowLeft /></el-icon>
          </el-button>
        <el-button 
          v-else
          text 
          size="small" 
          @click="toggleSidebar"
          class="ss-collapse-btn ss-collapse-btn-hover"
        >
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
      
      <!-- New Conversation Button - Standalone -->
      <div class="ss-new-conv-container" :class="{ 'is-collapsed': sidebarCollapsed }">
        <el-button 
          type="primary" 
          class="ss-new-conv-btn" 
          @click="startNewConversation"
        >
          <el-icon><Plus /></el-icon>
          <span v-if="!sidebarCollapsed">{{ $t('smartSearch.newConversation') }}</span>
        </el-button>
        </div>
        
      <!-- History Menu Container -->
      <div class="ss-history-content-wrapper">
        <div class="ss-history-menu">
          <!-- 历史对话 - 可折叠 -->
        <div class="ss-menu-section">
          <div class="ss-menu-item" @click="toggleHistoryCollapsed">
              <el-icon><History /></el-icon>
              <span v-if="!sidebarCollapsed" class="ss-menu-item-text">{{ $t('smartSearch.history') }}</span>
              <el-icon v-if="!sidebarCollapsed" class="ss-menu-arrow" :class="{ collapsed: historyCollapsed }">
              <ArrowDown />
            </el-icon>
          </div>
          
            <!-- 历史对话列表 - 按时间分组 -->
            <div v-show="!historyCollapsed && !sidebarCollapsed" class="ss-history-content">
            <div v-if="conversations.length === 0" class="ss-history-empty">
              {{ $t('smartSearch.emptyHistory') }}
            </div>

            <div v-else class="ss-history-list">
                <!-- Today -->
                <div v-if="groupedConversations.today.length > 0" class="ss-history-group">
                  <div class="ss-history-group-header">
                    <el-icon class="ss-history-group-arrow"><ArrowDown /></el-icon>
                    <span class="ss-history-group-title">{{ $t('smartSearch.today') }}</span>
                  </div>
                  <div class="ss-history-group-items">
                    <div
                      v-for="c in groupedConversations.today"
                :key="c.id"
                class="ss-history-item"
                :class="{ active: c.id === activeConversationId }"
                @click="selectConversation(c.id)"
              >
                <span class="ss-history-item-text" :title="c.title">{{ c.title }}</span>
                <button
                  class="ss-history-item-delete"
                  type="button"
                  :title="$t('shared.delete')"
                  @click.stop="deleteConversation(c.id)"
                >
                  ×
                </button>
                </div>
              </div>
            </div>

                <!-- Yesterday -->
                <div v-if="groupedConversations.yesterday.length > 0" class="ss-history-group">
                  <div class="ss-history-group-header">
                    <el-icon class="ss-history-group-arrow"><ArrowDown /></el-icon>
                    <span class="ss-history-group-title">{{ $t('smartSearch.yesterday') }}</span>
                  </div>
                  <div class="ss-history-group-items">
                    <div
                      v-for="c in groupedConversations.yesterday"
                      :key="c.id"
                      class="ss-history-item"
                      :class="{ active: c.id === activeConversationId }"
                      @click="selectConversation(c.id)"
                    >
                      <span class="ss-history-item-text" :title="c.title">{{ c.title }}</span>
                      <button
                        class="ss-history-item-delete"
                        type="button"
                        :title="$t('shared.delete')"
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
        </div>
      </div>

      <!-- Sidebar Footer matching Dashboard.vue style -->
      <div class="sidebar-footer">
        <div class="footer-menu-items">
          <div class="footer-menu-item" :class="{ 'is-collapsed': sidebarCollapsed }" @click="goBackToDashboard">
            <el-icon><Grid /></el-icon>
            <span v-if="!sidebarCollapsed">{{ $t('smartSearch.backToDashboard') }}</span>
        </div>
      </div>

        <div class="user-menu-wrapper">
          <el-dropdown placement="top" trigger="click" @command="handleUserCommand">
            <div class="user-info-btn" :class="{ 'is-collapsed': sidebarCollapsed }">
              <el-avatar :size="sidebarCollapsed ? 32 : 40" class="user-avatar">
                <el-icon><User /></el-icon>
              </el-avatar>
              <div v-if="!sidebarCollapsed" class="user-info-content">
                <div class="user-details">
                  <span class="username-text">{{ currentUser?.username || currentUser?.name || 'User' }}</span>
                  <span class="role-text">{{ getRoleDisplayName(currentUser?.role) }}</span>
                </div>
                <el-icon class="chevron-icon"><ArrowDown /></el-icon>
              </div>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile" class="dropdown-item-normal">
                  <el-icon><User /></el-icon>
                  {{ $t('nav.profile') }}
                </el-dropdown-item>
                <el-dropdown-item divided command="logout" class="dropdown-item-danger">
                  <el-icon><SwitchButton /></el-icon>
                  {{ $t('nav.logout') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </el-aside>

    <!-- Main -->
    <main class="ss-main" :class="{ 'ss-main-compressed': sourceDrawerVisible }">
      <!-- Top Navigation Bar -->
      <header class="ss-header">
        <div class="ss-header-left">
          <div class="ss-model-selector">
            <el-dropdown trigger="click" @command="onLlmProviderChange">
              <div class="ss-model-trigger">
                <img 
                  v-if="currentModelIcon" 
                  :src="currentModelIcon" 
                  alt="Model Icon" 
                  class="ss-model-icon-img"
                />
                <el-icon v-else class="ss-model-icon"><Cpu /></el-icon>
                <span class="ss-model-name">{{ currentLlmProviderLabel }}</span>
                <el-icon class="ss-model-arrow"><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu class="ss-model-dropdown">
                  <el-dropdown-item 
                    v-for="p in llmProviders" 
                    :key="p.id" 
                    :command="p.id"
                    :disabled="p.available === false"
                    :class="{ active: p.id === llmProviderId }"
                    class="ss-model-dropdown-item"
                  >
                    <img 
                      v-if="getModelIcon(p)" 
                      :src="getModelIcon(p)" 
                      alt="Model Icon" 
                      class="ss-model-item-icon-img"
                    />
                    <el-icon v-else class="ss-model-item-icon">
                      <Cpu />
                    </el-icon>
                    <span class="ss-model-item-text">{{ p.label || p.id }}{{ p.model ? ` · ${p.model}` : '' }}</span>
                    <el-icon v-if="p.id === llmProviderId" class="ss-model-check"><Check /></el-icon>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
        
        <div class="ss-header-right">
          <!-- 语言切换 -->
          <el-dropdown trigger="click" @command="handleLanguageChange">
            <el-button text class="lang-btn">
              <el-icon :size="20" class="lang-icon"><GlobeIcon /></el-icon>
              <span class="lang-text">{{ currentLocaleLabel }}</span>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="zh-CN">
                  <span class="lang-item-content">
                    <span class="lang-emoji">🇨🇳</span>
                    <span>中文</span>
                    <el-icon v-if="currentLocale === 'zh-CN'" class="lang-check"><Check /></el-icon>
                  </span>
                </el-dropdown-item>
                <el-dropdown-item command="en-US">
                  <span class="lang-item-content">
                    <span class="lang-emoji">🇺🇸</span>
                    <span>English</span>
                    <el-icon v-if="currentLocale === 'en-US'" class="lang-check"><Check /></el-icon>
                  </span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div ref="messagesEl" class="ss-messages">
        <div v-if="activeMessages.length === 0" class="ss-empty">
          <div class="ss-empty-title">{{ $t('smartSearch.welcomeQuestion') }}</div>

          <div v-if="showLlmUnavailableHint" class="ss-llm-unavailable-hint">
            <el-alert
              :title="$t('smartSearch.llmUnavailableTitle')"
              :description="$t('smartSearch.llmUnavailableDescription')"
              type="warning"
              :closable="false"
              show-icon
            />
          </div>
          
          <div class="ss-quick-cards">
            <div class="ss-quick-card" @click="handleQuickAction('fault_code')">
              <div class="ss-quick-card-icon warning">
                <el-icon><Warning /></el-icon>
              </div>
              <div class="ss-quick-card-content">
                <h3>{{ $t('smartSearch.faultCodeQuery') }}</h3>
                <p>{{ $t('smartSearch.faultCodeQuerySubtitle') }}</p>
              </div>
            </div>
            
            <div class="ss-quick-card" @click="handleQuickAction('upload')">
              <div class="ss-quick-card-icon upload">
                <el-icon><Upload /></el-icon>
              </div>
              <div class="ss-quick-card-content">
                <h3>{{ $t('smartSearch.logUpload') }}</h3>
                <p>{{ $t('smartSearch.logUploadSubtitle') }}</p>
              </div>
            </div>
            
            <div class="ss-quick-card" @click="handleQuickAction('fault_case')">
              <div class="ss-quick-card-icon case">
                <el-icon><Notebook /></el-icon>
              </div>
              <div class="ss-quick-card-content">
                <h3>{{ $t('smartSearch.faultCaseQuery') }}</h3>
                <p>{{ $t('smartSearch.faultCaseQuerySubtitle') }}</p>
              </div>
            </div>
          </div>
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
              <div class="ss-msg-stack ss-msg-stack-user">
                <div v-if="hasUserMessageText(m)" class="ss-msg-bubble">
                  <div class="ss-msg-text">{{ m.content }}</div>
                </div>
                <div v-if="getUserMessageImageAttachments(m).length > 0" class="ss-msg-attachments ss-msg-image-attachments">
                  <div
                    v-for="attachment in getUserMessageImageAttachments(m)"
                    :key="attachment.assetId || attachment.objectKey || attachment.url"
                    class="ss-msg-image-card"
                  >
                    <el-image
                      :src="getUserMessageAttachmentImageSrc(attachment)"
                      :preview-src-list="getUserMessageAttachmentPreviewUrls(m)"
                      :initial-index="getUserMessageAttachmentPreviewIndex(m, attachment)"
                      fit="cover"
                      preview-teleported
                      class="ss-msg-image-card-media"
                    />
                    <div class="ss-msg-image-card-body">
                      <div class="ss-msg-image-card-name">{{ attachment.originalName || attachment.storedName || attachment.assetId }}</div>
                      <div class="ss-msg-image-card-meta">
                        <span>{{ formatAttachmentSize(attachment.sizeBytes) }}</span>
                        <span>点击预览</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="getUserMessageFileAttachments(m).length > 0" class="ss-msg-attachments ss-msg-file-attachments">
                  <div
                    v-for="attachment in getUserMessageFileAttachments(m)"
                    :key="attachment.assetId || attachment.objectKey || attachment.url"
                    class="ss-msg-attachment-card"
                  >
                    <div class="ss-msg-attachment-file-icon">
                      <el-icon><Files /></el-icon>
                    </div>
                    <div class="ss-msg-attachment-info">
                      <div class="ss-msg-attachment-name">{{ attachment.originalName || attachment.storedName || attachment.assetId }}</div>
                      <div class="ss-msg-attachment-sub">{{ formatAttachmentSize(attachment.sizeBytes) }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Assistant message: loading - show loading animation -->
            <template v-else-if="m.type === 'loading'">
              <div class="ss-msg-bubble ss-msg-loading">
                <div class="ss-loading-content">
                  <el-icon class="ss-loading-icon"><Loading /></el-icon>
                  <span class="ss-loading-text">{{ $t('smartSearch.thinking') }}</span>
                </div>
              </div>
            </template>

            <!-- Assistant message: LLM unavailable - show hint + quick cards -->
            <template v-else-if="m.type === 'llm_unavailable' || (m.type === 'search_result' && m.payload && m.payload.meta && m.payload.meta.llmAvailable === false)">
              <div class="ss-recommendation-wrapper">
                <div v-if="getMessageSystemMessages(m).length > 0" class="ss-system-messages">
                  <div
                    v-for="(systemMessage, index) in getMessageSystemMessages(m)"
                    :key="`${m.id}_system_${index}`"
                    class="ss-system-message"
                    :class="systemMessageClass(systemMessage)"
                  >
                    <div class="ss-system-message-title">{{ systemMessage.title }}</div>
                    <MarkdownRenderer class="ss-system-message-text" :content="systemMessage.text" compact />
                  </div>
                </div>
                <div class="ss-llm-unavailable-hint">
                  <el-alert
                    :title="$t('smartSearch.llmUnavailableTitle')"
                    :description="(m.payload && m.payload.answerText) ? m.payload.answerText : (m.content || $t('smartSearch.llmUnavailableDescription'))"
                    type="warning"
                    :closable="false"
                    show-icon
                  />
                </div>

                <div class="ss-recommendation-multiple">
                  <div class="ss-quick-cards-inline ss-quick-cards-multiple">
                    <div class="ss-quick-card" @click="handleQuickAction('upload')">
                      <div class="ss-quick-card-icon upload">
                        <el-icon><Upload /></el-icon>
                      </div>
                      <div class="ss-quick-card-content">
                        <h3>{{ $t('smartSearch.logUpload') }}</h3>
                        <p>{{ $t('smartSearch.logUploadSubtitle') }}</p>
                      </div>
                    </div>

                    <div class="ss-quick-card" @click="handleQuickAction('fault_code')">
                      <div class="ss-quick-card-icon warning">
                        <el-icon><Warning /></el-icon>
                      </div>
                      <div class="ss-quick-card-content">
                        <h3>{{ $t('smartSearch.faultCodeQuery') }}</h3>
                        <p>{{ $t('smartSearch.faultCodeQuerySubtitle') }}</p>
                      </div>
                    </div>

                    <div class="ss-quick-card" @click="handleQuickAction('fault_case')">
                      <div class="ss-quick-card-icon case">
                        <el-icon><Notebook /></el-icon>
                      </div>
                      <div class="ss-quick-card-content">
                        <h3>{{ $t('smartSearch.faultCaseQuery') }}</h3>
                        <p>{{ $t('smartSearch.faultCaseQuerySubtitle') }}</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </template>

            <!-- Assistant message: search result - display directly on background (ChatGPT style) -->
            <template v-else-if="m.type === 'search_result' && m.payload && m.payload.ok">
              <div class="ss-answer-container">
                <div v-if="getMessageSystemMessages(m).length > 0" class="ss-system-messages">
                  <div
                    v-for="(systemMessage, index) in getMessageSystemMessages(m)"
                    :key="`${m.id}_system_${index}`"
                    class="ss-system-message"
                    :class="systemMessageClass(systemMessage)"
                  >
                    <div class="ss-system-message-title">{{ systemMessage.title }}</div>
                    <MarkdownRenderer class="ss-system-message-text" :content="systemMessage.text" compact />
                  </div>
                </div>
                <!-- 1) 答案区 -->
                <div class="ss-answer-area">
                  <!-- 综合回答（含 MKnowledge 生成或片段拼接；与下方 Knowledge 来源区分） -->
                  <div v-if="(m.payload.answerText || '').trim()" class="ss-answer-section ss-answer-summary">
                    <div v-if="showAnswerSectionTitle(m.payload)" class="ss-answer-section-title">{{ $t('mobile.smartSearch.sectionAnswer') }}</div>
                    <div class="ss-answer-section-content">
                      <MarkdownRenderer class="ss-answer-text" :content="m.payload.answerText || ''" compact />
                    </div>
                  </div>
                  <!-- 识别到的查询要点 -->
                  <div v-if="m.payload.recognized && (m.payload.recognized.fullCodes?.length || m.payload.recognized.typeCodes?.length || m.payload.recognized.keywords?.length || m.payload.recognized.symptom?.length || m.payload.recognized.trigger?.length || m.payload.recognized.component?.length || m.payload.recognized.neg?.length || m.payload.recognized.intent || m.payload.recognized.days)" class="ss-answer-section">
                    <div class="ss-answer-section-title">{{ $t('mobile.smartSearch.recognized.title') }}</div>
                    <div class="ss-answer-section-content">
                      <div class="ss-query-points">
                        <template v-if="m.payload.recognized.intent">
                          <div>{{ $t('mobile.smartSearch.recognized.intent') }}：{{ getIntentLabel(m.payload.recognized.intent) }}</div>
                        </template>
                        <template v-if="m.payload.recognized.fullCodes?.length">
                          <div>{{ $t('mobile.smartSearch.recognized.faultCode') }}：{{ m.payload.recognized.fullCodes.join(' / ') }}</div>
                        </template>
                        <template v-else-if="m.payload.recognized.typeCodes?.length">
                          <div>{{ $t('mobile.smartSearch.recognized.faultType') }}：{{ m.payload.recognized.typeCodes.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.keywords?.length">
                          <div>{{ $t('mobile.smartSearch.recognized.keywords') }}：{{ m.payload.recognized.keywords.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.symptom?.length">
                          <div>{{ $t('mobile.smartSearch.recognized.symptom') }}：{{ m.payload.recognized.symptom.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.trigger?.length">
                          <div>{{ $t('mobile.smartSearch.recognized.trigger') }}：{{ m.payload.recognized.trigger.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.component?.length">
                          <div>{{ $t('mobile.smartSearch.recognized.component') }}：{{ m.payload.recognized.component.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.neg?.length">
                          <div>{{ $t('mobile.smartSearch.recognized.negative') }}：{{ m.payload.recognized.neg.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.days">
                          <div>{{ $t('mobile.smartSearch.recognized.lookbackDays') }}：{{ m.payload.recognized.days }} {{ $t('mobile.smartSearch.dayUnit') }}</div>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- find_case: 统一“故障案例”标签（Jira + MongoDB 合并，Jira 优先，按 jira_key 去重） -->
                  <div v-if="m.payload.recognized?.intent === 'find_case' && m.payload.meta?.jiraError" class="ss-answer-section">
                    <div class="ss-answer-section-title">{{ $t('mobile.smartSearch.sectionFaultCase') }}</div>
                    <div class="ss-answer-section-content">
                      <div class="ss-jira-error">
                        <el-alert
                          :title="m.payload.meta.jiraError.timeout ? $t('shared.jira.timeout') : $t('shared.jira.connectionFailed')"
                          :description="m.payload.meta.jiraError.message || $t('shared.jira.fallbackCaseSkipped')"
                          type="warning"
                          :closable="false"
                          show-icon
                        />
                      </div>
                    </div>
                  </div>
                  <div v-else-if="m.payload.recognized?.intent === 'find_case' && m.payload.sources && (m.payload.sources.cases || []).length > 0" class="ss-answer-section">
                    <div class="ss-answer-section-title">{{ $t('mobile.smartSearch.sectionFaultCase') }}</div>
                    <div class="ss-answer-section-content">
                      <div
                        v-for="c in (m.payload.sources?.cases || [])"
                        :key="c.ref"
                        class="ss-case-line"
                      >
                        <a
                          v-if="c.type === 'jira'"
                          class="ss-case-link"
                          href="#"
                          @click.prevent="openSourcesDrawerAndExpand(m, c.ref)"
                        >
                          <span class="ss-case-key">{{ c.key }}</span>
                          <span v-if="c.summary" class="ss-case-summary">：{{ c.summary }}</span>
                          <span class="ss-case-ref">[{{ c.ref }}]</span>
                        </a>
                        <a
                          v-else-if="c.type === 'mongo' && c.id"
                          class="ss-case-link"
                          href="#"
                          @click.prevent="openSourcesDrawerAndExpand(m, c.ref)"
                        >
                          <span class="ss-case-key">{{ c.title || c.id }}</span>
                          <span v-if="c.jira_key" class="ss-case-summary">（Jira：{{ c.jira_key }}）</span>
                          <span class="ss-case-ref">[{{ c.ref }}]</span>
                        </a>
                        <template v-else>
                          <span class="ss-case-key">{{ c.title || c.key || c.id || '-' }}</span>
                          <span class="ss-case-ref">[{{ c.ref }}]</span>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- 相似案例（非 find_case：统一使用 sources.cases / K 序号） -->
                  <div v-if="m.payload.recognized?.intent !== 'find_case' && m.payload.meta?.jiraError" class="ss-answer-section">
                    <div class="ss-answer-section-title">{{ $t('mobile.smartSearch.sectionSimilarCases') }}</div>
                    <div class="ss-answer-section-content">
                      <div class="ss-jira-error">
                        <el-alert
                          :title="m.payload.meta.jiraError.timeout ? $t('shared.jira.timeout') : $t('shared.jira.connectionFailed')"
                          :description="m.payload.meta.jiraError.message || $t('shared.jira.fallbackSimilarSkipped')"
                          type="warning"
                          :closable="false"
                          show-icon
                        />
                      </div>
                    </div>
                  </div>
                  <div v-if="m.payload.recognized?.intent !== 'find_case' && m.payload.sources && (m.payload.sources.cases || []).length > 0" class="ss-answer-section">
                    <div class="ss-answer-section-title">{{ $t('mobile.smartSearch.sectionSimilarCases') }}</div>
                    <div class="ss-answer-section-content">
                      <div
                        v-for="c in (m.payload.sources?.cases || [])"
                        :key="c.ref"
                        class="ss-case-line"
                      >
                        <a
                          class="ss-case-link"
                          href="#"
                          @click.prevent="openSourcesDrawerAndExpand(m, c.ref)"
                        >
                          <template v-if="c.type === 'jira'">
                            <span class="ss-case-key">{{ c.key }}</span>
                            <span v-if="c.summary" class="ss-case-summary">：{{ c.summary }}</span>
                            <span class="ss-case-ref">[{{ c.ref }}]</span>
                          </template>
                          <template v-else>
                            <span class="ss-case-key">{{ getMongoCase(c).case_code || getMongoCase(c).id || c.id || '-' }}</span>
                            <span class="ss-case-summary">：{{ getMongoCase(c).title || c.title || '-' }}</span>
                            <span class="ss-case-ref">[{{ c.ref }}]</span>
                          </template>
                        </a>
                      </div>
                    </div>
                  </div>

                  <!-- Knowledge 知识库文档（生成成功且有 answer 时隐藏；失败或空 answer 仍展示，见 showKbSnippetListInAnswer） -->
                  <div v-if="m.payload.sources && (m.payload.sources.kbDocs || []).length > 0 && showKbSnippetListInAnswer(m.payload)" class="ss-answer-section">
                    <div class="ss-answer-section-title">{{ $t('mobile.smartSearch.kbSourcesCount', { count: m.payload.sources.kbDocs.length }) }}</div>
                    <div class="ss-answer-section-content">
                      <div
                        v-for="(kb, idx) in (m.payload.sources.kbDocs || []).slice(0, 5)"
                        :key="kb.ref || idx"
                        class="ss-kb-item"
                      >
                        <div class="ss-kb-header">
                          <span class="ss-kb-ref">[{{ kb.ref }}]</span>
                          <span class="ss-kb-title">{{ kb.title || '-' }}</span>
                          <span v-if="kb.headingPath" class="ss-kb-heading">{{ kb.headingPath }}</span>
                        </div>
                        <div 
                          class="ss-kb-snippet" 
                          v-html="sanitizeSnippet(kb.snippet)"
                        ></div>
                        <div v-if="kbImageAssets(kb).length" class="ss-kb-assets">
                          <SmartSearchKbAssetImg
                            v-for="a in kbImageAssets(kb)"
                            :key="`kb-img-${kb.ref}-${a.id}`"
                            :file-id="kb.fileId"
                            :asset-id="a.id"
                          />
                        </div>
                        <a
                          class="ss-kb-link"
                          href="#"
                          @click.prevent="openSourcesDrawerAndExpand(m, kb.ref)"
                        >
                          {{ $t('mobile.smartSearch.viewDetail') }}
                        </a>
                      </div>
                      <div v-if="(m.payload.sources.kbDocs || []).length > 5" class="ss-kb-more">
                        <el-button 
                          size="small" 
                          text 
                          @click="openSourcesDrawer(m)"
                        >
                          {{ $t('smartSearch.viewAllKbSources', { count: m.payload.sources.kbDocs.length }) }}
                        </el-button>
                      </div>
                    </div>
                  </div>

                  <!-- 来源标识和复制按钮 -->
                  <div 
                    v-if="(m.payload.sources?.faultCodes?.length || 0) + (m.payload.sources?.cases?.length || 0) + (m.payload.sources?.kbDocs?.length || 0) > 0" 
                    class="ss-sources-actions"
                  >
                    <div 
                      class="ss-sources-button" 
                      @click="openSourcesDrawer(m)"
                    >
                      <div class="ss-sources-button-icons">
                        <div 
                          v-if="(m.payload.sources?.faultCodes || []).length > 0" 
                          class="ss-source-icon ss-source-icon-error-code" 
                          :style="{ zIndex: 10 }"
                          :title="$t('mobile.smartSearch.recognized.faultCode')"
                        >
                          <span class="ss-source-icon-text">ErrCode</span>
                        </div>
                        <div 
                          v-if="(m.payload.sources?.cases || []).length > 0" 
                          class="ss-source-icon ss-source-icon-fault-case" 
                          :style="{ zIndex: 9 }"
                          title="Fault Case"
                        >
                          <span class="ss-source-icon-text">Fault Case</span>
                        </div>
                        <div 
                          v-if="(m.payload.sources?.kbDocs || []).length > 0" 
                          class="ss-source-icon ss-source-icon-knowledge" 
                          :style="{ zIndex: 8 }"
                          title="Knowledge"
                        >
                          <span class="ss-source-icon-text">Knowledge</span>
                        </div>
                      </div>
                      <span class="ss-sources-button-text">{{ $t('mobile.smartSearch.sources') }}</span>
                    </div>
                    <button 
                      class="ss-copy-button" 
                      @click.stop="copyAnswerText(m)"
                      :title="$t('smartSearch.copyAnswer')"
                    >
                      <el-icon><DocumentCopy /></el-icon>
                    </button>
                  </div>
                </div>

                <!-- 2) 查看检索详情 -->
                <details v-if="m.payload.meta?.llmAvailable !== false && m.payload.debug" class="ss-result-debug">
                  <summary class="ss-result-debug-summary">{{ $t('smartSearch.viewRetrievalDetails') }}</summary>
                  <div class="ss-result-debug-body">
                    <div v-if="m.payload.debug.kbRetrieval" class="ss-debug-block">
                      <div class="ss-debug-title">{{ $t('smartSearch.debugKbRetrieval') }}</div>
                      <div class="ss-debug-row">
                        <span class="ss-debug-k">query：</span>
                        <span class="ss-debug-v">{{ m.payload.debug.kbRetrieval.query || '—' }}</span>
                      </div>
                      <div class="ss-debug-row">
                        <span class="ss-debug-k">{{ $t('smartSearch.debugKeywords') }}：</span>
                        <span class="ss-debug-v">{{ (m.payload.debug.kbRetrieval.keywords || []).length ? (m.payload.debug.kbRetrieval.keywords || []).join('、') : '—' }}</span>
                      </div>
                      <div v-if="m.payload.debug.kbRetrieval.mknowledgeLexicalQuery" class="ss-debug-row">
                        <span class="ss-debug-k">lexicalQuery：</span>
                        <span class="ss-debug-v">{{ m.payload.debug.kbRetrieval.mknowledgeLexicalQuery }}</span>
                      </div>
                      <div class="ss-debug-row">
                        <span class="ss-debug-k">TopK：</span>
                        <span class="ss-debug-v">{{ m.payload.debug.kbRetrieval.limit }}</span>
                      </div>
                      <div class="ss-debug-row">
                        <span class="ss-debug-k">{{ $t('smartSearch.debugGenerate') }}：</span>
                        <span class="ss-debug-v">{{ m.payload.debug.kbRetrieval.generate ? $t('smartSearch.yes') : $t('smartSearch.no') }}</span>
                      </div>
                      <div v-if="m.payload.debug.kbRetrieval.tokenUsage" class="ss-debug-row">
                        <span class="ss-debug-k">{{ $t('smartSearch.debugTokenUsage') }}：</span>
                        <span class="ss-debug-v">{{ formatKbTokenUsage(m.payload.debug.kbRetrieval.tokenUsage) }}</span>
                      </div>
                      <div v-else-if="m.payload.debug.kbRetrieval.generate" class="ss-debug-row">
                        <span class="ss-debug-k">{{ $t('smartSearch.debugTokenUsage') }}：</span>
                        <span class="ss-debug-v">{{ $t('smartSearch.debugTokenUsageEmpty') }}</span>
                      </div>
                      <template v-if="m.payload.debug.kbRetrieval.mknowledgeTimingMs != null">
                        <div class="ss-debug-title" style="margin-top: 8px">MKnowledge timingMs</div>
                        <pre class="ss-debug-pre">{{ typeof m.payload.debug.kbRetrieval.mknowledgeTimingMs === 'object' ? JSON.stringify(m.payload.debug.kbRetrieval.mknowledgeTimingMs, null, 2) : String(m.payload.debug.kbRetrieval.mknowledgeTimingMs) }}</pre>
                      </template>
                    </div>
                    <div v-if="m.payload.debug.llmPrompt" class="ss-debug-block">
                      <div class="ss-debug-title">LLM Prompt（messages）</div>
                      <pre class="ss-debug-pre">{{ JSON.stringify(m.payload.debug.llmPrompt, null, 2) }}</pre>
                    </div>
                    <div v-if="m.payload.debug.llmRaw" class="ss-debug-block">
                      <div class="ss-debug-title">LLM Raw（request/response）</div>
                      <pre class="ss-debug-pre">{{ formatLlmRaw(m.payload.debug.llmRaw) }}</pre>
                    </div>
                    <div v-if="m.payload.debug.queryPlan" class="ss-debug-block">
                      <div class="ss-debug-title">{{ $t('smartSearch.debugParseResult') }}</div>
                      <pre class="ss-debug-pre">{{ JSON.stringify(m.payload.debug.queryPlan, null, 2) }}</pre>
                    </div>
                    <div class="ss-debug-block">
                      <div class="ss-debug-title">{{ $t('smartSearch.debugFaultCodeParams') }}</div>
                      <pre class="ss-debug-pre">{{ JSON.stringify(m.payload.debug.errorCodes, null, 2) }}</pre>
                    </div>
                    <div class="ss-debug-block">
                      <div class="ss-debug-title">{{ $t('smartSearch.debugJiraQuery') }}</div>
                      <div class="ss-debug-row"><span class="ss-debug-k">jql：</span>{{ m.payload.debug.jira?.jql || '--' }}</div>
                    </div>
                    <div v-if="m.payload.debug.mongo" class="ss-debug-block">
                      <div class="ss-debug-title">{{ $t('smartSearch.debugMongoQuery') }}</div>
                      <pre class="ss-debug-pre">{{ JSON.stringify(m.payload.debug.mongo, null, 2) }}</pre>
                    </div>
                  </div>
                </details>
              </div>
            </template>

            <!-- Assistant message: recommendation card - display as quick cards -->
            <template v-else-if="m.recommendation">
              <div class="ss-recommendation-wrapper">
                <!-- 多卡片推荐：暂无相关数据 + 3 个入口 -->
                <div v-if="m.recommendation.type === 'multiple'" class="ss-recommendation-multiple">
                  <div class="ss-no-data-tip">{{ $t('smartSearch.noRelatedData') }}</div>
                  <div class="ss-quick-cards-inline ss-quick-cards-multiple">
                    <div class="ss-quick-card" @click="handleQuickAction('fault_case')">
                      <div class="ss-quick-card-icon case">
                        <el-icon><Notebook /></el-icon>
                      </div>
                      <div class="ss-quick-card-content">
                        <h3>{{ $t('smartSearch.faultCaseQuery') }}</h3>
                        <p>{{ $t('smartSearch.faultCaseQuerySubtitle') }}</p>
                      </div>
                    </div>

                    <div class="ss-quick-card" @click="handleQuickAction('fault_code')">
                      <div class="ss-quick-card-icon warning">
                        <el-icon><Warning /></el-icon>
                      </div>
                      <div class="ss-quick-card-content">
                        <h3>{{ $t('smartSearch.faultCodeQuery') }}</h3>
                        <p>{{ $t('smartSearch.faultCodeQuerySubtitle') }}</p>
                      </div>
                    </div>

                    <div class="ss-quick-card" @click="handleQuickAction('upload')">
                      <div class="ss-quick-card-icon upload">
                        <el-icon><Upload /></el-icon>
                      </div>
                      <div class="ss-quick-card-content">
                        <h3>{{ $t('smartSearch.logUpload') }}</h3>
                        <p>{{ $t('smartSearch.logUploadSubtitle') }}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 单卡片推荐（find_case / troubleshoot / lookup_fault_code） -->
                <div v-else class="ss-quick-cards-inline ss-quick-cards-single">
                  <div class="ss-quick-card" @click="navigateTo(m.recommendation.path)">
                    <div
                      class="ss-quick-card-icon"
                      :class="m.recommendation.type === 'fault_case' ? 'case' : 'warning'"
                    >
                      <el-icon v-if="m.recommendation.type === 'fault_case'"><Notebook /></el-icon>
                      <el-icon v-else><Warning /></el-icon>
                    </div>
                    <div class="ss-quick-card-content">
                      <h3>{{ m.recommendation.title }}</h3>
                      <p>{{ m.recommendation.text }}</p>
                    </div>
                  </div>
                </div>

              </div>
            </template>

            <!-- Assistant message: other content - keep in bubble -->
            <template v-else>
              <div class="ss-msg-stack">
                <div v-if="getMessageSystemMessages(m).length > 0" class="ss-system-messages">
                  <div
                    v-for="(systemMessage, index) in getMessageSystemMessages(m)"
                    :key="`${m.id}_system_${index}`"
                    class="ss-system-message"
                    :class="systemMessageClass(systemMessage)"
                  >
                    <div class="ss-system-message-title">{{ systemMessage.title }}</div>
                    <MarkdownRenderer class="ss-system-message-text" :content="systemMessage.text" compact />
                  </div>
                </div>
                <div v-if="m.content" class="ss-msg-bubble">
                  <MarkdownRenderer class="ss-msg-text" :content="m.content || ''" compact />
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="activeConversationLockedNotice" class="ss-instance-locked-notice">
        <el-alert
          :title="activeConversationLockedNotice"
          type="warning"
          :closable="false"
          show-icon
        />
      </div>

      <div v-if="!activeConversationLockedNotice" class="ss-composer-wrap" :class="{ centered: activeMessages.length === 0 }">
        <div class="ss-composer" @paste="handleComposerPaste">
          <div
            v-if="showImageCapabilityHint"
            class="ss-composer-capability-hint"
          >
            <div class="ss-composer-capability-copy">
              当前模型不会解析图片，图片附件仍会保存，但不会进入模型理解。
            </div>
            <button
              v-if="nextImageCapableProvider"
              type="button"
              class="ss-composer-capability-switch"
              @click="switchToImageCapableProvider"
            >
              切换到 {{ nextImageCapableProvider.label || nextImageCapableProvider.id }}
            </button>
          </div>

          <div
            v-if="draftAttachments.length > 0"
            class="ss-composer-attachments-section"
          >
            <div class="ss-draft-attachments">
            <div
              v-for="attachment in draftAttachments"
              :key="attachment.localId"
              class="ss-draft-attachment-card"
              :class="{
                'is-draft': attachment.status === 'draft',
                'is-uploading': attachment.status === 'uploading',
                'is-available': attachment.status === 'available',
                'is-failed': attachment.status === 'failed'
              }"
              :style="draftAttachmentCardStyle(attachment)"
            >
              <div
                v-if="attachment.type === 'image'"
                class="ss-draft-attachment-thumb"
              >
                <img
                  v-if="attachment.localPreviewUrl"
                  :src="attachment.localPreviewUrl"
                  :alt="attachment.originalName"
                  class="ss-draft-attachment-image"
                >
                <div v-else class="ss-draft-attachment-thumb-fallback">
                  <el-icon><Files /></el-icon>
                </div>
              </div>
              <div v-else class="ss-draft-attachment-file-card">
                <div class="ss-draft-attachment-thumb ss-draft-attachment-thumb-file">
                  <el-icon><Files /></el-icon>
                </div>
                <div class="ss-draft-attachment-file-name" :title="attachment.originalName">
                  {{ attachment.originalName }}
                </div>
              </div>

              <div class="ss-draft-attachment-overlay">
                <button
                  v-if="attachment.status === 'failed'"
                  type="button"
                  class="ss-draft-attachment-failed-indicator"
                  :title="$t('shared.retry')"
                  @click="retryDraftAttachment(attachment.localId)"
                >
                  !
                </button>
                <div
                  v-else-if="attachment.status === 'uploading'"
                  class="ss-draft-attachment-progress-badge"
                >
                  {{ attachment.progress }}%
                </div>
              </div>

              <div class="ss-draft-attachment-actions">
                <button
                  type="button"
                  class="ss-draft-attachment-remove"
                  :title="$t('shared.delete')"
                  @click="removeDraftAttachment(attachment.localId)"
                >
                  ×
                </button>
              </div>
            </div>
            </div>
          </div>

          <div class="ss-composer-text-section" :class="{ 'has-attachments': draftAttachments.length > 0 }">
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
          </div>

          <button
            type="button"
            class="ss-send-btn"
            :class="{ disabled: !canSend }"
            :disabled="!canSend"
            @click="send"
            :title="$t('smartSearch.send')"
          >
            <el-icon><ArrowUp /></el-icon>
          </button>
        </div>

        <div class="ss-disclaimer">
          {{ $t('smartSearch.disclaimer') }}
        </div>
      </div>

      <el-drawer
        v-model="sourceDrawerVisible"
        :title="$t('smartSearch.searchResults')"
        size="520px"
        direction="rtl"
        :with-header="true"
        :modal="false"
        :append-to-body="true"
      >
        <div class="ss-sources-drawer">
          <!-- 故障码来源 -->
          <div v-if="sourceDrawerMessage?.payload?.sources?.faultCodes?.length" class="ss-sources-group">
            <div class="ss-sources-group-title">{{ $t('mobile.smartSearch.faultCodeSourcesCount', { count: sourceDrawerMessage?.payload?.sources?.faultCodes?.length }) }}</div>
            <div class="ss-sources-list">
              <div
                v-for="f in sourceDrawerMessage.payload.sources.faultCodes"
                :key="f.ref"
                class="ss-source-item"
              >
                <div class="ss-source-header" @click="toggleSourceExpanded(f.ref)">
                  <span class="ss-source-ref">[{{ f.ref }}]</span>
                  <span class="ss-source-text">{{ f.subsystem ? `${f.subsystem} - ` : '' }}{{ f.code }}</span>
                  <span v-if="f.short_message" class="ss-source-desc">：{{ f.short_message }}</span>
                  <el-icon class="ss-source-expand-icon" :class="{ expanded: expandedSources.has(f.ref) }">
                    <ArrowDown />
                  </el-icon>
                </div>
                <div v-if="expandedSources.has(f.ref)" class="ss-source-expanded">
                  <div class="ss-source-detail">
                    <!-- 解释 -->
                    <div v-if="f.explanation" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.fieldExplanation') }}</div>
                      <div class="ss-source-detail-value">{{ f.explanation }}</div>
                    </div>
                    
                    <!-- 用户提示 -->
                    <div v-if="f.user_hint || f.operation" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.fieldUserHint') }}</div>
                      <div class="ss-source-detail-value">{{ [f.user_hint, f.operation].filter(Boolean).join(' ') || '-' }}</div>
                    </div>
                    
                    <!-- 参数含义 -->
                    <div v-if="f.param1 || f.param2 || f.param3 || f.param4" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.fieldParams') }}</div>
                      <div class="ss-source-detail-params">
                        <div v-if="f.param1" class="ss-source-detail-param">
                          <span class="ss-param-label">{{ $t('shared.param1') }}：</span>
                          <span class="ss-param-value">{{ f.param1 }}</span>
                        </div>
                        <div v-if="f.param2" class="ss-source-detail-param">
                          <span class="ss-param-label">{{ $t('shared.param2') }}：</span>
                          <span class="ss-param-value">{{ f.param2 }}</span>
                        </div>
                        <div v-if="f.param3" class="ss-source-detail-param">
                          <span class="ss-param-label">{{ $t('shared.param3') }}：</span>
                          <span class="ss-param-value">{{ f.param3 }}</span>
                        </div>
                        <div v-if="f.param4" class="ss-source-detail-param">
                          <span class="ss-param-label">{{ $t('shared.param4') }}：</span>
                          <span class="ss-param-value">{{ f.param4 }}</span>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 详细信息 -->
                    <div v-if="f.detail" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.fieldDetail') }}</div>
                      <div class="ss-source-detail-value">{{ f.detail }}</div>
                    </div>
                    
                    <!-- 检查方法 -->
                    <div v-if="f.method" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.fieldMethod') }}</div>
                      <div class="ss-source-detail-value">{{ f.method }}</div>
                    </div>
                    
                    <!-- 分类 -->
                    <div v-if="f.category" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.fieldCategory') }}</div>
                      <div class="ss-source-detail-value">{{ f.category }}</div>
                    </div>
                    
                    <!-- 技术排查方案 -->
                    <div class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.fieldTechSolution') }}</div>
                      <div v-if="f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution" class="ss-source-detail-value ss-source-tech-text">
                        {{ f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution }}
                      </div>
                      <div v-else-if="f.id && !faultTechSolutions.get(f.id)" class="ss-source-detail-value">
                        <el-button
                          size="small"
                          text
                          :loading="faultTechSolutions.get(f.id)?.loading"
                          @click="loadTechSolution(f.id)"
                        >
                          {{ $t('mobile.smartSearch.loadTechSolution') }}
                        </el-button>
                      </div>
                      <div v-else class="ss-source-detail-value">-</div>
                      
                      <!-- 附件 -->
                      <div v-if="(faultTechSolutions.get(f.id)?.images || []).length > 0" class="ss-fault-attachments">
                        <div class="ss-fault-attachments-title">{{ $t('mobile.smartSearch.fieldAttachments') }}：</div>
                        <div class="ss-fault-attachments-list">
                          <!-- 图片：可预览 -->
                          <div
                            v-for="img in (faultTechSolutions.get(f.id)?.images || []).filter(img => isImageFile(img))"
                            :key="img.uid || img.url"
                            class="ss-fault-attachment-image"
                          >
                            <el-image
                              :src="getGenericAttachmentProxyUrl(img.url)"
                              :preview-src-list="getImagePreviewList(faultTechSolutions.get(f.id).images)"
                              fit="cover"
                              class="ss-attachment-image"
                              :initial-index="getImageIndex(faultTechSolutions.get(f.id).images, img)"
                            />
                            <div class="ss-attachment-image-name">{{ img.original_name || img.filename || $t('shared.attachmentImage') }}</div>
                          </div>
                          <!-- PDF/其他文件：显示文件名，可点击下载 -->
                          <a
                            v-for="img in (faultTechSolutions.get(f.id)?.images || []).filter(img => !isImageFile(img))"
                            :key="img.uid || img.url"
                            class="ss-fault-attachment-file"
                            :href="getGenericAttachmentProxyUrl(img.url)"
                            target="_blank"
                            rel="noopener noreferrer"
                            @click.stop
                          >
                            <span>{{ img.original_name || img.filename || $t('shared.attachmentFile') }}</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 故障案例来源：统一使用 sources.cases（K 序号） -->
          <div v-if="(sourceDrawerMessage?.payload?.sources?.cases?.length || 0) > 0" class="ss-sources-group">
            <div class="ss-sources-group-title">{{ $t('mobile.smartSearch.faultCaseSourcesCount', { count: sourceDrawerMessage?.payload?.sources?.cases?.length || 0 }) }}</div>
            <div class="ss-sources-list">
              <!-- 合并后的 cases（find_case/troubleshoot 意图） -->
              <template v-if="sourceDrawerMessage?.payload?.sources?.cases?.length">
              <div
                  v-for="c in sourceDrawerMessage.payload.sources.cases"
                  :key="c.ref"
                  class="ss-source-item"
                >
                  <div class="ss-source-header" @click="toggleSourceExpanded(c.ref)">
                    <span class="ss-source-ref">[{{ c.ref }}]</span>
                    <template v-if="c.type === 'jira'">
                      <span class="ss-source-text">{{ c.key }}</span>
                      <span v-if="c.summary" class="ss-source-desc">：{{ c.summary }}</span>
                    </template>
                    <template v-else-if="c.type === 'mongo'">
                      <span class="ss-source-text">{{ (getMongoCase(c).case_code || getMongoCase(c).id || '-') }}：{{ getMongoCase(c).title || c.title || '-' }}</span>
                    </template>
                    <template v-else>
                      <span class="ss-source-text">{{ c.title || c.key || c.id || '-' }}</span>
                    </template>
                    <el-icon class="ss-source-expand-icon" :class="{ expanded: expandedSources.has(c.ref) }">
                      <ArrowDown />
                    </el-icon>
                  </div>
                  <div v-if="expandedSources.has(c.ref)" class="ss-source-expanded">
                    <div class="ss-source-detail">
                      <!-- Jira (复用 JiraFaultCases 概览弹窗字段；展开时会 getIssue 补齐) -->
                      <template v-if="c.type === 'jira'">
                        <div v-if="jiraIssueLoading[c.key]" class="ss-case-loading">{{ $t('mobile.smartSearch.loadingJiraDetail') }}</div>

                        <!-- Header: Key / Project Name + Title -->
                        <div class="ss-case-preview-header">
                          <div class="ss-case-preview-key-project">
                            {{ getJiraCase(c).key || c.key || '-' }}<span v-if="getJiraCase(c).projectName"> / {{ getJiraCase(c).projectName }}</span>
                      </div>
                          <div class="ss-case-preview-title">{{ getJiraCase(c).summary || c.summary || '-' }}</div>
                      </div>

                        <!-- Key Information Section: Two Columns -->
                        <div class="ss-case-key-info">
                          <div class="ss-case-key-info-left">
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">{{ $t('mobile.smartSearch.caseInfo.status') }}</div>
                              <el-tag v-if="getJiraCase(c).status" type="primary" size="small" class="ss-case-status-tag">
                                {{ getJiraCase(c).status }}
                              </el-tag>
                              <span v-else class="ss-case-info-empty">-</span>
                            </div>
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">{{ $t('mobile.smartSearch.caseInfo.components') }}</div>
                              <div class="ss-case-components">
                                <el-tag
                                  v-for="(comp, idx) in (getJiraCase(c).components || [])"
                                  :key="idx"
                                  size="small"
                                  class="ss-case-component-tag"
                                >
                                  {{ comp }}
                                </el-tag>
                                <span v-if="!getJiraCase(c).components || getJiraCase(c).components.length === 0" class="ss-case-info-empty">-</span>
                              </div>
                            </div>
                          </div>
                          <div class="ss-case-key-info-right">
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">{{ $t('mobile.smartSearch.caseInfo.resolution') }}</div>
                              <div class="ss-case-info-value">
                                {{ getJiraCase(c).resolution?.name || 'Unresolved' }}
                              </div>
                            </div>
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">{{ $t('mobile.smartSearch.caseInfo.updated') }}</div>
                              <div class="ss-case-info-value">
                                <el-icon :size="12" style="margin-right: 4px;"><Clock /></el-icon>
                                {{ formatTime(getJiraCase(c).updated) || '-' }}
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- 模块信息（如果components为空，显示module） -->
                        <div v-if="(!getJiraCase(c).components || getJiraCase(c).components.length === 0) && getJiraCase(c).module" class="ss-source-detail-section">
                          <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.module') }}</div>
                          <div class="ss-source-detail-value">{{ getJiraCase(c).module }}</div>
                        </div>

                        <!-- Content Section: 客诉/普通 两套字段（与 JiraFaultCases 一致） -->
                        <template v-if="isComplaintProjectByCase(c)">
                          <div v-if="getJiraCase(c).customfield_12213" class="ss-case-content-section">
                            <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseSection.detailedDescription') }}</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).customfield_12213 }}</div>
                          </div>
                          <div v-if="getJiraCase(c).customfield_12284" class="ss-case-content-section">
                            <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseSection.preliminaryInvestigation') }}</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).customfield_12284 }}</div>
                          </div>
                          <div class="ss-case-content-two-columns">
                            <div v-if="getJiraCase(c).customfield_12233" class="ss-case-content-section">
                              <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseSection.containmentMeasures') }}</div>
                              <div class="ss-case-content-box">{{ getJiraCase(c).customfield_12233 }}</div>
                            </div>
                            <div v-if="getJiraCase(c).customfield_12239" class="ss-case-content-section">
                              <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseSection.longTermMeasures') }}</div>
                              <div class="ss-case-content-box">{{ getJiraCase(c).customfield_12239 }}</div>
                            </div>
                          </div>
                          <div v-if="!getJiraCase(c).customfield_12213 && !getJiraCase(c).customfield_12284 && !getJiraCase(c).customfield_12233 && !getJiraCase(c).customfield_12239" class="ss-case-content-section">
                            <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseSection.detailedDescription') }}</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).description || getJiraCase(c).summary || '-' }}</div>
                          </div>
                        </template>
                        <template v-else>
                          <div v-if="getJiraCase(c).description || getJiraCase(c).summary" class="ss-case-content-section">
                            <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseSection.description') }}</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).description || getJiraCase(c).summary }}</div>
                          </div>
                          <div v-if="getJiraCase(c).customfield_10705" class="ss-case-content-section">
                            <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseSection.investigationAndCause') }}</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).customfield_10705 }}</div>
                          </div>
                          <div v-if="getJiraCase(c).customfield_10600" class="ss-case-content-section">
                            <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseSection.solutionDetails') }}</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).customfield_10600 }}</div>
                          </div>
                        </template>

                        <!-- Attachments Section -->
                        <div v-if="(getJiraCase(c).attachments || []).length > 0" class="ss-case-attachments-section">
                          <div v-if="getJiraImageAttachments(c).length > 0" class="ss-case-image-attachments">
                            <div class="ss-case-attachment-label">{{ $t('mobile.smartSearch.caseSection.imageAttachments') }}</div>
                            <div class="ss-case-attachment-images">
                              <div v-for="img in getJiraImageAttachments(c)" :key="img.id || img.filename" class="ss-case-image-thumbnail" :title="img.filename">
                                <el-image
                                  :src="getJiraImageSrc(img)"
                                  :preview-src-list="getJiraImagePreviewUrls(c)"
                                  fit="cover"
                                  class="ss-case-attachment-image"
                                  :initial-index="getJiraImageIndex(c, img)"
                                  :preview-teleported="true"
                                />
                                <div class="ss-case-image-name">{{ img.filename }}</div>
                              </div>
                            </div>
                          </div>
                          <div v-if="getJiraFileAttachments(c).length > 0" class="ss-case-file-attachments">
                            <div class="ss-case-attachment-label">{{ $t('mobile.smartSearch.caseSection.fileAttachments') }}</div>
                            <div v-for="file in getJiraFileAttachments(c)" :key="file.id || file.filename" class="ss-case-attachment-item">
                              <el-link type="primary" :underline="false" @click="downloadJiraFile(file)">
                                <el-icon><Paperclip /></el-icon>
                                {{ file.filename }}
                              </el-link>
                            </div>
                          </div>
                        </div>
                      </template>

                      <!-- MongoDB 故障案例（概览方式显示） -->
                      <template v-else>
                        <div v-if="mongoCaseLoading[c.id]" class="ss-case-loading">{{ $t('mobile.smartSearch.loadingFaultCaseDetail') }}</div>
                        <!-- Header: Key / ID + Title -->
                        <div class="ss-case-preview-header">
                          <div class="ss-case-preview-key-project">
                            {{ getMongoCase(c).case_code || getMongoCase(c).jira_key || getMongoCase(c).id || '-' }}<span v-if="getMongoCase(c).title">：{{ getMongoCase(c).title }}</span>
                          </div>
                          <div class="ss-case-preview-title">{{ getMongoCase(c).title || '-' }}</div>
                        </div>

                        <!-- Key Information Section: Two Columns -->
                        <div class="ss-case-key-info">
                          <div class="ss-case-key-info-left">
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">{{ $t('mobile.smartSearch.caseInfo.status') }}</div>
                              <el-tag v-if="getMongoCase(c).status" type="primary" size="small" class="ss-case-status-tag">
                                {{ getMongoCase(c).status }}
                              </el-tag>
                              <span v-else class="ss-case-info-empty">-</span>
                            </div>
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">{{ $t('mobile.smartSearch.module') }}</div>
                              <div class="ss-case-info-value">
                                {{ getMongoCase(c).module || '-' }}
                              </div>
                            </div>
                          </div>
                          <div class="ss-case-key-info-right">
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">{{ $t('faultCases.fields.equipment_model') }}</div>
                              <div class="ss-case-info-value">
                                {{
                                  Array.isArray(getMongoCase(c).equipment_model)
                                    ? (getMongoCase(c).equipment_model.join(', ') || '-')
                                    : (getMongoCase(c).equipment_model || '-')
                                }}
                              </div>
                            </div>
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">{{ $t('mobile.smartSearch.caseInfo.updated') }}</div>
                              <div class="ss-case-info-value">
                                <el-icon :size="12" style="margin-right: 4px;"><Clock /></el-icon>
                                {{ formatDateTime(getMongoCase(c).updated_at_user || getMongoCase(c).updatedAt || getMongoCase(c).updated || getMongoCase(c).createdAt) || '-' }}
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- Jira Key (if exists) -->
                        <div v-if="getMongoCase(c).jira_key" class="ss-source-detail-section">
                          <div class="ss-source-detail-label">Jira Key</div>
                          <div class="ss-source-detail-value">{{ getMongoCase(c).jira_key }}</div>
                        </div>

                        <!-- Content Section -->
                        <div class="ss-case-content-section">
                          <div class="ss-case-content-label">{{ $t('faultCases.fields.symptom') }}</div>
                          <div class="ss-case-content-box">{{ getMongoCase(c).symptom || '-' }}</div>
                        </div>

                        <div class="ss-case-content-section">
                          <div class="ss-case-content-label">{{ $t('faultCases.fields.possible_causes') }}</div>
                          <div class="ss-case-content-box">{{ getMongoCase(c).possible_causes || '-' }}</div>
                        </div>

                        <div class="ss-case-content-section">
                          <div class="ss-case-content-label">{{ $t('mobile.smartSearch.caseInfo.resolution') }}</div>
                          <div class="ss-case-content-box">{{ getMongoCase(c).resolution || getMongoCase(c).solution || '-' }}</div>
                        </div>

                        <div class="ss-case-content-section">
                          <div class="ss-case-content-label">{{ $t('faultCases.fields.remark') }}</div>
                          <div class="ss-case-content-box">{{ getMongoCase(c).remark || '-' }}</div>
                        </div>

                        <!-- Related Error Codes -->
                        <div class="ss-source-detail-section">
                          <div class="ss-source-detail-label">{{ $t('faultCases.fields.related_error_code_ids') }}</div>
                          <div class="ss-source-detail-value">
                            <span v-if="Array.isArray(getMongoCase(c).related_error_code_ids) && getMongoCase(c).related_error_code_ids.length > 0">
                              {{ getMongoCase(c).related_error_code_ids.join(', ') }}
                            </span>
                            <span v-else>-</span>
                          </div>
                        </div>

                        <!-- Attachments Section -->
                        <div class="ss-case-attachments-section">
                          <div v-if="getMongoImageAttachments(getMongoCase(c)).length > 0" class="ss-case-image-attachments">
                            <div class="ss-case-attachment-label">{{ $t('mobile.smartSearch.caseSection.imageAttachments') }}</div>
                            <div class="ss-case-attachment-images">
                              <div v-for="img in getMongoImageAttachments(getMongoCase(c))" :key="img.uid || img.url || img.id" class="ss-case-image-thumbnail" :title="img.original_name || img.filename || img.name">
                                <el-image
                                  :src="getMongoImageSrc(img)"
                                  :preview-src-list="getMongoImagePreviewUrls(getMongoCase(c))"
                                  fit="cover"
                                  class="ss-case-attachment-image"
                                  :initial-index="getMongoImageIndex(getMongoCase(c), img)"
                                  :preview-teleported="true"
                                />
                                <div class="ss-case-image-name">{{ img.original_name || img.filename || img.name || $t('shared.attachmentImage') }}</div>
                              </div>
                            </div>
                          </div>
                          <div v-if="getMongoFileAttachments(getMongoCase(c)).length > 0" class="ss-case-file-attachments">
                            <div class="ss-case-attachment-label">{{ $t('mobile.smartSearch.caseSection.fileAttachments') }}</div>
                            <div v-for="file in getMongoFileAttachments(getMongoCase(c))" :key="file.uid || file.url || file.id" class="ss-case-attachment-item">
                              <el-link type="primary" :underline="false" @click="downloadMongoFile(file)">
                                <el-icon><Paperclip /></el-icon>
                                {{ file.original_name || file.filename || file.name || $t('shared.attachmentFile') }}
                              </el-link>
                            </div>
                          </div>
                          <div v-if="getMongoImageAttachments(getMongoCase(c)).length === 0 && getMongoFileAttachments(getMongoCase(c)).length === 0" class="ss-source-detail-section">
                            <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.fieldAttachments') }}</div>
                            <div class="ss-source-detail-value">-</div>
                          </div>
                        </div>
                      </template>

                      <!-- 操作按钮 -->
                      <div class="ss-source-detail-actions">
                        <template v-if="c.type === 'jira'">
                          <button 
                            v-if="getJiraCase(c).url" 
                            class="btn-text btn-sm" 
                            @click.stop="handleJiraJump(getJiraCase(c).url)"
                          >
                            跳转 Jira
                          </button>
                          <button 
                            v-else-if="c.key" 
                            class="btn-text btn-sm" 
                            @click.stop="handleJiraJumpByKey(c.key)"
                          >
                            跳转 Jira
                          </button>
                        </template>
                        <template v-else-if="c.type === 'mongo' && c.id">
                          <button 
                            class="btn-text btn-sm" 
                            @click.stop="goFaultCaseDetail(c.id)"
                          >
                            {{ $t('mobile.smartSearch.viewDetail') }}
                          </button>
                        </template>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 知识库来源：使用 sources.kbDocs（D 序号） -->
          <div v-if="(sourceDrawerMessage?.payload?.sources?.kbDocs?.length || 0) > 0" class="ss-sources-group">
            <div class="ss-sources-group-title">{{ $t('mobile.smartSearch.kbSourcesCount', { count: sourceDrawerMessage?.payload?.sources?.kbDocs?.length || 0 }) }}</div>
            <div class="ss-sources-list">
              <div
                v-for="k in (sourceDrawerMessage?.payload?.sources?.kbDocs || [])"
                :key="k.ref || `${k.docId}-${k.chunkNo}`"
                class="ss-source-item"
              >
                <div class="ss-source-header" @click="toggleSourceExpanded(k.ref)">
                  <span class="ss-source-ref">[{{ k.ref || 'D' }}]</span>
                  <span class="ss-kb-title" :title="k.title || k.path">{{ k.title || k.path || '-' }}</span>
                  <span v-if="k.headingPath" class="ss-source-desc">：{{ k.headingPath }}</span>
                  <el-icon class="ss-source-expand-icon" :class="{ expanded: expandedSources.has(k.ref) }">
                    <ArrowDown />
                  </el-icon>
                </div>
                <div v-if="expandedSources.has(k.ref)" class="ss-source-expanded">
                  <div class="ss-source-detail">
                    <div class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.kbSnippet') }}</div>
                      <div class="ss-source-detail-value ss-kb-snippet" v-html="sanitizeSnippet(k.snippet)"></div>
                    </div>
                    <div v-if="kbImageAssets(k).length" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">{{ $t('mobile.smartSearch.kbImages') }}</div>
                      <div class="ss-source-detail-value ss-kb-assets">
                        <SmartSearchKbAssetImg
                          v-for="a in kbImageAssets(k)"
                          :key="`drawer-kb-img-${k.ref}-${a.id}`"
                          :file-id="k.fileId"
                          :asset-id="a.id"
                        />
                      </div>
                    </div>
                    <div v-if="k.path" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">Path</div>
                      <div class="ss-source-detail-value">{{ k.path }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-drawer>

      <!-- 故障码详情弹窗 -->
      <el-dialog
        v-model="faultDetailDialogVisible"
        :title="$t('shared.faultCodeDetail')"
        width="800px"
        :close-on-click-modal="false"
      >
        <div v-if="faultDetailItem" class="ss-fault-detail-dialog">
          <el-tabs v-model="faultDetailActiveTab">
            <el-tab-pane :label="$t('errorCodes.queryResult.basicInfo')" name="basic">
              <div class="ss-fault-detail-dialog-content">
                <div class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('mobile.smartSearch.recognized.faultCode') }}</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.subsystem ? `${faultDetailItem.subsystem} - ` : '' }}{{ faultDetailItem.code }}</div>
                </div>
                <div v-if="faultDetailItem.short_message" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('shared.summary') }}</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.short_message }}</div>
                </div>
                <div v-if="faultDetailItem.user_hint || faultDetailItem.operation || faultDetailItem.explanation" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('mobile.smartSearch.fieldExplanation') }}</div>
                  <div class="ss-fault-detail-dialog-value">{{ [faultDetailItem.explanation, faultDetailItem.user_hint, faultDetailItem.operation].filter(Boolean).join(' ') }}</div>
                </div>
                <div v-if="faultDetailItem.param1 || faultDetailItem.param2 || faultDetailItem.param3 || faultDetailItem.param4" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('mobile.smartSearch.fieldParams') }}</div>
                  <div class="ss-fault-detail-dialog-params">
                    <div v-if="faultDetailItem.param1" class="ss-fault-detail-dialog-param">
                      <span class="ss-param-label">{{ $t('shared.param1') }}：</span>
                      <span class="ss-param-value">{{ faultDetailItem.param1 }}</span>
                    </div>
                    <div v-if="faultDetailItem.param2" class="ss-fault-detail-dialog-param">
                      <span class="ss-param-label">{{ $t('shared.param2') }}：</span>
                      <span class="ss-param-value">{{ faultDetailItem.param2 }}</span>
                    </div>
                    <div v-if="faultDetailItem.param3" class="ss-fault-detail-dialog-param">
                      <span class="ss-param-label">{{ $t('shared.param3') }}：</span>
                      <span class="ss-param-value">{{ faultDetailItem.param3 }}</span>
                    </div>
                    <div v-if="faultDetailItem.param4" class="ss-fault-detail-dialog-param">
                      <span class="ss-param-label">{{ $t('shared.param4') }}：</span>
                      <span class="ss-param-value">{{ faultDetailItem.param4 }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane :label="$t('errorCodes.queryResult.moreInfo')" name="more">
              <div class="ss-fault-detail-dialog-content">
                <div v-if="faultDetailItem.detail" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('mobile.smartSearch.fieldDetail') }}</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.detail }}</div>
                </div>
                <div v-if="faultDetailItem.method" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('mobile.smartSearch.fieldMethod') }}</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.method }}</div>
                </div>
                <div v-if="faultDetailItem.category" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('mobile.smartSearch.fieldCategory') }}</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.category }}</div>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane :label="$t('errorCodes.queryResult.techSolution')" name="tech" v-loading="faultDetailTechLoading">
              <div class="ss-fault-detail-dialog-content">
                <div v-if="faultDetailTech?.tech_solution" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('mobile.smartSearch.fieldTechSolution') }}</div>
                  <pre class="ss-fault-detail-dialog-tech-text">{{ faultDetailTech.tech_solution }}</pre>
                </div>
                <div v-else class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-value">-</div>
                </div>
                <div v-if="(faultDetailTech?.images || []).length > 0" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">{{ $t('mobile.smartSearch.fieldAttachments') }}</div>
                  <div class="ss-fault-detail-dialog-attach-list">
                    <a
                      v-for="img in faultDetailTech.images"
                      :key="img.uid || img.url"
                      class="ss-fault-detail-dialog-attach"
                      :href="getGenericAttachmentProxyUrl(img.url)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ img.original_name || img.filename || img.url }}
                    </a>
                  </div>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="faultDetailDialogVisible = false">{{ $t('shared.close') }}</el-button>
          </span>
        </template>
      </el-dialog>

    </main>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { hasI18nKey } from '@/i18n'
import { getCurrentLocale, loadLocaleMessages } from '../i18n'
import { ArrowLeft, ArrowRight, ArrowDown, ArrowUp, Warning, Link, Files, DocumentCopy, ChatLineRound, Grid, Paperclip, Upload, Notebook, Cpu, Check, Plus, History, User, SwitchButton, Loading } from '@element-plus/icons-vue'
import GlobeIcon from '@/components/icons/GlobeIcon.vue'
import api from '@/api'
import SmartSearchKbAssetImg from '@/components/SmartSearchKbAssetImg.vue'
import MarkdownRenderer from '@/components/shared/MarkdownRenderer.vue'
import { useAgentSmartChat } from '@/composables/useAgentSmartChat'

const MAX_CONVERSATIONS = 5
const MAX_INPUT_CHARS = 150
const MAX_DRAFT_ATTACHMENTS = 5
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024
const MAX_ATTACHMENT_TOTAL_SIZE = 100 * 1024 * 1024
const SUPPORTED_ATTACHMENT_MIMES = new Set([
  'text/plain',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'image/jpeg',
  'image/png',
  'image/webp'
])
const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  '.medbot',
  '.txt',
  '.7z',
  '.zip',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp'
])
const RELAXED_TEXT_ATTACHMENT_EXTENSIONS = new Set([
  '.medbot',
  '.txt'
])
const RELAXED_TEXT_ATTACHMENT_MIMES = new Set([
  '',
  'text/plain',
  'application/octet-stream'
])

function nowIso () {
  return new Date().toISOString()
}

function shortId () {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
}

function getExtension (filename = '') {
  const name = String(filename || '')
  const idx = name.lastIndexOf('.')
  if (idx < 0) return ''
  return name.slice(idx).toLowerCase()
}

function getMimeFallbackExtension (mimeType = '') {
  const mime = String(mimeType || '').toLowerCase()
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'application/x-7z-compressed') return '.7z'
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return '.zip'
  if (mime === 'text/plain') return '.txt'
  return ''
}

function ensureFileName (file) {
  const original = String(file?.name || '').trim()
  if (original) return original
  const ext = getMimeFallbackExtension(file?.type)
  return `attachment-${Date.now()}${ext}`
}

function isSupportedAttachmentFile (file) {
  const mime = String(file?.type || '').trim().toLowerCase()
  const ext = getExtension(ensureFileName(file))
  if (!SUPPORTED_ATTACHMENT_EXTENSIONS.has(ext)) return false
  if (RELAXED_TEXT_ATTACHMENT_EXTENSIONS.has(ext)) {
    return RELAXED_TEXT_ATTACHMENT_MIMES.has(mime)
  }
  return SUPPORTED_ATTACHMENT_MIMES.has(mime)
}

function detectDraftAttachmentType (file) {
  const mime = String(file?.type || '').trim().toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

function formatAttachmentSizeText (size) {
  const bytes = Number(size || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeTitle (text, fallback = '') {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ')
  // 只取前10个字
  return normalized.length > 10 ? `${normalized.slice(0, 10)}` : (normalized || fallback)
}

export default {
  name: 'SmartSearchPage',
  components: { GlobeIcon, SmartSearchKbAssetImg, MarkdownRenderer },
  setup () {
    const store = useStore()
    const router = useRouter()
    const { t } = useI18n()
    const defaultConversationTitle = computed(() => t('smartSearch.newConversation'))
    const isDefaultConversationTitle = (title) => {
      return !title || title === '新对话' || title === defaultConversationTitle.value
    }
    const hasPermission = (permission) => store.getters['auth/hasPermission']?.(permission)
    const canAccessLogs = computed(() => hasPermission('log:read_all') || hasPermission('log:read_own'))

    const currentUser = computed(() => store.getters['auth/currentUser'])
    const userKey = computed(() => {
      const u = currentUser.value || {}
      return u.id || u.user_id || u.username || 'anonymous'
    })
    const {
      conversationId: agentConversationId,
      instanceId: agentInstanceId,
      llmProviderId: agentLlmProviderId,
      sending: agentSending,
      newConversation: agentNewConversation,
      sendText: agentSendText,
      listConversations: agentListConversations,
      loadConversation: agentLoadConversation,
      deleteConversation: agentDeleteConversation
    } = useAgentSmartChat({
      // Must match WS agentTaskStatusChange.userId (= auth user id), same as ExplanationTester
      getCurrentUserId: () => String(store.state.auth?.user?.id || '')
    })
    const storageKey = computed(() => `smartSearchHistory:${userKey.value}`)
    const llmProviderStorageKey = computed(() => `smartSearchLlmProvider:${userKey.value}`)

    const llmProviders = ref([])
    const llmProvidersLoading = ref(false)
    const llmProviderId = ref('')

    const anyLlmProviderAvailable = computed(() => {
      const list = Array.isArray(llmProviders.value) ? llmProviders.value : []
      return list.some(p => p && p.available)
    })
    const currentLlmProvider = computed(() => {
      return llmProviders.value.find(p => p && p.id === llmProviderId.value) || null
    })
    const currentProviderSupportsImageInput = computed(() => {
      return !!currentLlmProvider.value?.capabilities?.imageInput
    })
    const nextImageCapableProvider = computed(() => {
      const currentId = String(llmProviderId.value || '').trim()
      return llmProviders.value.find((provider) => {
        if (!provider || !provider.available) return false
        if (!provider?.capabilities?.imageInput) return false
        return String(provider.id || '').trim() !== currentId
      }) || null
    })

    // Used only for UI hint (avoid flashing before providers are loaded)
    const showLlmUnavailableHint = computed(() => {
      if (llmProvidersLoading.value) return false
      const list = Array.isArray(llmProviders.value) ? llmProviders.value : []
      if (list.length === 0) return false
      return !anyLlmProviderAvailable.value
    })

    const conversations = ref([])
    const activeConversationId = ref(null)
    const draft = ref('')
    const draftAttachments = ref([])
    const messagesEl = ref(null)
    const sidebarCollapsed = ref(false)
    const historyCollapsed = ref(false)
    const sending = ref(false)

    const sourceDrawerVisible = ref(false)
    const sourceDrawerType = ref('') // 'fault' | 'jira'
    const sourceDrawerItem = ref(null)
    const sourceDrawerMessage = ref(null) // 保存当前消息，用于显示来源列表
    const sourceDrawerLoading = ref(false)
    const sourceDrawerTech = ref(null)
    const faultTechSolutions = ref(new Map()) // Map<faultId, { tech_solution, images, loading }>
    const expandedSources = ref(new Set()) // 展开的来源 ref 集合
    // Jira issue detail cache for SmartSearch sources drawer (key -> issue detail)
    const jiraIssueCache = ref({}) // Record<string, issue>
    const jiraIssueLoading = ref({}) // Record<string, boolean>
    // MongoDB fault case detail cache for SmartSearch sources drawer (id -> faultCase detail)
    const mongoCaseCache = ref({}) // Record<string, faultCase>
    const mongoCaseLoading = ref({}) // Record<string, boolean>
    const faultDetailDialogVisible = ref(false)
    const faultDetailItem = ref(null)
    const faultDetailTech = ref(null)
    const faultDetailTechLoading = ref(false)
    const faultDetailActiveTab = ref('basic')

    const sourceDrawerTitle = computed(() => {
      const it = sourceDrawerItem.value || {}
      if (sourceDrawerType.value === 'fault') {
        return `${it.ref || ''} ${it.subsystem ? `${it.subsystem} - ` : ''}${it.code || ''}`.trim() || t('shared.faultCodeDetail')
      }
      if (sourceDrawerType.value === 'jira') {
        return `${it.ref || ''} ${it.key || ''}`.trim() || t('shared.jiraDetail')
      }
      return t('shared.details')
    })

    // Drawer case list always uses merged `sources.cases` (K1/K2...)

    const load = async () => {
      try {
        const list = await agentListConversations({ limit: 50 })
        conversations.value = (Array.isArray(list) ? list : []).map(conv => {
          const id = String(conv.instanceId || conv.id || '').trim()
          const updatedAt = conv.updatedAt || conv.createdAt || nowIso()
          return {
            id,
            instanceId: Number(conv.instanceId || conv.id || 0) || null,
            conversationId: String(conv.conversationId || '').trim(),
            instanceNo: Number(conv.instanceNo || 0) || null,
            status: String(conv.status || '').trim(),
            title: conv.title || defaultConversationTitle.value,
            updatedAt,
            createdAt: conv.createdAt || updatedAt,
            messages: []
          }
        }).filter(c => c.id)
        conversations.value.forEach(conv => {
          if (isDefaultConversationTitle(conv.title)) {
            const firstUserMsg = (conv.messages || []).find(m => m && m.role === 'user')
            if (firstUserMsg && firstUserMsg.content) {
              conv.title = normalizeTitle(firstUserMsg.content, defaultConversationTitle.value)
            }
          }
        })
      } catch (err) {
        console.error('[load] error:', err)
        conversations.value = []
      }
      // 默认显示新对话（空状态），不自动打开历史对话
      activeConversationId.value = null
    }

    const loadLlmProviders = async () => {
      llmProvidersLoading.value = true
      try {
        const resp = await api.smartSearch.getLlmProviders()
        const data = resp?.data || {}
        const list = Array.isArray(data.providers) ? data.providers : []
        llmProviders.value = list

        const stored = localStorage.getItem(llmProviderStorageKey.value) || ''
        // 优先使用用户之前的选择，否则默认选择 qwen-flash
        const qwenFlash = list.find(p => p && (p.id === 'qwen-flash' || p.id?.includes('qwen-flash')) && p.available)?.id || ''
        const firstAvailable = list.find(p => p && p.available)?.id || ''
        const fallback = stored || qwenFlash || data.defaultProviderId || firstAvailable || (list[0]?.id || '')

        llmProviderId.value = fallback || ''
        agentLlmProviderId.value = llmProviderId.value
        if (llmProviderId.value) {
          localStorage.setItem(llmProviderStorageKey.value, llmProviderId.value)
        }
      } catch (_) {
        const stored = localStorage.getItem(llmProviderStorageKey.value) || ''
        if (stored) llmProviderId.value = stored
        agentLlmProviderId.value = llmProviderId.value
      } finally {
        llmProvidersLoading.value = false
      }
    }

    const onLlmProviderChange = (id) => {
      llmProviderId.value = id
      agentLlmProviderId.value = llmProviderId.value
      const v = String(id || '').trim()
      if (v) localStorage.setItem(llmProviderStorageKey.value, v)
      else localStorage.removeItem(llmProviderStorageKey.value)
    }

    const currentLlmProviderLabel = computed(() => {
      const p = llmProviders.value.find(p => p.id === llmProviderId.value)
      return p ? (p.label || p.id) : (llmProvidersLoading.value ? t('smartSearch.llmProviderLoading') : t('smartSearch.llmProvider'))
    })

    // 语言切换逻辑
    const currentLocale = computed(() => getCurrentLocale())
    const currentLocaleLabel = computed(() => {
      const locale = currentLocale.value
      return locale === 'zh-CN' ? '中文' : 'English'
    })

    const handleLanguageChange = async (command) => {
      await loadLocaleMessages(command)
      // 强制刷新部分依赖 i18n 的计算属性或界面，如果需要的话
    }

    const persistConversation = async (conv) => {
      // Agent 会话由后端持久化；仅保留 mongo_ 旧路径兼容，非 mongo_（含 Agent ULID）直接跳过
      if (!conv) return
      if (!conv.id || !String(conv.id).startsWith('mongo_')) return

      try {
        // 提取 metadata（从最后一次 assistant 消息的 payload 中）
        const lastAssistantMsg = [...(conv.messages || [])].reverse().find(m => m && m.role === 'assistant')
        const payload = lastAssistantMsg?.payload || {}
        const metadata = {
          intent: payload?.recognized?.intent || null,
          llmProvider: payload?.meta?.llmProvider || llmProviderId.value || null,
          llmModel: payload?.meta?.llmModel || null
        }

        const convData = {
          title: conv.title || defaultConversationTitle.value,
          messages: conv.messages || [],
          metadata
        }

        const mongoId = conv.id.replace('mongo_', '')
        await api.smartSearch.updateConversation(mongoId, convData)
      } catch (err) {
        console.error('[persistConversation] Failed to save conversation to MongoDB:', err)
        if (err.response?.status === 503) {
          ElMessage.warning(t('smartSearch.messages.mongodbOfflineNotSaved'))
        } else if (err.response?.status >= 500) {
          ElMessage.warning(t('smartSearch.messages.serverErrorNotSaved'))
        }
      }
    }

    const activeConversation = computed(() => {
      if (!activeConversationId.value) return null
      return conversations.value.find(c => c.id === activeConversationId.value) || null
    })

    const activeMessages = computed(() => {
      return Array.isArray(activeConversation.value?.messages) ? activeConversation.value.messages : []
    })

    const activeConversationLockedNotice = computed(() => {
      const instance = activeConversation.value?.instance || null
      if (!instance || instance.continuable !== false) return ''
      return String(instance.inactiveNotice || t('shared.agent.inactiveInstanceFallback')).trim()
    })

    const questionCount = computed(() => {
      return activeMessages.value.filter(m => m && m.role === 'user').length
    })

    // 历史对话按时间分组
    const groupedConversations = computed(() => {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const groups = {
        today: [],
        yesterday: []
      }

      conversations.value.forEach(conv => {
        const convDate = new Date(conv.updatedAt || conv.createdAt || now.toISOString())
        if (convDate >= today) {
          groups.today.push(conv)
        } else if (convDate >= yesterday) {
          groups.yesterday.push(conv)
        }
      })

      return groups
    })

    const draftUploadingCount = computed(() => draftAttachments.value.filter(item => item.status === 'uploading').length)
    const readyDraftAttachments = computed(() => draftAttachments.value.filter(item => item.status === 'available'))
    const draftImageAttachments = computed(() => draftAttachments.value.filter(item => item.type === 'image'))
    const showImageCapabilityHint = computed(() => {
      return draftImageAttachments.value.length > 0 && !currentProviderSupportsImageInput.value
    })
    const canSend = computed(() => {
      if (sending.value || agentSending.value) return false
      if (draftUploadingCount.value > 0) return false
      if (activeConversationLockedNotice.value) return false
      return draft.value.trim().length > 0 || readyDraftAttachments.value.length > 0
    })

    const revokeDraftPreviewUrl = (attachment) => {
      const url = String(attachment?.localPreviewUrl || '').trim()
      if (url && url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(url)
        } catch (_) {}
      }
    }

    const clearDraftAttachments = () => {
      draftAttachments.value.forEach(revokeDraftPreviewUrl)
      draftAttachments.value = []
    }

    const updateDraftAttachment = (localId, patch) => {
      const idx = draftAttachments.value.findIndex(item => item.localId === localId)
      if (idx < 0) return
      draftAttachments.value.splice(idx, 1, {
        ...draftAttachments.value[idx],
        ...(patch || {})
      })
    }

    const createDraftAttachment = (file) => {
      const safeName = ensureFileName(file)
      const type = detectDraftAttachmentType(file)
      return {
        localId: shortId(),
        file,
        originalName: safeName,
        sizeBytes: Number(file?.size || 0),
        mimeType: String(file?.type || '').trim().toLowerCase(),
        type,
        progress: 0,
        status: 'draft',
        errorMessage: '',
        localPreviewUrl: type === 'image' ? URL.createObjectURL(file) : ''
      }
    }

    const uploadDraftAttachment = async (localId) => {
      const attachment = draftAttachments.value.find(item => item.localId === localId)
      if (!attachment || !attachment.file) return
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      updateDraftAttachment(localId, {
        status: 'uploading',
        progress: 0,
        errorMessage: '',
        abortController: controller
      })

      const formData = new FormData()
      formData.append('files', attachment.file, attachment.originalName)

      try {
        const resp = await api.agent.uploadAssets(formData, {
          signal: controller?.signal,
          onUploadProgress: (event) => {
            const total = Number(event?.total || 0)
            const loaded = Number(event?.loaded || 0)
            if (total > 0) {
              updateDraftAttachment(localId, {
                progress: Math.min(99, Math.max(1, Math.round((loaded / total) * 100)))
              })
            }
          }
        })
        const uploaded = Array.isArray(resp?.data?.attachments) ? resp.data.attachments[0] : null
        if (!uploaded) {
          throw new Error(t('shared.requestFailed'))
        }
        updateDraftAttachment(localId, {
          ...uploaded,
          progress: 100,
          status: 'available',
          abortController: null,
          errorMessage: ''
        })
      } catch (error) {
        const message = error?.name === 'CanceledError'
          ? t('shared.cancel')
          : (error?.response?.data?.message || error?.message || t('shared.requestFailed'))
        updateDraftAttachment(localId, {
          status: 'failed',
          progress: 0,
          abortController: null,
          errorMessage: message
        })
      }
    }

    const enqueueDraftFiles = async (files) => {
      const list = Array.from(files || []).filter(Boolean)
      if (list.length === 0) return

      if (draftAttachments.value.length + list.length > MAX_DRAFT_ATTACHMENTS) {
        ElMessage.warning(`最多上传 ${MAX_DRAFT_ATTACHMENTS} 个附件`)
        return
      }

      const currentTotal = draftAttachments.value
        .filter(item => item.status !== 'removed')
        .reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0)
      const nextTotal = list.reduce((sum, file) => sum + Number(file?.size || 0), currentTotal)
      if (nextTotal > MAX_ATTACHMENT_TOTAL_SIZE) {
        ElMessage.warning(`单条消息附件总大小不能超过 ${Math.round(MAX_ATTACHMENT_TOTAL_SIZE / (1024 * 1024))}MB`)
        return
      }

      const accepted = []
      for (const file of list) {
        if (!isSupportedAttachmentFile(file)) {
          ElMessage.warning(`文件类型不支持：${ensureFileName(file)}`)
          continue
        }
        if (Number(file?.size || 0) > MAX_ATTACHMENT_SIZE) {
          ElMessage.warning(`单个附件不能超过 ${Math.round(MAX_ATTACHMENT_SIZE / (1024 * 1024))}MB`)
          continue
        }
        const draftAttachment = createDraftAttachment(file)
        if (draftAttachment.type === 'image' && !currentProviderSupportsImageInput.value) {
          ElMessage.warning('当前模型不会解析图片，可上传后切换到支持图片的模型')
        }
        draftAttachments.value.push(draftAttachment)
        accepted.push(draftAttachment.localId)
      }

      for (const localId of accepted) {
        // 顺序上传，进度更稳定，也更容易匹配单卡片状态
        // eslint-disable-next-line no-await-in-loop
        await uploadDraftAttachment(localId)
      }
    }

    const handleComposerPaste = async (event) => {
      const items = Array.from(event?.clipboardData?.items || [])
      const files = items
        .filter(item => item && item.kind === 'file')
        .map(item => item.getAsFile())
        .filter(Boolean)
      if (files.length === 0) return
      event.preventDefault()
      await enqueueDraftFiles(files)
    }

    const removeDraftAttachment = (localId) => {
      const idx = draftAttachments.value.findIndex(item => item.localId === localId)
      if (idx < 0) return
      const current = draftAttachments.value[idx]
      try {
        current?.abortController?.abort?.()
      } catch (_) {}
      revokeDraftPreviewUrl(current)
      draftAttachments.value.splice(idx, 1)
    }

    const retryDraftAttachment = async (localId) => {
      await uploadDraftAttachment(localId)
    }

    const switchToImageCapableProvider = () => {
      if (!nextImageCapableProvider.value) return
      onLlmProviderChange(nextImageCapableProvider.value.id)
      ElMessage.success(`已切换到 ${nextImageCapableProvider.value.label || nextImageCapableProvider.value.id}`)
    }

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
      // 限制最多 5 个（前端显示限制，实际 MongoDB 中可保存更多）
      if (conversations.value.length > MAX_CONVERSATIONS) {
        conversations.value = conversations.value.slice(0, MAX_CONVERSATIONS)
      }
    }

    const ensureActiveConversation = () => {
      if (activeConversation.value) return activeConversation.value
      const conv = {
        id: shortId(),
        instanceId: null,
        conversationId: String(agentConversationId.value || '').trim(),
        title: defaultConversationTitle.value,
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
      const outboundAttachments = readyDraftAttachments.value.map(item => ({
        assetId: item.assetId,
        type: item.type,
        storage: item.storage,
        objectKey: item.objectKey,
        bucket: item.bucket,
        originalName: item.originalName,
        storedName: item.storedName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        sha256: item.sha256,
        uploaderId: item.uploaderId,
        source: item.source,
        previewUrl: item.previewUrl,
        url: item.url,
        width: item.width ?? null,
        height: item.height ?? null,
        status: item.status
      }))
      if (!text && outboundAttachments.length === 0) return
      if (text.length > MAX_INPUT_CHARS) {
        ElMessage.warning(t('smartSearch.maxInputChars', { max: MAX_INPUT_CHARS }))
        return
      }

      // 轮次上限由后端 SESSION_MAX_TURNS 控制实例滚动；达到上限时 instance.notice 会并入回复文案
      const conv = ensureActiveConversation()
      const userMsg = {
        id: shortId(),
        role: 'user',
        content: text,
        attachments: outboundAttachments,
        createdAt: nowIso()
      }
      conv.messages = [...(conv.messages || []), userMsg]
      // 首问生成标题
      if (isDefaultConversationTitle(conv.title)) conv.title = normalizeTitle(text, defaultConversationTitle.value)
      conv.updatedAt = nowIso()
      // 这里不要触发持久化，避免中途 id 变化导致后续找不到会话
      upsertConversation(conv)
      draft.value = ''
      clearDraftAttachments()

      // LLM 不可用：不发请求，直接提示 + 给三个入口卡片
      if (showLlmUnavailableHint.value) {
        conv.messages = [...(conv.messages || []), {
          id: shortId(),
          role: 'assistant',
          type: 'llm_unavailable',
          content: t('smartSearch.llmUnavailableDescription'),
          createdAt: nowIso()
        }]
        conv.updatedAt = nowIso()
        upsertConversation(conv)
        await persistConversation(conv)
        return
      }

      // 添加 loading 占位消息
      const loadingMsgId = shortId()
      const loadingMsg = {
        id: loadingMsgId,
        role: 'assistant',
        type: 'loading',
        content: '',
        createdAt: nowIso()
      }
      conv.messages = [...(conv.messages || []), loadingMsg]
      upsertConversation(conv)

      sending.value = true
      try {
        const result = await agentSendText(text, { attachments: outboundAttachments })
        const payload = {
          ...(result.payload || {}),
          answerText: result.assistantMode === 'direct_response'
            ? ''
            : String(result?.payload?.answerText || '')
        }
        const assistantMsg = {
          id: loadingMsgId, // 使用相同的 ID 替换 loading 消息
          role: 'assistant',
          type: 'search_result',
          content: '',
          payload,
          systemMessages: Array.isArray(result.systemMessages) ? result.systemMessages : [],
          createdAt: nowIso()
        }
        
      const conv2 = activeConversation.value
      if (conv2) {
        const resultInstanceId = Number(result?.session?.instanceId || agentInstanceId.value || 0)
        const agentCid = String(agentConversationId.value || '').trim()
        if (agentCid) {
          conv2.conversationId = agentCid
        }
        if (Number.isFinite(resultInstanceId) && resultInstanceId > 0 && String(conv2.id) !== String(resultInstanceId)) {
          const oldId = conv2.id
          conv2.id = String(resultInstanceId)
          conv2.instanceId = resultInstanceId
          if (activeConversationId.value === oldId) {
            activeConversationId.value = String(resultInstanceId)
          }
        }

        // 找到 loading 消息的索引并替换
        const loadingIndex = conv2.messages.findIndex(m => m.id === loadingMsgId)
        if (loadingIndex >= 0) {
          // 使用 splice 确保 Vue 响应式正常工作
          conv2.messages.splice(loadingIndex, 1, assistantMsg)
        } else {
          // 如果找不到，直接添加
          conv2.messages = [...(conv2.messages || []), assistantMsg]
        }
          
          // 如果没有查询到结果且意图匹配，则添加推荐卡片消息
          const intent = payload?.recognized?.intent
          const hasFaultCodes = (payload?.sources?.faultCodes || []).length > 0
          const hasCases = (payload?.sources?.cases || []).length > 0 || (payload?.sources?.jira || []).length > 0 || (payload?.sources?.faultCases || []).length > 0
          const hasKbDocs = (payload?.sources?.kbDocs || []).length > 0
          const hasAnyResults = hasFaultCodes || hasCases || hasKbDocs
          const hasNoQueryPointHint = String(payload?.answerText || '').includes('未识别到可用检索要点')
          
          if ((intent === 'find_case' || intent === 'troubleshoot') && !hasCases) {
            conv2.messages.push({
              id: shortId(),
              role: 'assistant',
              content: '',
              createdAt: nowIso(),
              recommendation: {
                type: 'fault_case',
                title: t('smartSearch.faultCaseQuery'),
                text: t('smartSearch.faultCaseQuerySubtitle'),
                path: '/dashboard/fault-cases'
              }
            })
          } else if (intent === 'lookup_fault_code' && !hasFaultCodes) {
            conv2.messages.push({
              id: shortId(),
              role: 'assistant',
              content: '',
              createdAt: nowIso(),
              recommendation: {
                type: 'fault_code',
                title: t('smartSearch.faultCodeQuery'),
                text: t('smartSearch.faultCodeQuerySubtitle'),
                path: '/dashboard/error-codes'
              }
            })
          } else if ((intent === 'how_to_use' || intent === 'definition' || intent === 'other' || hasNoQueryPointHint) && !hasAnyResults) {
            conv2.messages.push({
              id: shortId(),
              role: 'assistant',
              content: '',
              createdAt: nowIso(),
              recommendation: {
                type: 'multiple'
              }
            })
          }
          
        conv2.updatedAt = nowIso()
        upsertConversation(conv2)
        await persistConversation(conv2)
        }
      } catch (e) {
        const assistantMsg = { 
          id: loadingMsgId, // 使用相同的 ID 替换 loading 消息
          role: 'assistant', 
          content: t('shared.requestFailed'), 
          createdAt: nowIso() 
        }
        const conv2 = activeConversation.value
        if (conv2) {
          // 找到 loading 消息的索引并替换
          const loadingIndex = conv2.messages.findIndex(m => m.id === loadingMsgId)
          if (loadingIndex >= 0) {
            // 使用 splice 确保 Vue 响应式正常工作
            conv2.messages.splice(loadingIndex, 1, assistantMsg)
          } else {
            // 如果找不到，直接添加
            conv2.messages = [...(conv2.messages || []), assistantMsg]
          }
          conv2.updatedAt = nowIso()
          upsertConversation(conv2)
          await persistConversation(conv2)
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

    const normalizeAttachmentUrl = (url) => {
      const raw = String(url || '').trim()
      if (!raw) return ''
      if (raw.startsWith('static/')) return `/${raw}`
      return raw
    }

    // 通用附件代理 URL 函数（适用于所有类型的附件）
    // OSS 公网 URL 和本地静态资源 / 后端代理 URL 直接使用，Jira 附件使用代理
    const getGenericAttachmentProxyUrl = (url) => {
      const normalizedUrl = normalizeAttachmentUrl(url)
      if (!normalizedUrl) return ''
      // OSS 公网 URL 或后端代理 URL 直接使用，不需要代理
      if (!needsProxy(normalizedUrl)) {
        return normalizedUrl
      }
      // Jira 附件或其他需要代理的 URL 使用代理
      const token = store?.state?.auth?.token || ''
      const qs = new URLSearchParams()
      qs.set('url', normalizedUrl)
      // 后端 auth 中间件支持 GET query token，用于处理跨域和认证
      if (token) qs.set('token', token)
      return `/api/jira/attachment/proxy?${qs.toString()}`
    }

    const getImagePreviewList = (images) => {
      if (!Array.isArray(images)) return []
      return images.filter(img => isImageFile(img)).map(img => getGenericAttachmentProxyUrl(img.url))
    }

    const getImageIndex = (images, currentImg) => {
      if (!Array.isArray(images)) return 0
      const imageList = images.filter(img => isImageFile(img))
      return imageList.findIndex(img => (img.uid || img.url) === (currentImg.uid || currentImg.url))
    }

    const getUserMessageAttachmentImageSrc = (attachment) => {
      if (!attachment || attachment.type !== 'image') return ''
      const rawUrl = String(attachment.previewUrl || attachment.url || '').trim()
      if (!rawUrl) return ''
      return getGenericAttachmentProxyUrl(rawUrl)
    }

    const getUserMessageAttachments = (message) => {
      return Array.isArray(message?.attachments) ? message.attachments.filter(Boolean) : []
    }

    const getUserMessageImageAttachments = (message) => {
      return getUserMessageAttachments(message).filter(attachment => !!getUserMessageAttachmentImageSrc(attachment))
    }

    const getUserMessageFileAttachments = (message) => {
      return getUserMessageAttachments(message).filter(attachment => !getUserMessageAttachmentImageSrc(attachment))
    }

    const getMessageSystemMessages = (message) => {
      return Array.isArray(message?.systemMessages) ? message.systemMessages.filter(Boolean) : []
    }

    const systemMessageClass = (message) => {
      const kind = String(message?.kind || '').trim().toLowerCase()
      if (kind === 'instance_rollover') return 'is-rollover'
      if (kind === 'direct_response') return 'is-direct'
      return 'is-generic'
    }

    const getUserMessageAttachmentPreviewUrls = (message) => {
      return getUserMessageImageAttachments(message)
        .map(attachment => getUserMessageAttachmentImageSrc(attachment))
        .filter(Boolean)
    }

    const getUserMessageAttachmentPreviewIndex = (message, currentAttachment) => {
      const images = getUserMessageImageAttachments(message)
      return images.findIndex((attachment) => {
        const currentKey = currentAttachment?.assetId || currentAttachment?.objectKey || currentAttachment?.url
        const itemKey = attachment?.assetId || attachment?.objectKey || attachment?.url
        return itemKey === currentKey
      })
    }

    const hasUserMessageText = (message) => {
      return String(message?.content || '').trim().length > 0
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

    const openSourcesDrawer = (message) => {
      sourceDrawerMessage.value = message
      sourceDrawerVisible.value = true
      expandedSources.value.clear()
    }

    const openSourcesDrawerAndExpand = (message, ref) => {
      openSourcesDrawer(message)
      const r = String(ref || '').trim()
      if (!r) return
      // 自动展开并触发对应来源（Jira/Mongo）详情懒加载
      if (!expandedSources.value.has(r)) {
        toggleSourceExpanded(r)
      }
    }

    const findSourceItemByRef = (ref) => {
      const msg = sourceDrawerMessage.value
      const sources = msg?.payload?.sources || {}
      const cases = Array.isArray(sources.cases) ? sources.cases : []
      const jira = Array.isArray(sources.jira) ? sources.jira : []
      const faultCases = Array.isArray(sources.faultCases) ? sources.faultCases : []
      const kbDocs = Array.isArray(sources.kbDocs) ? sources.kbDocs : []

      const inCases = cases.find(x => x && x.ref === ref)
      if (inCases) return { kind: 'cases', item: inCases }
      const inJira = jira.find(x => x && x.ref === ref)
      if (inJira) return { kind: 'jira', item: inJira }
      const inFaultCases = faultCases.find(x => x && x.ref === ref)
      if (inFaultCases) return { kind: 'faultCases', item: inFaultCases }
      const inKbDocs = kbDocs.find(x => x && x.ref === ref)
      if (inKbDocs) return { kind: 'kbDocs', item: inKbDocs }
      return { kind: '', item: null }
    }

    const escapeHtml = (s) => {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    // 仅允许 <em> 高亮标签，避免 v-html 风险
    const sanitizeSnippet = (html) => {
      const raw = String(html || '')
      const OPEN = '___SS_EM_OPEN___'
      const CLOSE = '___SS_EM_CLOSE___'
      const withTokens = raw
        .replace(/<\s*em\s*>/gi, OPEN)
        .replace(/<\s*\/\s*em\s*>/gi, CLOSE)
      const escaped = escapeHtml(withTokens)
      return escaped
        .replaceAll(OPEN, '<em>')
        .replaceAll(CLOSE, '</em>')
    }

    const kbImageAssets = (kb) => {
      const fid = Number(kb?.fileId)
      if (!Number.isFinite(fid) || fid <= 0) return []
      const list = Array.isArray(kb?.assets) ? kb.assets : []
      return list.filter((a) => {
        if (!a || !a.id) return false
        const t = String(a.assetType || '').toLowerCase()
        const mt = String(a.mimeType || '').toLowerCase()
        return t === 'image' || mt.startsWith('image/')
      })
    }

    const ensureJiraIssueLoaded = async (key, fallback = {}) => {
      const k = String(key || '').trim()
      if (!k) return
      if (jiraIssueLoading.value[k]) return
      if (jiraIssueCache.value[k] && jiraIssueCache.value[k]._loaded) return

      jiraIssueLoading.value = { ...jiraIssueLoading.value, [k]: true }
      // Put fallback first so UI has something to render immediately
      jiraIssueCache.value = {
        ...jiraIssueCache.value,
        [k]: { ...(fallback || {}), ...(jiraIssueCache.value[k] || {}), key: k }
      }

      try {
        const resp = await api.jira.getIssue(k)
        const issue = resp?.data?.issue || null
        if (issue) {
          jiraIssueCache.value = {
            ...jiraIssueCache.value,
            [k]: { ...(fallback || {}), ...(jiraIssueCache.value[k] || {}), ...issue, key: k, _loaded: true }
          }
        } else {
          jiraIssueCache.value = {
            ...jiraIssueCache.value,
            [k]: { ...(jiraIssueCache.value[k] || {}), _loaded: true }
          }
        }
      } catch (_) {
        // keep best-effort fallback
        jiraIssueCache.value = {
          ...jiraIssueCache.value,
          [k]: { ...(jiraIssueCache.value[k] || {}), _loaded: true }
        }
      } finally {
        jiraIssueLoading.value = { ...jiraIssueLoading.value, [k]: false }
      }
    }

    const getJiraCase = (item) => {
      const key = String(item?.key || item?.jira_key || '').trim()
      if (key && jiraIssueCache.value[key]) {
        return { ...(item || {}), ...(jiraIssueCache.value[key] || {}) }
      }
      return item || {}
    }

    const ensureMongoCaseLoaded = async (id, fallback = {}) => {
      const k = String(id || '').trim()
      if (!k) return
      if (mongoCaseLoading.value[k]) return
      if (mongoCaseCache.value[k] && mongoCaseCache.value[k]._loaded) return

      mongoCaseLoading.value = { ...mongoCaseLoading.value, [k]: true }
      // Put fallback first so UI has something to render immediately
      mongoCaseCache.value = {
        ...mongoCaseCache.value,
        [k]: { ...(fallback || {}), ...(mongoCaseCache.value[k] || {}), id: k }
      }

      try {
        const resp = await api.faultCases.get(k)
        const fc = resp?.data?.faultCase || null
        if (fc) {
          mongoCaseCache.value = {
            ...mongoCaseCache.value,
            [k]: { ...(fallback || {}), ...(mongoCaseCache.value[k] || {}), ...fc, id: k, _loaded: true }
          }
        } else {
          mongoCaseCache.value = {
            ...mongoCaseCache.value,
            [k]: { ...(mongoCaseCache.value[k] || {}), _loaded: true }
          }
        }
      } catch (_) {
        // keep best-effort fallback
        mongoCaseCache.value = {
          ...mongoCaseCache.value,
          [k]: { ...(mongoCaseCache.value[k] || {}), _loaded: true }
        }
      } finally {
        mongoCaseLoading.value = { ...mongoCaseLoading.value, [k]: false }
      }
    }

    // Auto-fetch MongoDB fault case detail for cases in the latest search result (so answer "来源区" can show full fields)
    const prefetchedMongoCaseIds = new Set()
    watch(() => activeMessages.value.length, () => {
      const last = activeMessages.value[activeMessages.value.length - 1]
      if (!last || last.type !== 'search_result' || !last.payload || !last.payload.ok) return
      const cases = last.payload?.sources?.cases || []
      for (const c of cases) {
        if (!c || c.type !== 'mongo') continue
        const id = String(c.id || c.fault_case_id || c._id || '').trim()
        if (!id) continue
        if (prefetchedMongoCaseIds.has(id)) continue
        prefetchedMongoCaseIds.add(id)
        // fire and forget
        ensureMongoCaseLoaded(id, c)
      }
    })

    const getMongoCase = (item) => {
      const id = String(item?.id || item?._id || item?.fault_case_id || '').trim()
      if (id && mongoCaseCache.value[id]) {
        return { ...(item || {}), ...(mongoCaseCache.value[id] || {}), id }
      }
      return item || {}
    }

    const isComplaintProjectByCase = (item) => {
      const it = getJiraCase(item)
      const projectName = it.projectName || ''
      const projectKey = it.projectKey || ''
      return String(projectName).includes('客诉') || String(projectKey).toUpperCase().includes('COMPLAINT') || String(projectKey).toUpperCase().includes('KS')
    }

    const isImageAttachment = (attachment) => {
      const filename = attachment?.filename || attachment?.original_name || ''
      const mimeType = attachment?.mimeType || attachment?.mime_type || ''
      const supportedImageTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'image/bmp', 'image/webp', 'image/svg+xml'
      ]
      const isImageByMime = supportedImageTypes.includes(String(mimeType).toLowerCase())
      const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i
      const isImageByExtension = imageExtensions.test(filename)
      return isImageByMime || isImageByExtension
    }

    const getAttachmentUrl = (attachment) => {
      return attachment?.content || attachment?.url || ''
    }

    // 获取附件代理 URL（适用于所有文件类型，包括图片和非图片）
    const getAttachmentProxyUrl = (attachment) => {
      const raw = getAttachmentUrl(attachment)
      if (!raw) return ''
      const token = store?.state?.auth?.token || ''
      const qs = new URLSearchParams()
      qs.set('url', raw)
      // 后端 auth 中间件支持 GET query token，用于处理跨域和认证
      if (token) qs.set('token', token)
      return `/api/jira/attachment/proxy?${qs.toString()}`
    }

    const getJiraImageSrc = (img) => {
      return getAttachmentProxyUrl(img)
    }

    const getJiraImageAttachments = (item) => {
      const it = getJiraCase(item)
      const atts = Array.isArray(it.attachments) ? it.attachments : []
      return atts.filter(att => getAttachmentUrl(att) && isImageAttachment(att))
    }

    const getJiraFileAttachments = (item) => {
      const it = getJiraCase(item)
      const atts = Array.isArray(it.attachments) ? it.attachments : []
      return atts.filter(att => !isImageAttachment(att))
    }

    const getJiraImagePreviewUrls = (item) => {
      return getJiraImageAttachments(item).map(img => getJiraImageSrc(img)).filter(Boolean)
    }

    const getJiraImageIndex = (item, img) => {
      return getJiraImageAttachments(item).findIndex(x => x?.id === img?.id)
    }

    const downloadJiraFile = (file) => {
      const rawUrl = getAttachmentUrl(file)
      if (!rawUrl) {
        console.warn('附件缺少 content URL:', file)
        ElMessage.warning(t('shared.messages.invalidAttachmentLink'))
        return
      }
      
      // 使用后端代理 URL，解决跨域和认证问题（适用于未连接 JIRA 的情况）
      const proxyUrl = getAttachmentProxyUrl(file)
      try {
        const link = document.createElement('a')
        link.href = proxyUrl
        link.download = file.filename || 'attachment'
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch (error) {
        console.warn('文件下载失败:', error)
        // 降级：尝试使用原始 URL（可能失败）
        try {
          window.open(proxyUrl, '_blank')
        } catch (fallbackError) {
          console.error('降级下载也失败:', fallbackError)
          ElMessage.error(t('shared.messages.downloadFailedCheckNetwork'))
        }
      }
    }

    // MongoDB 附件处理函数
    const getMongoAttachmentUrl = (attachment) => {
      // MongoDB 附件可能是对象（有 url 字段）或字符串（直接是 URL）
      if (typeof attachment === 'string') return attachment
      return attachment?.url || attachment?.content || ''
    }

    // 判断 URL 是否需要代理（Jira 附件需要代理，OSS 公网 URL 和本地代理 URL 不需要）
    const needsProxy = (url) => {
      if (!url) return false
      const urlStr = normalizeAttachmentUrl(url)
      // OSS 公网 URL（https:// 或 http://）不需要代理
      if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        return false
      }
      // 本地静态资源不需要代理
      if (urlStr.startsWith('/static/')) {
        return false
      }
      // 后端代理 URL（/api/oss/）不需要代理
      if (urlStr.startsWith('/api/oss/')) {
        return false
      }
      // 其他 URL（Jira 附件、相对路径等）需要代理
      return true
    }

    // 获取 MongoDB 附件 URL（OSS 直接使用，其他使用代理）
    const getMongoAttachmentProxyUrl = (attachment) => {
      const raw = getMongoAttachmentUrl(attachment)
      if (!raw) return ''
      // OSS 公网 URL 或后端代理 URL 直接使用，不需要代理
      if (!needsProxy(raw)) {
        return raw
      }
      // 其他 URL（如相对路径）使用代理
      const token = store?.state?.auth?.token || ''
      const qs = new URLSearchParams()
      qs.set('url', raw)
      // 后端 auth 中间件支持 GET query token，用于处理跨域和认证
      if (token) qs.set('token', token)
      return `/api/jira/attachment/proxy?${qs.toString()}`
    }

    const getMongoImageSrc = (img) => {
      return getMongoAttachmentProxyUrl(img)
    }

    const getMongoImageAttachments = (item) => {
      const it = item || {}
      const attachments = []
      if (Array.isArray(it.attachments)) attachments.push(...it.attachments)
      // 兼容历史字段：url 可能直接存 OSS 路径
      if (it.url && isImageFile({ filename: it.url, url: it.url })) {
        attachments.push({ url: it.url, filename: it.url })
      }
      return attachments.filter(att => {
        const url = getMongoAttachmentUrl(att)
        if (!url) return false
        const filename = att?.original_name || att?.filename || att?.name || url
        return isImageAttachment({ ...(att || {}), filename })
      })
    }

    const getMongoFileAttachments = (item) => {
      const it = item || {}
      const attachments = []
      if (Array.isArray(it.attachments)) attachments.push(...it.attachments)
      // 兼容历史字段：url 可能直接存 OSS 路径
      if (it.url && !isImageFile({ filename: it.url, url: it.url })) {
        attachments.push({ url: it.url, filename: it.url })
      }
      return attachments.filter(att => {
        const url = getMongoAttachmentUrl(att)
        if (!url) return false
        const filename = att?.original_name || att?.filename || att?.name || url
        return !isImageAttachment({ ...(att || {}), filename })
      })
    }

    const getMongoImagePreviewUrls = (item) => {
      return getMongoImageAttachments(item).map(img => getMongoImageSrc(img)).filter(Boolean)
    }

    const getMongoImageIndex = (item, img) => {
      return getMongoImageAttachments(item).findIndex(x => {
        const xUrl = getMongoAttachmentUrl(x)
        const imgUrl = getMongoAttachmentUrl(img)
        return xUrl === imgUrl || (x.uid && img.uid && x.uid === img.uid)
      })
    }

    const downloadMongoFile = (file) => {
      const rawUrl = getMongoAttachmentUrl(file)
      if (!rawUrl) {
        console.warn('附件缺少 URL:', file)
        ElMessage.warning(t('shared.messages.invalidAttachmentLink'))
        return
      }
      
      // 使用后端代理 URL，解决跨域和认证问题
      const proxyUrl = getMongoAttachmentProxyUrl(file)
      try {
        const link = document.createElement('a')
        link.href = proxyUrl
        link.download = file.filename || file.name || 'attachment'
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch (error) {
        console.warn('文件下载失败:', error)
        // 降级：尝试使用原始 URL（可能失败）
        try {
          window.open(proxyUrl, '_blank')
        } catch (fallbackError) {
          console.error('降级下载也失败:', fallbackError)
          ElMessage.error(t('shared.messages.downloadFailedCheckNetwork'))
        }
      }
    }

    const toggleSourceExpanded = (ref) => {
      if (expandedSources.value.has(ref)) {
        expandedSources.value.delete(ref)
      } else {
        expandedSources.value.add(ref)
        // If this is a Jira item, fetch full issue detail (same as JiraFaultCases preview)
        const { item } = findSourceItemByRef(ref)
        const isJira = item && (item.type === 'jira' || item.key)
        const key = isJira ? String(item.key || item.jira_key || '').trim() : ''
        if (key) ensureJiraIssueLoaded(key, item)

        // If this is a MongoDB fault case item, fetch full detail on demand
        const isMongo = item && (item.type === 'mongo' || item.source === 'mongo' || item.id)
        const mongoId = isMongo ? String(item.id || item.fault_case_id || item._id || '').trim() : ''
        if (mongoId) ensureMongoCaseLoaded(mongoId, item)
      }
    }

    const handleJiraJump = (url) => {
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        console.warn('JIRA URL is missing')
      }
    }

    const handleJiraJumpByKey = (key) => {
      if (key) {
        // 尝试从环境变量或配置中获取 JIRA base URL，如果没有则使用默认格式
        // 这里假设 URL 格式为：https://your-jira-domain.atlassian.net/browse/KEY
        // 或者让用户配置
        const baseUrl = import.meta.env.VITE_JIRA_BASE_URL || ''
        if (baseUrl) {
          const url = `${baseUrl}/browse/${encodeURIComponent(key)}`
          window.open(url, '_blank', 'noopener,noreferrer')
        } else {
          console.warn('JIRA base URL is not configured, cannot build URL from key:', key)
        }
      }
    }

    const copyAnswerText = async (message) => {
      if (!message || !message.payload) return
      
      const parts = []
      const payload = message.payload
      
      // 识别到的查询要点
      if (payload.recognized) {
        const rec = payload.recognized
        const queryPoints = []
        if (rec.intent) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.intent')}：${getIntentLabel(rec.intent)}`)
        }
        if (rec.fullCodes?.length) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.faultCode')}：${rec.fullCodes.join(' / ')}`)
        } else if (rec.typeCodes?.length) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.faultType')}：${rec.typeCodes.join(' / ')}`)
        }
        if (rec.keywords?.length) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.keywords')}：${rec.keywords.join(' / ')}`)
        }
        if (rec.symptom?.length) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.symptom')}：${rec.symptom.join(' / ')}`)
        }
        if (rec.trigger?.length) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.trigger')}：${rec.trigger.join(' / ')}`)
        }
        if (rec.component?.length) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.component')}：${rec.component.join(' / ')}`)
        }
        if (rec.neg?.length) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.negative')}：${rec.neg.join(' / ')}`)
        }
        if (rec.days) {
          queryPoints.push(`${t('mobile.smartSearch.recognized.lookbackDays')}：${rec.days} ${t('mobile.smartSearch.dayUnit')}`)
        }
        if (queryPoints.length > 0) {
          parts.push(t('mobile.smartSearch.recognized.title'))
          parts.push(queryPoints.join('\n'))
          parts.push('')
        }
      }
      
      // 故障码详情仅在「来源」抽屉中展示，复制时不附带解析区块

      // 相似案例（统一 sources.cases / K 序号）
      if (payload.sources?.cases?.length > 0) {
        parts.push(t('mobile.smartSearch.sectionSimilarCases'))
        payload.sources.cases.forEach(c => {
          if (c?.type === 'jira') {
            parts.push(`${c.key}${c.summary ? `：${c.summary}` : ''} [${c.ref}]`)
          } else {
            const title = c.title || c.id || '-'
            parts.push(`${title}${c.jira_key ? `（Jira：${c.jira_key}）` : ''} [${c.ref}]`)
          }
        })
        parts.push('')
      } else if (payload.sources?.jira?.length > 0) {
        // 兼容旧数据：没有 cases 时回退到 jira
        parts.push(t('mobile.smartSearch.sectionSimilarCases'))
        payload.sources.jira.forEach(j => {
          parts.push(`${j.key}${j.summary ? `：${j.summary}` : ''} [${j.ref}]`)
        })
        parts.push('')
      }
      
      const text = parts.join('\n').trim()
      
      try {
        await navigator.clipboard.writeText(text)
        ElMessage.success(t('smartSearch.messages.copyAnswerSuccess'))
      } catch (err) {
        // 降级方案
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        try {
          document.execCommand('copy')
          ElMessage.success(t('smartSearch.messages.copyAnswerSuccess'))
        } catch (e) {
          ElMessage.error(t('smartSearch.messages.copyFailedManual'))
        }
        document.body.removeChild(textarea)
      }
    }

    const openFaultDetailDialog = async (faultItem) => {
      faultDetailItem.value = faultItem
      faultDetailDialogVisible.value = true
      faultDetailTech.value = null
      faultDetailTechLoading.value = false
      faultDetailActiveTab.value = 'basic'

      const id = faultItem?.id
      if (!id) return
      faultDetailTechLoading.value = true
      try {
        const resp = await api.errorCodes.getTechSolution(id)
        faultDetailTech.value = resp?.data || null
      } catch (_) {
        faultDetailTech.value = null
      } finally {
        faultDetailTechLoading.value = false
      }
    }

    const startNewConversation = () => {
      agentNewConversation()
      activeConversationId.value = null
      draft.value = ''
      clearDraftAttachments()
    }

    const selectConversation = async (id) => {
      activeConversationId.value = id
      draft.value = ''
      clearDraftAttachments()

      if (!id) return
      try {
        const session = await agentLoadConversation(id)
        const idx = conversations.value.findIndex(c => c.id === id)
        if (idx >= 0) {
          conversations.value[idx] = {
            ...conversations.value[idx],
            instanceId: Number(id || 0) || conversations.value[idx].instanceId || null,
            conversationId: String(agentConversationId.value || conversations.value[idx].conversationId || '').trim(),
            instance: session?.instance || null,
            messages: (Array.isArray(session?.messages) ? session.messages : []).map((m, i) => ({
              id: m.id || `${id}_${i}`,
              role: m.role,
              content: m.content || '',
              attachments: Array.isArray(m.attachments) ? m.attachments : [],
              type: m.role === 'assistant' ? 'search_result' : undefined,
              payload: m.payload,
              createdAt: m.createdAt || nowIso()
            }))
          }
        }
      } catch (err) {
        console.error('[selectConversation] Failed to load conversation:', err)
      }
    }

    const deleteConversation = async (id) => {
      try {
        await agentDeleteConversation(id)
      } catch (err) {
        console.error('[deleteConversation] Failed to delete conversation:', err)
        ElMessage.error(err?.response?.data?.message || err?.message || t('shared.requestFailed'))
        return
      }
      const nextList = conversations.value.filter(c => c.id !== id)
      conversations.value = nextList
      
      if (activeConversationId.value === id) {
        activeConversationId.value = nextList[0]?.id || null
        if (!activeConversationId.value) {
          agentNewConversation()
        } else {
          await selectConversation(activeConversationId.value)
        }
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

    const goFaultCaseDetail = (id) => {
      const s = String(id || '').trim()
      if (!s) return
      router.push(`/dashboard/fault-cases/${encodeURIComponent(s)}`)
    }

    const goBackToDashboard = () => {
      router.push(canAccessLogs.value ? '/dashboard/logs' : '/dashboard/account')
    }

    const handleUserCommand = async (command) => {
      if (command === 'logout') {
        try {
          await ElMessageBox.confirm(
            t('shared.messages.confirmLogout'),
            t('shared.info'),
            {
              confirmButtonText: t('shared.confirm'),
              cancelButtonText: t('shared.cancel'),
              type: 'warning'
            }
          )
          store.dispatch('auth/logout')
          router.push('/login')
        } catch {
          // 用户取消
        }
      } else if (command === 'profile') {
        router.push('/dashboard/account')
      }
    }

    const getRoleDisplayName = (role) => {
      if (!role) return ''
      const roleMap = {
        admin: t('users.roleAdmin'),
        expert: t('users.roleExpert'),
        user: t('users.roleUser')
      }
      return roleMap[role] || role
    }

    const handleQuickAction = (action) => {
      if (action === 'fault_code') {
        router.push('/dashboard/error-codes')
      } else if (action === 'upload') {
        router.push('/dashboard/logs')
      } else if (action === 'fault_case') {
        router.push('/dashboard/fault-cases')
      } else if (action === 'analyze500') {
        draft.value = t('smartSearch.quickActionAnalyze500')
      } else if (action === 'slowQueries') {
        draft.value = t('smartSearch.quickActionSlowQueries')
      }
    }

    const navigateTo = (path) => {
      router.push(path)
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

    const formatDateTime = (iso) => {
      if (!iso) return ''
      try {
        const d = new Date(iso)
        return d.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
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

    const formatAttachmentSize = (size) => formatAttachmentSizeText(size)

    const draftAttachmentCardStyle = (attachment) => {
      const status = String(attachment?.status || '').trim().toLowerCase()
      if (status === 'draft') {
        return { opacity: 0.5 }
      }
      if (status === 'failed') {
        return { opacity: 0.5 }
      }
      if (status === 'uploading') {
        const progress = Math.min(100, Math.max(0, Number(attachment?.progress || 0)))
        return { opacity: `${0.5 + (progress / 100) * 0.5}` }
      }
      return { opacity: 1 }
    }

    const getIntentLabel = (intent) => {
      const key = `smartSearch.intent.${intent}`
      return hasI18nKey(key) ? t(key) : (intent || t('shared.unknown'))
    }

    /**
     * 开启生成时默认不展示 Knowledge 片段；生成失败、无 generation、或 answer 为空时仍展示片段（与后端 answerText 回退逻辑一致）。
     */
    const showKbSnippetListInAnswer = (payload) => {
      if (!payload?.meta?.kbGenerate) return true
      const g = payload?.meta?.kbGeneration
      if (!g || g.error) return true
      if (!String(g.answer || '').trim()) return true
      return false
    }

    /** 模型生成成功时不展示「回答」标题，正文即生成内容 */
    const showAnswerSectionTitle = (payload) => {
      const g = payload?.meta?.kbGeneration
      if (payload?.meta?.kbGenerate && g && !g.error && String(g.answer || '').trim()) return false
      return true
    }

    const formatKbTokenUsage = (u) => {
      if (!u || typeof u !== 'object') return '—'
      const pt = u.prompt_tokens ?? u.promptTokens
      const ct = u.completion_tokens ?? u.completionTokens
      const tt = u.total_tokens ?? u.totalTokens
      const parts = []
      if (pt != null) parts.push(`输入 ${pt}`)
      if (ct != null) parts.push(`输出 ${ct}`)
      if (tt != null) parts.push(`合计 ${tt}`)
      return parts.length ? parts.join('，') : JSON.stringify(u)
    }

    // 根据模型 ID 或 label 获取对应的 SVG 图标路径
    const getModelIcon = (provider) => {
      if (!provider) return null
      const id = String(provider.id || '').toLowerCase()
      const label = String(provider.label || '').toLowerCase()
      
      // 匹配规则：优先匹配 ID，其次匹配 label
      const iconMap = {
        'gpt-4': '/Icons/svg/gpt-4.svg',
        'gpt-3.5': '/Icons/svg/gpt-35.svg',
        'gpt': '/Icons/svg/gpt-4.svg',
        'claude': '/Icons/svg/claude.svg',
        'gemini': '/Icons/svg/gemini.svg',
        'qwen': '/Icons/svg/qwen.svg',
        'deepseek': '/Icons/svg/deepseek.svg',
        'moonshot': '/Icons/svg/moonshot.svg',
        'spark': '/Icons/svg/spark.svg',
        'skylark': '/Icons/svg/skylark.svg',
        'llama': '/Icons/svg/llama.svg',
        'glm': '/Icons/svg/glm.svg',
        'baichuan': '/Icons/svg/baichuan.svg',
        'hunyuan': '/Icons/svg/hunyuan.svg',
        'new-bing': '/Icons/svg/new-bing.svg',
        'midjourney': '/Icons/svg/midjourney.svg',
        'stable-diffusion': '/Icons/svg/stable-diffusion.svg',
        'kimi': '/Icons/svg/moonshot.svg'
      }
      
      // 尝试匹配 ID
      for (const [key, path] of Object.entries(iconMap)) {
        if (id.includes(key)) {
          return path
        }
      }
      
      // 尝试匹配 label
      for (const [key, path] of Object.entries(iconMap)) {
        if (label.includes(key)) {
          return path
        }
      }
      
      // 默认返回 null，使用默认图标
      return null
    }

    const currentModelIcon = computed(() => {
      const provider = llmProviders.value.find(p => p.id === llmProviderId.value)
      return getModelIcon(provider)
    })

    const noop = () => {}

    const toggleSidebar = () => {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }

    const toggleHistoryCollapsed = () => {
      historyCollapsed.value = !historyCollapsed.value
    }

    onMounted(() => {
      load()
      loadLlmProviders()
      scrollToBottom()
    })

    onUnmounted(() => {
      clearDraftAttachments()
    })

    return {
      conversations,
      activeConversationId,
      activeConversation,
      activeMessages,
      activeConversationLockedNotice,
      questionCount,
      groupedConversations,
      draft,
      draftAttachments,
      canSend,
      sending,
      draftUploadingCount,
      messagesEl,
      MAX_INPUT_CHARS,
      currentUser,
      llmProviders,
      llmProvidersLoading,
      llmProviderId,
      onLlmProviderChange,
      currentLlmProviderLabel,
      nextImageCapableProvider,
      showImageCapabilityHint,
      showLlmUnavailableHint,
      currentModelIcon,
      getModelIcon,
      currentLocale,
      currentLocaleLabel,
      handleLanguageChange,
      sidebarCollapsed,
      historyCollapsed,
      sourceDrawerVisible,
      sourceDrawerType,
      sourceDrawerItem,
      sourceDrawerMessage,
      sourceDrawerLoading,
      sourceDrawerTech,
      sourceDrawerTitle,
      faultTechSolutions,
      expandedSources,
      jiraIssueCache,
      jiraIssueLoading,
      mongoCaseLoading,
      getJiraCase,
      getMongoCase,
      isComplaintProjectByCase,
      getJiraImageAttachments,
      getJiraFileAttachments,
      getJiraImagePreviewUrls,
      getJiraImageIndex,
      getJiraImageSrc,
      downloadJiraFile,
      getMongoImageAttachments,
      getMongoFileAttachments,
      getMongoImagePreviewUrls,
      getMongoImageIndex,
      getMongoImageSrc,
      downloadMongoFile,
      faultDetailDialogVisible,
      faultDetailItem,
      faultDetailTech,
      faultDetailTechLoading,
      faultDetailActiveTab,
      loadTechSolution,
      isImageFile,
      getImagePreviewList,
      getImageIndex,
      getUserMessageAttachmentImageSrc,
      getUserMessageImageAttachments,
      getUserMessageFileAttachments,
      getMessageSystemMessages,
      systemMessageClass,
      getUserMessageAttachmentPreviewUrls,
      getUserMessageAttachmentPreviewIndex,
      hasUserMessageText,
      formatAttachmentSize,
      draftAttachmentCardStyle,
      handleComposerPaste,
      removeDraftAttachment,
      retryDraftAttachment,
      switchToImageCapableProvider,
      ArrowLeft,
      ArrowRight,
      ArrowDown,
      ArrowUp,
      Warning,
      Link,
      Files,
      ChatLineRound,
      Grid,
      Paperclip,
      Loading,
      send,
      openSource,
      openSourcesDrawer,
      openSourcesDrawerAndExpand,
      toggleSourceExpanded,
      openFaultDetailDialog,
      handleJiraJump,
      handleJiraJumpByKey,
      handleUserCommand,
      getRoleDisplayName,
      copyAnswerText,
      startNewConversation,
      selectConversation,
      deleteConversation,
      goClassicPanel,
      goErrorCodes,
      goFaultCases,
      goFaultCaseDetail,
      goBackToDashboard,
      handleQuickAction,
      formatTime,
      formatDateTime,
      formatShortTime,
      formatLlmRaw,
      getIntentLabel,
      showKbSnippetListInAnswer,
      showAnswerSectionTitle,
      formatKbTokenUsage,
      sanitizeSnippet,
      kbImageAssets,
      toggleSidebar,
      toggleHistoryCollapsed,
      navigateTo,
      noop
    }
  }
}
</script>

<style scoped>
.ss-page {
  --agent-msg-user-bg: #f2f4f7;
  --agent-msg-user-border: #e4e7ec;
  --agent-msg-user-text: #101828;
  --agent-msg-user-attachment-bg: #ffffff;
  --agent-msg-user-attachment-border: #e4e7ec;
  height: 100vh;
  display: flex;
  background: var(--black-white-white);
}

.ss-history {
  background: var(--smart-search-sidebar-background-color) !important;
  border-right: 1px solid var(--el-aside-border-color);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.ss-history.is-collapsed {
  width: 80px;
}

.logo {
  height: var(--logo-area-height);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--smart-search-sidebar-background-color);
  color: var(--el-menu-text-color);
  border-bottom: 1px solid var(--el-aside-border-color);
  padding: 0 var(--logo-area-padding);
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.logo.is-collapsed {
  cursor: pointer;
}

.logo-text {
  height: var(--logo-size);
  width: auto;
}

.logo-icon-svg {
  width: var(--logo-size);
  height: var(--logo-size);
}

.ss-collapse-btn {
  position: absolute;
  right: 8px;
  color: var(--gray-400);
}

.logo.is-collapsed .ss-collapse-btn {
  position: absolute;
  right: auto;
  left: 50%;
  transform: translateX(-50%);
}

.logo.is-collapsed .logo-icon-svg {
  transition: opacity 0.2s;
}

.logo.is-collapsed .ss-collapse-btn-hover {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  position: absolute;
  right: auto;
  left: 50%;
  transform: translateX(-50%);
}

.logo.is-collapsed:hover .logo-icon-svg {
  opacity: 0;
}

.logo.is-collapsed:hover .ss-collapse-btn-hover {
  opacity: 1;
  pointer-events: auto;
}

.ss-new-conv-container {
  padding: 16px;
  flex-shrink: 0;
}

.ss-new-conv-container.is-collapsed {
  padding: 16px 8px;
  display: flex;
  justify-content: center;
}

.ss-new-conv-btn {
  width: 100%;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
  background: var(--black-white-white) !important;
  color: var(--gray-900) !important;
  border: 1px solid var(--gray-200) !important;
}

.ss-new-conv-btn:hover {
  background: var(--gray-50) !important;
  border-color: var(--gray-300) !important;
}

.is-collapsed .ss-new-conv-btn {
  width: 40px;
  padding: 0;
  justify-content: center;
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
  overflow-y: auto;
  flex: 1;
}

.ss-menu-section {
  border-top: 1px solid var(--gray-200);
}

.ss-menu-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.15s;
  font-size: 14px;
  color: var(--gray-700);
  gap: 12px;
}

.ss-menu-item:hover {
  background-color: var(--gray-100);
  color: var(--gray-900);
}

.ss-menu-item .el-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.ss-menu-item-text {
  flex: 1;
  font-weight: 500;
}

.ss-menu-arrow {
  width: 14px;
  height: 14px;
  transition: transform 0.2s;
  color: var(--gray-400);
}

.ss-menu-arrow.collapsed {
  transform: rotate(-90deg);
}

.ss-history-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ss-history-empty {
  padding: 12px 16px 12px 46px;
  font-size: 12px;
  color: var(--gray-500);
}

.ss-history-list {
  padding: 4px 0;
  display: flex;
  flex-direction: column;
}

.ss-history-group {
  margin-bottom: 8px;
}

.ss-history-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 8px 46px;
  cursor: pointer;
  user-select: none;
}

.ss-history-group-arrow {
  font-size: 12px;
  color: var(--gray-400);
}

.ss-history-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--gray-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ss-history-group-items {
  display: flex;
  flex-direction: column;
}

.ss-history-item {
  position: relative;
  padding: 8px 16px 8px 46px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 8px;
  border-radius: var(--radius-sm);
}

.ss-history-item:hover {
  background-color: var(--gray-100);
}

.ss-history-item.active {
  background-color: var(--gray-100);
  color: var(--gray-900);
}

.ss-history-item.active .ss-history-item-text {
  color: var(--gray-900);
  font-weight: 600;
}

.ss-history-item-text {
  font-size: 13px;
  color: var(--gray-600);
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
  color: var(--gray-400);
  cursor: pointer;
  font-size: 16px;
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
  color: var(--red-500);
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--gray-200);
  flex-shrink: 0;
  background: var(--smart-search-sidebar-background-color);
  margin-top: auto;
}

.footer-menu-items {
  margin-bottom: 8px;
}

.footer-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: var(--gray-700);
}

.footer-menu-item:hover {
  background-color: var(--gray-50);
  color: var(--gray-900);
}

.footer-menu-item.is-collapsed {
  justify-content: center;
  padding: 10px;
  gap: 0;
}

.footer-menu-item .el-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.user-menu-wrapper {
  width: 100%;
}

.user-menu-wrapper :deep(.el-dropdown) {
  display: block !important;
  width: 100%;
}

.user-info-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  gap: 12px;
}

.user-info-btn:hover {
  background: var(--gray-50);
  border-color: var(--gray-200);
}

.user-info-btn.is-collapsed {
  justify-content: center;
  padding: 8px;
  gap: 0;
}

.user-avatar {
  background: linear-gradient(135deg, var(--indigo-500) 0%, var(--purple-500) 100%);
  color: var(--black-white-white);
  flex-shrink: 0;
  border: 2px solid var(--gray-100);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.user-info-btn:hover .user-avatar {
  transform: scale(1.05);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.user-info-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
}

.user-details {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.username-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-900);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  line-height: 1.4;
}

.role-text {
  font-size: 12px;
  color: var(--gray-500);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  line-height: 1.4;
}

.chevron-icon {
  color: var(--gray-400);
  font-size: 14px;
  flex-shrink: 0;
  margin-left: 8px;
}

.ss-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  transition: margin-right 0.3s ease;
  background: #ffffff;
}

.ss-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: none;
  background: var(--black-white-white);
  flex-shrink: 0;
}

.ss-header-left {
  display: flex;
  align-items: center;
}

.ss-header-right {
  display: flex;
  align-items: center;
}

.ss-model-selector {
  display: flex;
  align-items: center;
}

.ss-model-trigger {
  display: flex;
  align-items: center;
  gap: var(--radius-md);
  padding: 6px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.2s;
  color: var(--gray-900);
  font-weight: 600;
  font-size: 16px;
}

.ss-model-trigger:hover {
  background-color: var(--gray-100);
}

.ss-model-icon {
  font-size: 18px;
  color: var(--indigo-500);
}

.ss-model-icon-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
}

.ss-model-arrow {
  font-size: 14px;
  color: var(--gray-400);
  margin-left: 4px;
}

.ss-model-dropdown {
  min-width: 220px;
  padding: var(--radius-md);
}

.ss-model-dropdown-item {
  display: flex !important;
  align-items: center !important;
  gap: var(--radius-md) !important;
}

.ss-model-item-icon {
  margin-right: 8px;
  font-size: 16px;
  flex-shrink: 0;
  color: var(--gray-600);
}

.ss-model-item-icon-img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  margin-right: 8px;
  flex-shrink: 0;
}

.ss-model-item-text {
  flex: 1;
  color: var(--gray-900);
}

.ss-model-check {
  margin-left: auto;
  color: var(--indigo-500);
  flex-shrink: 0;
}

.lang-btn {
  display: flex;
  align-items: center;
  gap: var(--radius-md);
  font-size: 14px;
  color: var(--gray-700);
  padding: 4px var(--radius-md);
}

.lang-item-content {
  display: flex;
  align-items: center;
  gap: var(--radius-md);
  width: 100%;
}

.lang-emoji {
  font-size: 16px;
}

.lang-check {
  margin-left: auto;
  color: var(--indigo-500);
}

.lang-icon {
  margin-right: 2px;
}

.lang-text {
  font-weight: 500;
}

/* 当抽屉打开时，压缩主区域 */
.ss-main-compressed {
  margin-right: 520px;
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
  gap: 24px;
  padding: 40px 20px;
}

.ss-llm-unavailable-hint {
  width: 100%;
  max-width: 900px;
}

.ss-empty-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 8px;
}

.ss-empty-icon {
  font-size: 48px;
  color: var(--slate-400);
}

.ss-quick-cards {
  display: flex;
  gap: 16px;
  max-width: 900px;
  width: 100%;
  justify-content: center;
  margin-top: 16px;
}

.ss-quick-card {
  flex: 1;
  max-width: 280px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.ss-quick-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transform: translateY(-2px);
}

.ss-quick-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-bottom: 16px;
}

.ss-quick-card-icon.warning {
  background: #fff7ed;
  color: #f97316;
}

.ss-quick-card-icon.upload {
  background: #f0f9ff;
  color: #0ea5e9;
}

.ss-quick-card-icon.case {
  background: #f0fdf4;
  color: #22c55e;
}

.ss-quick-card-content h3 {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 8px 0;
}

.ss-quick-card-content p {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
  line-height: 1.4;
}

.ss-recommendation-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-top: 12px;
  max-width: 400px;
  text-align: left;
}

.ss-recommendation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.ss-recommendation-header .el-icon {
  font-size: 18px;
  color: #409eff;
}

.ss-recommendation-text {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 12px 0;
  line-height: 1.5;
}

/* 推荐卡片包装器 - 在对话中显示 */
.ss-recommendation-wrapper {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ss-system-messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}

.ss-system-message {
  border-radius: 14px;
  border: 1px solid #f59e0b;
  background: linear-gradient(135deg, #fff8eb 0%, #fffdf7 100%);
  box-shadow: 0 8px 18px rgba(245, 158, 11, 0.08);
  padding: 12px 14px;
}

.ss-system-message.is-rollover {
  border-color: #f59e0b;
}

.ss-system-message.is-direct {
  border-color: #f97316;
  background: linear-gradient(135deg, #fff4eb 0%, #fffaf5 100%);
}

.ss-system-message-title {
  font-size: 13px;
  font-weight: 700;
  color: #9a3412;
  margin-bottom: 6px;
}

.ss-system-message-text {
  color: #7c2d12;
  font-size: 13px;
  line-height: 1.7;
}

/* 内联快速卡片容器 - 用于在对话中显示单个/多个卡片 */
.ss-quick-cards-inline {
  display: flex;
  gap: 16px;
  justify-content: flex-start;
  width: 100%;
}

.ss-quick-cards-inline .ss-quick-card {
  max-width: 280px;
  margin: 0;
}

/* 单个卡片：左对齐 */
.ss-quick-cards-single {
  justify-content: flex-start;
}

/* 多个卡片：居中 + 可换行（与初始页面的视觉一致） */
.ss-quick-cards-multiple {
  justify-content: center;
  flex-wrap: wrap;
}

.ss-quick-cards-multiple .ss-quick-card {
  flex: 1;
}

/* 多卡片推荐容器 */
.ss-recommendation-multiple {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  width: 100%;
}

/* 暂无相关数据提示 */
.ss-no-data-tip {
  font-size: 16px;
  color: var(--gray-600);
  text-align: center;
}

.ss-empty-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--slate-900);
  margin: 0;
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

.ss-msg-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.ss-msg-stack-user {
  align-items: flex-end;
}

.ss-msg-bubble {
  max-width: 80%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  background: #fff;
}
.ss-msg.user .ss-msg-bubble {
  background: var(--agent-msg-user-bg);
  border-color: var(--agent-msg-user-border);
  color: var(--agent-msg-user-text);
}
.ss-msg-loading {
  background: #f9fafb;
  border-color: #e5e7eb;
}
.ss-loading-content {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
}
.ss-loading-icon {
  font-size: 16px;
  animation: ss-loading-spin 1s linear infinite;
}
.ss-loading-text {
  font-size: 14px;
  color: #6b7280;
}
@keyframes ss-loading-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ss-msg-text {
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
  margin-top: 8px;
}

/* 来源标识和复制按钮容器 */
.ss-sources-actions {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* 来源标识区域 - 圆角矩形按钮，内部圆形图标重叠显示 */
.ss-sources-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  width: fit-content;
  min-width: auto;
}

.ss-sources-button:hover {
  background: #e5e7eb;
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.ss-sources-button-icons {
  display: flex;
  align-items: center;
  gap: 0;
  position: relative;
  height: 20px;
}

.ss-source-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--black-white-white);
  border: 2px solid var(--gray-200);
  border-radius: 10px;
  margin-left: -10px;
  transition: all 0.2s;
  box-shadow: 0 1px 2px var(--shadow-xs);
}

.ss-source-icon:first-child {
  margin-left: 0;
}

/* 故障码标签 - 浅红色 */
.ss-source-icon-error-code {
  border-color: var(--red-200);
  background-color: var(--red-50);
}

.ss-source-icon-error-code .ss-source-icon-text {
  color: var(--red-600);
}

/* 故障案例标签 - 蓝色 */
.ss-source-icon-fault-case {
  border-color: var(--blue-200);
  background-color: var(--blue-50);
}

.ss-source-icon-fault-case .ss-source-icon-text {
  color: var(--blue-600);
}

/* Knowledge 标签 - 紫色 */
.ss-source-icon-knowledge {
  border-color: var(--purple-200);
  background-color: var(--purple-50);
}

.ss-source-icon-knowledge .ss-source-icon-text {
  color: var(--purple-600);
}

.ss-source-icon-svg {
  font-size: 12px;
  color: var(--gray-700);
}

.ss-source-icon-text {
  font-size: 10px;
  color: var(--gray-700);
  font-weight: 600;
  white-space: nowrap;
  line-height: 1;
}

.ss-sources-button-text {
  font-size: 12px;
  color: var(--gray-700);
  font-weight: 500;
}

/* 复制按钮 */
.ss-copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
}

.ss-copy-button:hover {
  background: #e5e7eb;
  border-color: #d1d5db;
  color: #1890ff;
}

.ss-copy-button .el-icon {
  font-size: 14px;
}

/* 复制按钮 */
.ss-copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
}

.ss-copy-button:hover {
  background: #e5e7eb;
  border-color: #d1d5db;
  color: #1890ff;
}

.ss-copy-button .el-icon {
  font-size: 14px;
}

/* 来源抽屉 */
.ss-sources-drawer {
  padding: 0;
}

.ss-sources-group {
  margin-bottom: 24px;
}

.ss-sources-group:last-child {
  margin-bottom: 0;
}

.ss-sources-group-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.ss-sources-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ss-source-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.ss-source-header {
  cursor: pointer;
  padding: 4px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s;
  min-height: 28px;
  line-height: 1.2;
}

.ss-source-header:hover {
  background-color: #f9fafb;
}

.ss-source-ref {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
  flex-shrink: 0;
  line-height: 1.2;
}

.ss-source-text {
  font-size: 12px;
  color: #111827;
  font-weight: 500;
  flex-shrink: 0;
  line-height: 1.2;
}

.ss-kb-title {
  font-size: 12px;
  color: #111827;
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.ss-source-desc {
  font-size: 12px;
  color: #6b7280;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.ss-source-expand-icon {
  margin-left: auto;
  flex-shrink: 0;
  transition: transform 0.2s;
  color: #6b7280;
}

.ss-source-expand-icon.expanded {
  transform: rotate(180deg);
}

.ss-source-expanded {
  padding: 16px;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
}

.ss-source-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ss-source-detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ss-source-detail-label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.ss-source-detail-value {
  font-size: 13px;
  color: #111827;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* KB snippet highlight */
.ss-kb-snippet :deep(em) {
  font-style: normal;
  padding: 0 2px;
  border-radius: 2px;
  background: var(--el-color-warning-light-8);
  color: var(--el-color-warning-dark-2);
}

.ss-source-detail-params {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ss-source-detail-param {
  font-size: 13px;
  color: #111827;
}

.ss-param-label {
  font-weight: 500;
  color: #374151;
  margin-right: 4px;
}

.ss-param-value {
  color: #111827;
}

.ss-source-tech-text {
  /* 与对话区一致：纯文本展示，不需要单独卡片背景 */
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
  background: transparent;
  border-radius: 0;
  padding: 0;
  border: none;
  white-space: pre-wrap;
}

.ss-source-detail-actions {
  margin-top: 8px;
}

.ss-source-detail-actions button {
  background: none;
  border: none;
  color: var(--blue-600);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  text-decoration: none;
  transition: color 0.2s;
}

.ss-source-detail-actions button:hover {
  color: var(--blue-700);
  text-decoration: underline;
}

/* 故障案例预览样式（类似JiraFaultCases概览模式） */
.ss-case-preview-header {
  margin-bottom: 24px;
}

.ss-case-preview-key-project {
  font-size: 13px;
  color: var(--gray-500);
  margin-bottom: 8px;
  font-weight: 400;
}

.ss-case-preview-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--gray-900);
  line-height: 1.5;
}

.ss-case-key-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--gray-200);
}

.ss-case-key-info-left,
.ss-case-key-info-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ss-case-info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ss-case-info-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--gray-500);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ss-case-info-value {
  font-size: 14px;
  color: var(--gray-700);
  display: flex;
  align-items: center;
}

.ss-case-info-empty {
  font-size: 14px;
  color: var(--gray-400);
}

.ss-case-status-tag {
  display: inline-block;
  width: fit-content;
}

.ss-case-components {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ss-case-component-tag {
  background-color: var(--gray-100);
  color: var(--gray-700);
  border: none;
}

/* 内容区域样式（类似概览模式） */
.ss-case-content-section {
  margin-bottom: 20px;
}

.ss-case-content-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--gray-500);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.ss-case-content-box {
  font-size: 14px;
  color: var(--gray-700);
  line-height: 1.6;
  white-space: pre-wrap;
}

.ss-case-content-two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.ss-case-loading {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 10px;
}

.ss-case-attachments-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
}

.ss-case-image-attachments,
.ss-case-file-attachments {
  margin-bottom: 16px;
}

.ss-case-attachment-label {
  font-size: 13px;
  color: #374151;
  margin-bottom: 8px;
  font-weight: 500;
}

.ss-case-attachment-images {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.ss-case-image-thumbnail {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  background: #fff;
}

.ss-case-attachment-image {
  width: 100%;
  height: 100px;
  display: block;
}

.ss-case-image-name {
  font-size: 11px;
  padding: 6px 8px;
  color: #374151;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-case-attachment-item {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 故障码详情弹窗 */
.ss-fault-detail-dialog {
  padding: 0;
}

.ss-fault-detail-dialog-content {
  padding: 16px 0;
}

.ss-fault-detail-dialog-section {
  margin-bottom: 20px;
}

.ss-fault-detail-dialog-section:last-child {
  margin-bottom: 0;
}

.ss-fault-detail-dialog-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  margin-bottom: 8px;
}

.ss-fault-detail-dialog-value {
  font-size: 14px;
  color: #111827;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ss-fault-detail-dialog-params {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ss-fault-detail-dialog-param {
  font-size: 14px;
  color: #111827;
}

.ss-fault-detail-dialog-tech-text {
  font-family: var(--font-mono);
  font-size: 13px;
  background: #f9fafb;
  border-radius: 6px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  white-space: pre-wrap;
  line-height: 1.6;
}

.ss-fault-detail-dialog-attach-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ss-fault-detail-dialog-attach {
  font-size: 13px;
  color: #2563eb;
  text-decoration: none;
  word-break: break-all;
}

.ss-fault-detail-dialog-attach:hover {
  text-decoration: underline;
}

/* 旧的来源样式已移除，使用抽屉中的新样式 */

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
  font-family: var(--font-mono);
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
  margin-top: 8px;
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

.ss-debug-v {
  word-break: break-word;
  white-space: pre-wrap;
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
  
  .ss-empty-cards {
    grid-template-columns: 1fr;
  }

  .ss-draft-attachments {
    gap: 8px;
    padding: 12px;
  }

  .ss-draft-attachment-card {
    width: 88px;
    height: 88px;
  }

  .ss-msg-image-card {
    width: min(220px, 100%);
  }
}

.ss-msg-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.ss-msg-image-attachments {
  gap: 12px;
}

.ss-msg-image-card {
  width: min(240px, 72vw);
  border-radius: 16px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid rgba(229, 231, 235, 0.92);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.ss-msg.user .ss-msg-image-card {
  background: var(--agent-msg-user-attachment-bg);
  border-color: var(--agent-msg-user-attachment-border);
}

.ss-msg-image-card-media {
  display: block;
  width: 100%;
  height: 176px;
  background: #f3f4f6;
  cursor: zoom-in;
}

.ss-msg-image-card-media :deep(.el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ss-msg-image-card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px 12px;
}

.ss-msg-image-card-name {
  font-size: 13px;
  line-height: 1.4;
  color: #111827;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-msg-image-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #6b7280;
}

.ss-msg-attachment-card {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
  max-width: 280px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(229, 231, 235, 0.9);
}

.ss-msg.user .ss-msg-attachment-card {
  background: var(--agent-msg-user-attachment-bg);
  border-color: var(--agent-msg-user-attachment-border);
}

.ss-msg-attachment-image,
.ss-msg-attachment-file-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  flex-shrink: 0;
}

.ss-msg-attachment-image {
  object-fit: cover;
  border: 1px solid #e5e7eb;
}

.ss-msg-attachment-file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #4b5563;
}

.ss-msg-attachment-info {
  min-width: 0;
  flex: 1;
}

.ss-msg-attachment-name {
  font-size: 13px;
  color: #111827;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-msg-attachment-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #6b7280;
}

.ss-composer-wrap {
  padding: 14px 16px 18px;
  border-top: none;
  background: var(--black-white-white);
}

.ss-instance-locked-notice {
  max-width: 900px;
  margin: 14px auto 0;
  padding: 0 16px;
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

.ss-draft-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 14px 8px;
}

.ss-composer-capability-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 0;
}

.ss-composer-capability-copy {
  font-size: 13px;
  line-height: 1.5;
  color: #9a3412;
}

.ss-composer-capability-switch {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 8px 12px;
  background: #111827;
  color: #ffffff;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ss-composer-capability-switch:hover {
  opacity: 0.92;
  transform: translateY(-1px);
}

.ss-composer-attachments-section {
  padding-bottom: 2px;
}

.ss-composer-text-section {
  position: relative;
}

.ss-draft-attachment-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 104px;
  height: 104px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #f9fafb;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s;
}

.ss-draft-attachment-card:hover {
  transform: translateY(-1px);
}

.ss-draft-attachment-card.is-uploading {
  border-color: #cbd5e1;
}

.ss-draft-attachment-card.is-available {
  border-color: #d1d5db;
}

.ss-draft-attachment-card.is-available:hover {
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
}

.ss-draft-attachment-card.is-failed {
  border-color: #fca5a5;
  background: #fff1f2;
}

.ss-draft-attachment-thumb {
  width: 100%;
  height: 100%;
  background: #e5e7eb;
}

.ss-draft-attachment-file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 12px 10px;
  text-align: center;
}

.ss-draft-attachment-thumb-file,
.ss-draft-attachment-thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4b5563;
  width: 48px;
  height: 48px;
  margin: 0 auto;
  border-radius: 12px;
  background: rgba(229, 231, 235, 0.9);
  font-size: 24px;
}

.ss-draft-attachment-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ss-draft-attachment-file-name {
  margin-top: 8px;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.35;
  color: #374151;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.ss-draft-attachment-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.ss-draft-attachment-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.ss-draft-attachment-card.is-available:hover .ss-draft-attachment-actions,
.ss-draft-attachment-card.is-failed:hover .ss-draft-attachment-actions,
.ss-draft-attachment-card.is-draft:hover .ss-draft-attachment-actions {
  opacity: 1;
}

.ss-draft-attachment-remove,
.ss-draft-attachment-failed-indicator,
.ss-draft-attachment-progress-badge {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.ss-draft-attachment-remove {
  border: none;
  background: rgba(17, 24, 39, 0.72);
  color: #ffffff;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.ss-draft-attachment-remove:hover {
  background: rgba(17, 24, 39, 0.92);
}

.ss-draft-attachment-failed-indicator {
  border: none;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 700;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(185, 28, 28, 0.16);
}

.ss-draft-attachment-failed-indicator:hover {
  background: #fecaca;
}

.ss-draft-attachment-progress-badge {
  background: rgba(17, 24, 39, 0.72);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
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
  background: transparent;
  box-shadow: none;
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

.ss-disclaimer {
  max-width: 900px;
  margin: 8px auto 0;
  font-size: 12px;
  color: var(--slate-500);
  text-align: center;
  padding: 0 16px;
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
  gap: 8px;
}

.ss-answer-area {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 0 8px 0;
}

.ss-answer-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.ss-answer-summary .ss-answer-text {
  white-space: normal;
  font-size: 15px;
  line-height: 1.6;
  color: #101828;
}

.ss-answer-section:first-child {
  margin-top: 0;
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
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.ss-fault-message {
  font-size: 14px;
  color: #374151;
}

.ss-fault-ref {
  font-family: var(--font-mono);
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
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.ss-troubleshoot-message {
  font-size: 14px;
  color: #374151;
}

.ss-troubleshoot-ref {
  font-family: var(--font-mono);
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
  font-family: var(--font-mono);
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
  font-family: var(--font-mono);
  font-size: 13px;
  color: #6b7280;
  margin-left: 8px;
}

/* Knowledge 知识库文档样式 */
.ss-kb-item {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  transition: all 0.2s;
}

.ss-kb-item:hover {
  border-color: #d1d5db;
  background: #ffffff;
}

.ss-kb-assets {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.ss-kb-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}

.ss-kb-ref {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  flex-shrink: 0;
}

.ss-kb-title {
  font-weight: 600;
  color: #111827;
  flex-shrink: 0;
}

.ss-kb-heading {
  font-size: 12px;
  color: #6b7280;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-kb-snippet {
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
  margin-bottom: 8px;
  word-break: break-word;
}

.ss-kb-snippet :deep(em) {
  font-style: normal;
  padding: 0 2px;
  border-radius: 2px;
  background: var(--el-color-warning-light-8);
  color: var(--el-color-warning-dark-2);
}

.ss-kb-link {
  font-size: 13px;
  color: #2563eb;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.ss-kb-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.ss-kb-more {
  margin-top: 8px;
  text-align: center;
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
