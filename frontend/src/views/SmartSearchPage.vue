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
              <Earth theme="outline" size="20" fill="#333" class="lang-icon" />
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
              title="当前智能搜索不可用"
              description="当前未接入大模型或额度已用完，请使用经典面板功能。"
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
              <div class="ss-msg-bubble">
                <div class="ss-msg-text">{{ m.content }}</div>
                <div class="ss-msg-time">{{ formatTime(m.createdAt) }}</div>
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
                <div class="ss-llm-unavailable-hint">
                  <el-alert
                    title="当前智能搜索不可用"
                    :description="(m.payload && m.payload.answerText) ? m.payload.answerText : (m.content || '当前未接入大模型或额度已用完，请使用经典面板功能。')"
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

                <div class="ss-msg-time">{{ formatTime(m.createdAt) }}</div>
              </div>
            </template>

            <!-- Assistant message: search result - display directly on background (ChatGPT style) -->
            <template v-else-if="m.type === 'search_result' && m.payload && m.payload.ok">
              <div class="ss-answer-container">
                <!-- 1) 答案区 -->
                <div class="ss-answer-area">
                  <!-- 识别到的查询要点 -->
                  <div v-if="m.payload.recognized && (m.payload.recognized.fullCodes?.length || m.payload.recognized.typeCodes?.length || m.payload.recognized.keywords?.length || m.payload.recognized.symptom?.length || m.payload.recognized.trigger?.length || m.payload.recognized.component?.length || m.payload.recognized.neg?.length || m.payload.recognized.intent || m.payload.recognized.days)" class="ss-answer-section">
                    <div class="ss-answer-section-title">识别到的查询要点</div>
                    <div class="ss-answer-section-content">
                      <div class="ss-query-points">
                        <template v-if="m.payload.recognized.intent">
                          <div>意图：{{ getIntentLabel(m.payload.recognized.intent) }}</div>
                        </template>
                        <template v-if="m.payload.recognized.fullCodes?.length">
                          <div>故障码：{{ m.payload.recognized.fullCodes.join(' / ') }}</div>
                        </template>
                        <template v-else-if="m.payload.recognized.typeCodes?.length">
                          <div>故障类型：{{ m.payload.recognized.typeCodes.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.keywords?.length">
                          <div>关键词：{{ m.payload.recognized.keywords.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.symptom?.length">
                          <div>现象：{{ m.payload.recognized.symptom.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.trigger?.length">
                          <div>触发条件：{{ m.payload.recognized.trigger.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.component?.length">
                          <div>组件：{{ m.payload.recognized.component.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.neg?.length">
                          <div>否定项：{{ m.payload.recognized.neg.join(' / ') }}</div>
                        </template>
                        <template v-if="m.payload.recognized.days">
                          <div>回溯天数：{{ m.payload.recognized.days }} 天</div>
                        </template>
                      </div>
                    </div>
                  </div>

                  <!-- find_case: 统一“故障案例”标签（Jira + MongoDB 合并，Jira 优先，按 jira_key 去重） -->
                  <div v-if="m.payload.recognized?.intent === 'find_case' && m.payload.meta?.jiraError" class="ss-answer-section">
                    <div class="ss-answer-section-title">故障案例</div>
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
                  <div v-else-if="m.payload.recognized?.intent === 'find_case' && m.payload.sources && (m.payload.sources.cases || []).length > 0" class="ss-answer-section">
                    <div class="ss-answer-section-title">故障案例</div>
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

                  <!-- 故障码解析 -->
                  <div v-if="m.payload.recognized?.intent !== 'find_case' && m.payload.sources && (m.payload.sources.faultCodes || []).length > 0" class="ss-answer-section">
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
                          <div v-if="f.explanation" class="ss-fault-field">
                            <span class="ss-fault-field-label">解释：</span>
                            <span class="ss-fault-field-value">{{ f.explanation }}</span>
                          </div>
                          
                          <!-- 用户提示 -->
                          <div v-if="f.user_hint || f.operation" class="ss-fault-field">
                            <span class="ss-fault-field-label">用户提示：</span>
                            <span class="ss-fault-field-value">{{ [f.user_hint, f.operation].filter(Boolean).join(' ') || '-' }}</span>
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
                          
                              <!-- 附件（图片可预览，PDF可点击） -->
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
                                      :src="getGenericAttachmentProxyUrl(img.url)"
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
                                    :href="getGenericAttachmentProxyUrl(img.url)"
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

                  <!-- find_case: 故障码解析放到 Jira/Mongo 之后 -->
                  <div v-if="m.payload.recognized?.intent === 'find_case' && m.payload.sources && (m.payload.sources.faultCodes || []).length > 0" class="ss-answer-section">
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
                          <div v-if="f.explanation" class="ss-fault-field">
                            <span class="ss-fault-field-label">解释：</span>
                            <span class="ss-fault-field-value">{{ f.explanation }}</span>
                          </div>
                          
                          <!-- 用户提示 -->
                          <div v-if="f.user_hint || f.operation" class="ss-fault-field">
                            <span class="ss-fault-field-label">用户提示：</span>
                            <span class="ss-fault-field-value">{{ [f.user_hint, f.operation].filter(Boolean).join(' ') || '-' }}</span>
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
                              
                              <!-- 附件（图片可预览，PDF可点击） -->
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
                                      :src="getGenericAttachmentProxyUrl(img.url)"
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
                                    :href="getGenericAttachmentProxyUrl(img.url)"
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

                  <!-- 相似案例（非 find_case：统一使用 sources.cases / K 序号） -->
                  <div v-if="m.payload.recognized?.intent !== 'find_case' && m.payload.meta?.jiraError" class="ss-answer-section">
                    <div class="ss-answer-section-title">相似案例</div>
                    <div class="ss-answer-section-content">
                      <div class="ss-jira-error">
                        <el-alert
                          :title="m.payload.meta.jiraError.timeout ? 'Jira 连接超时' : 'Jira 连接失败'"
                          :description="m.payload.meta.jiraError.message || '无法连接到 Jira，Jira 侧案例检索已跳过'"
                          type="warning"
                          :closable="false"
                          show-icon
                        />
                      </div>
                    </div>
                  </div>
                  <div v-if="m.payload.recognized?.intent !== 'find_case' && m.payload.sources && (m.payload.sources.cases || []).length > 0" class="ss-answer-section">
                    <div class="ss-answer-section-title">相似案例</div>
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

                  <!-- Knowledge 知识库文档 -->
                  <div v-if="m.payload.sources && (m.payload.sources.kbDocs || []).length > 0" class="ss-answer-section">
                    <div class="ss-answer-section-title">Knowledge（{{ m.payload.sources.kbDocs.length }}）</div>
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
                        <a
                          class="ss-kb-link"
                          href="#"
                          @click.prevent="openSourcesDrawerAndExpand(m, kb.ref)"
                        >
                          查看详情
                        </a>
                      </div>
                      <div v-if="(m.payload.sources.kbDocs || []).length > 5" class="ss-kb-more">
                        <el-button 
                          size="small" 
                          text 
                          @click="openSourcesDrawer(m)"
                        >
                          查看全部 {{ m.payload.sources.kbDocs.length }} 条 Knowledge 来源
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
                          title="故障码"
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
                      <span class="ss-sources-button-text">来源</span>
                    </div>
                    <button 
                      class="ss-copy-button" 
                      @click.stop="copyAnswerText(m)"
                      title="复制答案"
                    >
                      <el-icon><DocumentCopy /></el-icon>
                    </button>
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
                    <div v-if="m.payload.debug.mongo" class="ss-debug-block">
                      <div class="ss-debug-title">MongoDB 检索式</div>
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

                <div class="ss-msg-time">{{ formatTime(m.createdAt) }}</div>
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

        <div class="ss-disclaimer">
          {{ $t('smartSearch.disclaimer') }}
        </div>
      </div>

      <el-drawer
        v-model="sourceDrawerVisible"
        title="搜索结果"
        size="520px"
        direction="rtl"
        :with-header="true"
        :modal="false"
        :append-to-body="true"
      >
        <div class="ss-sources-drawer">
          <!-- 故障码来源 -->
          <div v-if="sourceDrawerMessage?.payload?.sources?.faultCodes?.length" class="ss-sources-group">
            <div class="ss-sources-group-title">故障码来源（{{ sourceDrawerMessage?.payload?.sources?.faultCodes?.length }}）</div>
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
                      <div class="ss-source-detail-label">解释</div>
                      <div class="ss-source-detail-value">{{ f.explanation }}</div>
                    </div>
                    
                    <!-- 用户提示 -->
                    <div v-if="f.user_hint || f.operation" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">用户提示</div>
                      <div class="ss-source-detail-value">{{ [f.user_hint, f.operation].filter(Boolean).join(' ') || '-' }}</div>
                    </div>
                    
                    <!-- 参数含义 -->
                    <div v-if="f.param1 || f.param2 || f.param3 || f.param4" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">参数含义</div>
                      <div class="ss-source-detail-params">
                        <div v-if="f.param1" class="ss-source-detail-param">
                          <span class="ss-param-label">参数1：</span>
                          <span class="ss-param-value">{{ f.param1 }}</span>
                        </div>
                        <div v-if="f.param2" class="ss-source-detail-param">
                          <span class="ss-param-label">参数2：</span>
                          <span class="ss-param-value">{{ f.param2 }}</span>
                        </div>
                        <div v-if="f.param3" class="ss-source-detail-param">
                          <span class="ss-param-label">参数3：</span>
                          <span class="ss-param-value">{{ f.param3 }}</span>
                        </div>
                        <div v-if="f.param4" class="ss-source-detail-param">
                          <span class="ss-param-label">参数4：</span>
                          <span class="ss-param-value">{{ f.param4 }}</span>
                        </div>
                      </div>
                    </div>
                    
                    <!-- 详细信息 -->
                    <div v-if="f.detail" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">详细信息</div>
                      <div class="ss-source-detail-value">{{ f.detail }}</div>
                    </div>
                    
                    <!-- 检查方法 -->
                    <div v-if="f.method" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">检查方法</div>
                      <div class="ss-source-detail-value">{{ f.method }}</div>
                    </div>
                    
                    <!-- 分类 -->
                    <div v-if="f.category" class="ss-source-detail-section">
                      <div class="ss-source-detail-label">分类</div>
                      <div class="ss-source-detail-value">{{ f.category }}</div>
                    </div>
                    
                    <!-- 技术排查方案 -->
                    <div class="ss-source-detail-section">
                      <div class="ss-source-detail-label">技术排查方案</div>
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
                          加载技术排查方案
                        </el-button>
                      </div>
                      <div v-else class="ss-source-detail-value">-</div>
                      
                      <!-- 附件 -->
                      <div v-if="(faultTechSolutions.get(f.id)?.images || []).length > 0" class="ss-fault-attachments">
                        <div class="ss-fault-attachments-title">附件：</div>
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
                            <div class="ss-attachment-image-name">{{ img.original_name || img.filename || '图片' }}</div>
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
                            <span>{{ img.original_name || img.filename || '文件' }}</span>
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
            <div class="ss-sources-group-title">故障案例（{{ sourceDrawerMessage?.payload?.sources?.cases?.length || 0 }}）</div>
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
                        <div v-if="jiraIssueLoading[c.key]" class="ss-case-loading">正在加载 Jira 详情…</div>

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
                              <div class="ss-case-info-label">STATUS</div>
                              <el-tag v-if="getJiraCase(c).status" type="primary" size="small" class="ss-case-status-tag">
                                {{ getJiraCase(c).status }}
                              </el-tag>
                              <span v-else class="ss-case-info-empty">-</span>
                            </div>
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">COMPONENTS</div>
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
                              <div class="ss-case-info-label">RESOLUTION</div>
                              <div class="ss-case-info-value">
                                {{ getJiraCase(c).resolution?.name || 'Unresolved' }}
                              </div>
                            </div>
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">UPDATED</div>
                              <div class="ss-case-info-value">
                                <i class="fas fa-clock" style="margin-right: 4px; font-size: 12px;"></i>
                                {{ formatTime(getJiraCase(c).updated) || '-' }}
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- 模块信息（如果components为空，显示module） -->
                        <div v-if="(!getJiraCase(c).components || getJiraCase(c).components.length === 0) && getJiraCase(c).module" class="ss-source-detail-section">
                          <div class="ss-source-detail-label">模块</div>
                          <div class="ss-source-detail-value">{{ getJiraCase(c).module }}</div>
                        </div>

                        <!-- Content Section: 客诉/普通 两套字段（与 JiraFaultCases 一致） -->
                        <template v-if="isComplaintProjectByCase(c)">
                          <div v-if="getJiraCase(c).customfield_12213" class="ss-case-content-section">
                            <div class="ss-case-content-label">DETAILED DESCRIPTION</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).customfield_12213 }}</div>
                          </div>
                          <div v-if="getJiraCase(c).customfield_12284" class="ss-case-content-section">
                            <div class="ss-case-content-label">PRELIMINARY INVESTIGATION</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).customfield_12284 }}</div>
                          </div>
                          <div class="ss-case-content-two-columns">
                            <div v-if="getJiraCase(c).customfield_12233" class="ss-case-content-section">
                              <div class="ss-case-content-label">CONTAINMENT MEASURES</div>
                              <div class="ss-case-content-box">{{ getJiraCase(c).customfield_12233 }}</div>
                            </div>
                            <div v-if="getJiraCase(c).customfield_12239" class="ss-case-content-section">
                              <div class="ss-case-content-label">LONG-TERM MEASURES</div>
                              <div class="ss-case-content-box">{{ getJiraCase(c).customfield_12239 }}</div>
                            </div>
                          </div>
                          <div v-if="!getJiraCase(c).customfield_12213 && !getJiraCase(c).customfield_12284 && !getJiraCase(c).customfield_12233 && !getJiraCase(c).customfield_12239" class="ss-case-content-section">
                            <div class="ss-case-content-label">DETAILED DESCRIPTION</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).description || getJiraCase(c).summary || '-' }}</div>
                          </div>
                        </template>
                        <template v-else>
                          <div v-if="getJiraCase(c).description || getJiraCase(c).summary" class="ss-case-content-section">
                            <div class="ss-case-content-label">DESCRIPTION</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).description || getJiraCase(c).summary }}</div>
                          </div>
                          <div v-if="getJiraCase(c).customfield_10705" class="ss-case-content-section">
                            <div class="ss-case-content-label">INVESTIGATION & CAUSE ANALYSIS</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).customfield_10705 }}</div>
                          </div>
                          <div v-if="getJiraCase(c).customfield_10600" class="ss-case-content-section">
                            <div class="ss-case-content-label">SOLUTION DETAILS</div>
                            <div class="ss-case-content-box">{{ getJiraCase(c).customfield_10600 }}</div>
                          </div>
                        </template>

                        <!-- Attachments Section -->
                        <div v-if="(getJiraCase(c).attachments || []).length > 0" class="ss-case-attachments-section">
                          <div v-if="getJiraImageAttachments(c).length > 0" class="ss-case-image-attachments">
                            <div class="ss-case-attachment-label">IMAGE ATTACHMENTS</div>
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
                            <div class="ss-case-attachment-label">FILE ATTACHMENTS</div>
                            <div v-for="file in getJiraFileAttachments(c)" :key="file.id || file.filename" class="ss-case-attachment-item">
                              <el-link type="primary" :underline="false" @click="downloadJiraFile(file)">
                                <i class="fas fa-paperclip"></i>
                                {{ file.filename }}
                              </el-link>
                            </div>
                          </div>
                        </div>
                      </template>

                      <!-- MongoDB 故障案例（概览方式显示） -->
                      <template v-else>
                        <div v-if="mongoCaseLoading[c.id]" class="ss-case-loading">正在加载故障案例详情…</div>
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
                              <div class="ss-case-info-label">STATUS</div>
                              <el-tag v-if="getMongoCase(c).status" type="primary" size="small" class="ss-case-status-tag">
                                {{ getMongoCase(c).status }}
                              </el-tag>
                              <span v-else class="ss-case-info-empty">-</span>
                            </div>
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">MODULE</div>
                              <div class="ss-case-info-value">
                                {{ getMongoCase(c).module || '-' }}
                              </div>
                            </div>
                          </div>
                          <div class="ss-case-key-info-right">
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">EQUIPMENT MODEL</div>
                              <div class="ss-case-info-value">
                                {{
                                  Array.isArray(getMongoCase(c).equipment_model)
                                    ? (getMongoCase(c).equipment_model.join(', ') || '-')
                                    : (getMongoCase(c).equipment_model || '-')
                                }}
                              </div>
                            </div>
                            <div class="ss-case-info-item">
                              <div class="ss-case-info-label">UPDATED</div>
                              <div class="ss-case-info-value">
                                <i class="fas fa-clock" style="margin-right: 4px; font-size: 12px;"></i>
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
                          <div class="ss-case-content-label">SYMPTOM</div>
                          <div class="ss-case-content-box">{{ getMongoCase(c).symptom || '-' }}</div>
                        </div>

                        <div class="ss-case-content-section">
                          <div class="ss-case-content-label">POSSIBLE CAUSES</div>
                          <div class="ss-case-content-box">{{ getMongoCase(c).possible_causes || '-' }}</div>
                        </div>

                        <div class="ss-case-content-section">
                          <div class="ss-case-content-label">RESOLUTION</div>
                          <div class="ss-case-content-box">{{ getMongoCase(c).resolution || getMongoCase(c).solution || '-' }}</div>
                        </div>

                        <div class="ss-case-content-section">
                          <div class="ss-case-content-label">REMARK</div>
                          <div class="ss-case-content-box">{{ getMongoCase(c).remark || '-' }}</div>
                        </div>

                        <!-- Related Error Codes -->
                        <div class="ss-source-detail-section">
                          <div class="ss-source-detail-label">关联故障码</div>
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
                            <div class="ss-case-attachment-label">IMAGE ATTACHMENTS</div>
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
                                <div class="ss-case-image-name">{{ img.original_name || img.filename || img.name || '图片' }}</div>
                              </div>
                            </div>
                          </div>
                          <div v-if="getMongoFileAttachments(getMongoCase(c)).length > 0" class="ss-case-file-attachments">
                            <div class="ss-case-attachment-label">FILE ATTACHMENTS</div>
                            <div v-for="file in getMongoFileAttachments(getMongoCase(c))" :key="file.uid || file.url || file.id" class="ss-case-attachment-item">
                              <el-link type="primary" :underline="false" @click="downloadMongoFile(file)">
                                <i class="fas fa-paperclip"></i>
                                {{ file.original_name || file.filename || file.name || '文件' }}
                              </el-link>
                            </div>
                          </div>
                          <div v-if="getMongoImageAttachments(getMongoCase(c)).length === 0 && getMongoFileAttachments(getMongoCase(c)).length === 0" class="ss-source-detail-section">
                            <div class="ss-source-detail-label">附件</div>
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
                            查看详情
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
            <div class="ss-sources-group-title">Knowledge（{{ sourceDrawerMessage?.payload?.sources?.kbDocs?.length || 0 }}）</div>
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
                      <div class="ss-source-detail-label">片段</div>
                      <div class="ss-source-detail-value ss-kb-snippet" v-html="sanitizeSnippet(k.snippet)"></div>
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
        title="故障码详情"
        width="800px"
        :close-on-click-modal="false"
      >
        <div v-if="faultDetailItem" class="ss-fault-detail-dialog">
          <el-tabs v-model="faultDetailActiveTab">
            <el-tab-pane label="基础信息" name="basic">
              <div class="ss-fault-detail-dialog-content">
                <div class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">故障码</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.subsystem ? `${faultDetailItem.subsystem} - ` : '' }}{{ faultDetailItem.code }}</div>
                </div>
                <div v-if="faultDetailItem.short_message" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">摘要</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.short_message }}</div>
                </div>
                <div v-if="faultDetailItem.user_hint || faultDetailItem.operation || faultDetailItem.explanation" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">解释</div>
                  <div class="ss-fault-detail-dialog-value">{{ [faultDetailItem.explanation, faultDetailItem.user_hint, faultDetailItem.operation].filter(Boolean).join(' ') }}</div>
                </div>
                <div v-if="faultDetailItem.param1 || faultDetailItem.param2 || faultDetailItem.param3 || faultDetailItem.param4" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">参数含义</div>
                  <div class="ss-fault-detail-dialog-params">
                    <div v-if="faultDetailItem.param1" class="ss-fault-detail-dialog-param">
                      <span class="ss-param-label">参数1：</span>
                      <span class="ss-param-value">{{ faultDetailItem.param1 }}</span>
                    </div>
                    <div v-if="faultDetailItem.param2" class="ss-fault-detail-dialog-param">
                      <span class="ss-param-label">参数2：</span>
                      <span class="ss-param-value">{{ faultDetailItem.param2 }}</span>
                    </div>
                    <div v-if="faultDetailItem.param3" class="ss-fault-detail-dialog-param">
                      <span class="ss-param-label">参数3：</span>
                      <span class="ss-param-value">{{ faultDetailItem.param3 }}</span>
                    </div>
                    <div v-if="faultDetailItem.param4" class="ss-fault-detail-dialog-param">
                      <span class="ss-param-label">参数4：</span>
                      <span class="ss-param-value">{{ faultDetailItem.param4 }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="更多信息" name="more">
              <div class="ss-fault-detail-dialog-content">
                <div v-if="faultDetailItem.detail" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">详细信息</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.detail }}</div>
                </div>
                <div v-if="faultDetailItem.method" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">检查方法</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.method }}</div>
                </div>
                <div v-if="faultDetailItem.category" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">分类</div>
                  <div class="ss-fault-detail-dialog-value">{{ faultDetailItem.category }}</div>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="技术排查方案" name="tech" v-loading="faultDetailTechLoading">
              <div class="ss-fault-detail-dialog-content">
                <div v-if="faultDetailTech?.tech_solution" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">技术排查方案</div>
                  <pre class="ss-fault-detail-dialog-tech-text">{{ faultDetailTech.tech_solution }}</pre>
                </div>
                <div v-else class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-value">-</div>
                </div>
                <div v-if="(faultDetailTech?.images || []).length > 0" class="ss-fault-detail-dialog-section">
                  <div class="ss-fault-detail-dialog-label">附件</div>
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
            <el-button @click="faultDetailDialogVisible = false">关闭</el-button>
          </span>
        </template>
      </el-dialog>

    </main>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { getCurrentLocale, loadLocaleMessages } from '../i18n'
import { ArrowLeft, ArrowRight, ArrowDown, Warning, Link, Files, DocumentCopy, ChatLineRound, Grid, Paperclip, Upload, Notebook, Cpu, Check, Plus, History, User, SwitchButton, Loading } from '@element-plus/icons-vue'
import { Earth } from '@icon-park/vue-next'
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
  components: { Earth },
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
    const llmProviderStorageKey = computed(() => `smartSearchLlmProvider:${userKey.value}`)

    const llmProviders = ref([])
    const llmProvidersLoading = ref(false)
    const llmProviderId = ref('')

    const anyLlmProviderAvailable = computed(() => {
      const list = Array.isArray(llmProviders.value) ? llmProviders.value : []
      return list.some(p => p && p.available)
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
        return `${it.ref || ''} ${it.subsystem ? `${it.subsystem} - ` : ''}${it.code || ''}`.trim() || '故障码详情'
      }
      if (sourceDrawerType.value === 'jira') {
        return `${it.ref || ''} ${it.key || ''}`.trim() || 'Jira 详情'
      }
      return '详情'
    })

    // Drawer case list always uses merged `sources.cases` (K1/K2...)

    const load = async () => {
      try {
        // 优先从 MongoDB 加载
        try {
          const resp = await api.smartSearch.getConversations({ limit: 50 })
          if (resp?.data?.conversations?.length > 0) {
            // MongoDB 对话：添加 mongo_ 前缀标识
            conversations.value = resp.data.conversations.map(conv => ({
              ...conv,
              id: `mongo_${conv.id}`
            }))
            // 确保每个对话都有标题
            conversations.value.forEach(conv => {
              if (!conv.title || conv.title === '新对话') {
                const firstUserMsg = (conv.messages || []).find(m => m && m.role === 'user')
                if (firstUserMsg && firstUserMsg.content) {
                  conv.title = normalizeTitle(firstUserMsg.content)
                }
              }
            })
          } else {
            // MongoDB 为空，fallback 到 localStorage（仅读取，不迁移）
        const raw = localStorage.getItem(storageKey.value)
        const parsed = raw ? JSON.parse(raw) : []
        conversations.value = Array.isArray(parsed) ? parsed : []
            // 确保每个对话都有标题
        conversations.value.forEach(conv => {
          if (!conv.title || conv.title === '新对话') {
            const firstUserMsg = (conv.messages || []).find(m => m && m.role === 'user')
            if (firstUserMsg && firstUserMsg.content) {
              conv.title = normalizeTitle(firstUserMsg.content)
            }
          }
        })
          }
        } catch (apiErr) {
          // 网络错误时 fallback 到 localStorage
          console.warn('[load] API error, fallback to localStorage:', apiErr)
          if (apiErr.response?.status === 503) {
            ElMessage.warning('MongoDB 未连接，显示本地历史对话')
          } else if (apiErr.response?.status >= 500) {
            ElMessage.warning('服务器错误，显示本地历史对话')
          }
          const raw = localStorage.getItem(storageKey.value)
          const parsed = raw ? JSON.parse(raw) : []
          conversations.value = Array.isArray(parsed) ? parsed : []
          // 确保每个对话都有标题
          conversations.value.forEach(conv => {
            if (!conv.title || conv.title === '新对话') {
              const firstUserMsg = (conv.messages || []).find(m => m && m.role === 'user')
              if (firstUserMsg && firstUserMsg.content) {
                conv.title = normalizeTitle(firstUserMsg.content)
              }
            }
          })
        }
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
        if (llmProviderId.value) {
          localStorage.setItem(llmProviderStorageKey.value, llmProviderId.value)
        }
      } catch (_) {
        const stored = localStorage.getItem(llmProviderStorageKey.value) || ''
        if (stored) llmProviderId.value = stored
      } finally {
        llmProvidersLoading.value = false
      }
    }

    const onLlmProviderChange = (id) => {
      llmProviderId.value = id
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
      // 只保存到 MongoDB，不再保存到 localStorage
      if (!conv) return

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
          title: conv.title || '新对话',
          messages: conv.messages || [],
          metadata
        }

        if (conv.id && conv.id.startsWith('mongo_')) {
          const mongoId = conv.id.replace('mongo_', '')
          await api.smartSearch.updateConversation(mongoId, convData)
          return
        }

        // 新对话：创建（创建成功后再切换成 mongo_ id，避免中途 id 变化导致找不到会话）
        const resp = await api.smartSearch.createConversation(convData)
        const created = resp?.data?.conversation
        if (created?.id) {
          const newId = `mongo_${created.id}`
          const oldId = conv.id
          // 更新当前会话 id（conv 通常是 conversations 里的引用对象）
          conv.id = newId
          // 如果当前激活的是“旧 id”，需要同步切换到新 mongo_ id
          if (activeConversationId.value === null || activeConversationId.value === oldId) {
            activeConversationId.value = newId
          }
        }
      } catch (err) {
        console.error('[persistConversation] Failed to save conversation to MongoDB:', err)
        if (err.response?.status === 503) {
          ElMessage.warning('MongoDB 未连接，对话未保存到服务器')
        } else if (err.response?.status >= 500) {
          ElMessage.warning('服务器错误，对话未保存到服务器')
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
      // 限制最多 5 个（前端显示限制，实际 MongoDB 中可保存更多）
      if (conversations.value.length > MAX_CONVERSATIONS) {
        conversations.value = conversations.value.slice(0, MAX_CONVERSATIONS)
      }
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
      // 这里不要触发持久化，避免中途 id 变化导致后续找不到会话
      upsertConversation(conv)

      draft.value = ''

      // LLM 不可用：不发请求，直接提示 + 给三个入口卡片
      if (showLlmUnavailableHint.value) {
        conv.messages = [...(conv.messages || []), {
          id: shortId(),
          role: 'assistant',
          type: 'llm_unavailable',
          content: '当前未接入大模型或额度已用完，请使用经典面板功能。',
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
        const resp = await api.smartSearch.search({
          query: text,
          limits: { errorCodes: 10, jira: 10, faultCases: 10 },
          debug: true,
          llmProviderId: llmProviderId.value || undefined
        })
        const payload = resp?.data || null
        const assistantMsg = {
          id: loadingMsgId, // 使用相同的 ID 替换 loading 消息
          role: 'assistant',
          type: 'search_result',
          content: '',
          payload,
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
          
          // 如果没有查询到结果且意图匹配，则添加推荐卡片消息
          const intent = payload?.recognized?.intent
          const hasFaultCodes = (payload?.sources?.faultCodes || []).length > 0
          const hasCases = (payload?.sources?.cases || []).length > 0 || (payload?.sources?.jira || []).length > 0 || (payload?.sources?.faultCases || []).length > 0
          const hasKbDocs = (payload?.sources?.kbDocs || []).length > 0
          const hasAnyResults = hasFaultCodes || hasCases || hasKbDocs
          
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
          } else if ((intent === 'how_to_use' || intent === 'definition' || intent === 'other') && !hasAnyResults) {
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

    // 通用附件代理 URL 函数（适用于所有类型的附件）
    // OSS 公网 URL 和本地代理 URL 直接使用，Jira 附件使用代理
    const getGenericAttachmentProxyUrl = (url) => {
      if (!url) return ''
      // OSS 公网 URL 或后端代理 URL 直接使用，不需要代理
      if (!needsProxy(url)) {
        return url
      }
      // Jira 附件或其他需要代理的 URL 使用代理
      const token = store?.state?.auth?.token || ''
      const qs = new URLSearchParams()
      qs.set('url', url)
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
        ElMessage.warning('附件链接无效')
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
          ElMessage.error('文件下载失败，请检查网络连接')
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
      const urlStr = String(url)
      // OSS 公网 URL（https:// 或 http://）不需要代理
      if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
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
        ElMessage.warning('附件链接无效')
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
          ElMessage.error('文件下载失败，请检查网络连接')
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
          queryPoints.push(`意图：${getIntentLabel(rec.intent)}`)
        }
        if (rec.fullCodes?.length) {
          queryPoints.push(`故障码：${rec.fullCodes.join(' / ')}`)
        } else if (rec.typeCodes?.length) {
          queryPoints.push(`故障类型：${rec.typeCodes.join(' / ')}`)
        }
        if (rec.keywords?.length) {
          queryPoints.push(`关键词：${rec.keywords.join(' / ')}`)
        }
        if (rec.symptom?.length) {
          queryPoints.push(`现象：${rec.symptom.join(' / ')}`)
        }
        if (rec.trigger?.length) {
          queryPoints.push(`触发条件：${rec.trigger.join(' / ')}`)
        }
        if (rec.component?.length) {
          queryPoints.push(`组件：${rec.component.join(' / ')}`)
        }
        if (rec.neg?.length) {
          queryPoints.push(`否定项：${rec.neg.join(' / ')}`)
        }
        if (rec.days) {
          queryPoints.push(`回溯天数：${rec.days} 天`)
        }
        if (queryPoints.length > 0) {
          parts.push('识别到的查询要点')
          parts.push(queryPoints.join('\n'))
          parts.push('')
        }
      }
      
      // 故障码解析
      if (payload.sources?.faultCodes?.length > 0) {
        parts.push('故障码解析')
        payload.sources.faultCodes.forEach(f => {
          const faultParts = []
          faultParts.push(`${f.subsystem ? `${f.subsystem} - ` : ''}${f.code}${f.short_message ? `：${f.short_message}` : ''} [${f.ref}]`)
          
          if (f.user_hint || f.operation) {
            faultParts.push(`解释：${[f.user_hint, f.operation].filter(Boolean).join(' ') || '-'}`)
          }
          
          if (f.param1 || f.param2 || f.param3 || f.param4) {
            const params = []
            if (f.param1) params.push(`参数1：${f.param1}`)
            if (f.param2) params.push(`参数2：${f.param2}`)
            if (f.param3) params.push(`参数3：${f.param3}`)
            if (f.param4) params.push(`参数4：${f.param4}`)
            faultParts.push(`参数含义：${params.join(' ')}`)
          }
          
          if (f.detail) {
            faultParts.push(`详细信息：${f.detail}`)
          }
          
          if (f.method) {
            faultParts.push(`检查方法：${f.method}`)
          }
          
          if (f.category) {
            faultParts.push(`分类：${f.category}`)
          }
          
          if (f.tech_solution || faultTechSolutions.value.get(f.id)?.tech_solution) {
            faultParts.push(`技术排查方案：${f.tech_solution || faultTechSolutions.value.get(f.id)?.tech_solution}`)
          }
          
          parts.push(faultParts.join('\n'))
          parts.push('')
        })
      }
      
      // 相似案例（统一 sources.cases / K 序号）
      if (payload.sources?.cases?.length > 0) {
        parts.push('相似案例')
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
        parts.push('相似历史案例（来自 Jira）')
        payload.sources.jira.forEach(j => {
          parts.push(`${j.key}${j.summary ? `：${j.summary}` : ''} [${j.ref}]`)
        })
        parts.push('')
      }
      
      const text = parts.join('\n').trim()
      
      try {
        await navigator.clipboard.writeText(text)
        ElMessage.success('答案已复制到剪贴板')
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
          ElMessage.success('答案已复制到剪贴板')
        } catch (e) {
          ElMessage.error('复制失败，请手动复制')
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
      activeConversationId.value = null
      draft.value = ''
    }

    const selectConversation = async (id) => {
      activeConversationId.value = id
      draft.value = ''
      
      // 如果是 MongoDB 对话，确保加载完整数据
      if (id && id.startsWith('mongo_')) {
        const mongoId = id.replace('mongo_', '')
        const localConv = conversations.value.find(c => c.id === id)
        // 如果本地对话消息不完整，从 API 加载
        if (!localConv || !localConv.messages || localConv.messages.length === 0) {
          try {
            const resp = await api.smartSearch.getConversation(mongoId)
            if (resp?.data?.conversation) {
              const conv = resp.data.conversation
              const idx = conversations.value.findIndex(c => c.id === id)
              if (idx >= 0) {
                conversations.value[idx] = {
                  ...conv,
                  id: `mongo_${conv.id}`
                }
              }
            }
          } catch (err) {
            console.error('[selectConversation] Failed to load conversation:', err)
          }
        }
      }
    }

    const deleteConversation = async (id) => {
      // 如果是 MongoDB 对话，调用 API 删除
      if (id && id.startsWith('mongo_')) {
        const mongoId = id.replace('mongo_', '')
        try {
          await api.smartSearch.deleteConversation(mongoId)
        } catch (err) {
          console.error('[deleteConversation] Failed to delete from MongoDB:', err)
          ElMessage.error('删除对话失败')
          return
        }
      }
      
      // 从本地列表移除
      const nextList = conversations.value.filter(c => c.id !== id)
      conversations.value = nextList
      
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

    const goFaultCaseDetail = (id) => {
      const s = String(id || '').trim()
      if (!s) return
      router.push(`/dashboard/fault-cases/${encodeURIComponent(s)}`)
    }

    const goBackToDashboard = () => {
      router.push('/dashboard')
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

    const getIntentLabel = (intent) => {
      const intentLabelMap = {
        troubleshoot: '排查/修复',
        lookup_fault_code: '查故障码',
        find_case: '找历史案例',
        definition: '概念解释',
        how_to_use: '使用方法',
        other: '不确定'
      }
      return intentLabelMap[intent] || intent || '未知'
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

    return {
      conversations,
      activeConversationId,
      activeMessages,
      questionCount,
      groupedConversations,
      draft,
      canSend,
      sending,
      messagesEl,
      MAX_INPUT_CHARS,
      currentUser,
      llmProviders,
      llmProvidersLoading,
      llmProviderId,
      onLlmProviderChange,
      currentLlmProviderLabel,
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
      ArrowLeft,
      ArrowRight,
      ArrowDown,
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
      sanitizeSnippet,
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
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
}

.ss-msg-time {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.6;
}

.ss-composer-wrap {
  padding: 14px 16px 18px;
  border-top: none;
  background: var(--black-white-white);
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

.ss-kb-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}

.ss-kb-ref {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
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

