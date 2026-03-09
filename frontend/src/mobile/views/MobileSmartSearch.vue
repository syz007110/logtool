<template>
  <div class="m-ss-page" :style="{ '--composer-offset': `${composerOffset}px` }">
    <!-- Header -->
    <van-nav-bar
      fixed
      placeholder
      class="m-ss-header"
      @click-right="startNewConversation"
    >
      <template #left>
        <div class="m-ss-header-left">
          <van-icon name="wap-nav" size="20" color="var(--m-color-text)" @click="showSidebar = true" />
        </div>
      </template>
      <template #title>
        <span class="m-ss-title">{{ activeConversationId ? activeConversation?.title || $t('smartSearch.smartSearch') : $t('smartSearch.newConversation') }}</span>
      </template>
      <template #right>
        <van-icon name="plus" size="20" color="var(--m-color-text)" />
      </template>
    </van-nav-bar>

    <!-- Sidebar (History) -->
    <van-popup
      v-model:show="showSidebar"
      position="left"
      class="m-ss-sidebar"
      :style="{ width: '80%', height: '100%' }"
    >
      <div class="sidebar-content">
        <div class="sidebar-header">
          <div class="logo-area">
            <img :src="logoSrc" alt="LogTool" class="logo-icon" />
            <span class="logo-text">LogTool AI</span>
          </div>
          <van-icon name="cross" size="20" color="var(--m-color-text-tertiary)" @click="showSidebar = false" />
        </div>

        <div class="new-conv-btn-wrap">
          <van-button 
            block 
            icon="plus" 
            class="m-ss-new-btn"
            @click="startNewConversation"
          >
            {{ $t('smartSearch.newConversation') }}
          </van-button>
        </div>

        <div class="history-list">
          <div class="history-label">{{ $t('smartSearch.history') }}</div>
          <van-empty v-if="conversations.length === 0" :description="$t('smartSearch.emptyHistory')" />
          <div v-else class="history-groups">
            <!-- Today -->
            <div v-if="groupedConversations.today.length > 0" class="history-group">
              <div class="group-title">{{ $t('smartSearch.today') }}</div>
              <div
                v-for="c in groupedConversations.today"
                :key="c.id"
                class="history-item"
                :class="{ active: c.id === activeConversationId, 'show-delete': longPressTargetId === c.id }"
                @click="handleHistoryItemClick(c.id)"
                @touchstart="handleLongPressStart($event, c.id)"
                @touchend="handleLongPressEnd"
                @touchcancel="handleLongPressEnd"
              >
                <span class="item-text">{{ c.title }}</span>
                <van-icon 
                  v-if="longPressTargetId === c.id"
                  name="delete-o" 
                  class="delete-icon" 
                  @click.stop.prevent="handleDeleteClick(c.id)"
                  @touchstart.stop
                  @touchend.stop.prevent="handleDeleteClick(c.id)"
                />
              </div>
            </div>
            <!-- Yesterday -->
            <div v-if="groupedConversations.yesterday.length > 0" class="history-group">
              <div class="group-title">{{ $t('smartSearch.yesterday') }}</div>
              <div
                v-for="c in groupedConversations.yesterday"
                :key="c.id"
                class="history-item"
                :class="{ active: c.id === activeConversationId, 'show-delete': longPressTargetId === c.id }"
                @click="handleHistoryItemClick(c.id)"
                @touchstart="handleLongPressStart($event, c.id)"
                @touchend="handleLongPressEnd"
                @touchcancel="handleLongPressEnd"
              >
                <span class="item-text">{{ c.title }}</span>
                <van-icon 
                  v-if="longPressTargetId === c.id"
                  name="delete-o" 
                  class="delete-icon" 
                  @click.stop.prevent="handleDeleteClick(c.id)"
                  @touchstart.stop
                  @touchend.stop.prevent="handleDeleteClick(c.id)"
                />
              </div>
            </div>
            <!-- Older -->
            <div v-if="groupedConversations.older.length > 0" class="history-group">
              <div class="group-title">{{ $t('smartSearch.older') }}</div>
              <div
                v-for="c in groupedConversations.older"
                :key="c.id"
                class="history-item"
                :class="{ active: c.id === activeConversationId, 'show-delete': longPressTargetId === c.id }"
                @click="handleHistoryItemClick(c.id)"
                @touchstart="handleLongPressStart($event, c.id)"
                @touchend="handleLongPressEnd"
                @touchcancel="handleLongPressEnd"
              >
                <span class="item-text">{{ c.title }}</span>
                <van-icon 
                  v-if="longPressTargetId === c.id"
                  name="delete-o" 
                  class="delete-icon" 
                  @click.stop.prevent="handleDeleteClick(c.id)"
                  @touchstart.stop
                  @touchend.stop.prevent="handleDeleteClick(c.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </van-popup>

    <!-- Main Content -->
    <div ref="messagesEl" class="m-ss-messages">
      <!-- Empty State -->
      <div v-if="activeMessages.length === 0" class="m-ss-empty">
        <h2 class="empty-title">{{ $t('mobile.smartSearch.emptyHelpTitle') }}</h2>
        
        <div class="m-quick-cards">
          <div class="m-quick-card" @click="handleQuickAction('fault_code')">
            <div class="card-icon warning">
              <van-icon name="warning-o" />
            </div>
            <div class="card-content">
              <h3>{{ $t('smartSearch.faultCodeQuery') }}</h3>
              <p>{{ $t('smartSearch.faultCodeQuerySubtitle') }}</p>
            </div>
          </div>
          
          <div class="m-quick-card" @click="handleQuickAction('fault_case')">
            <div class="card-icon case">
              <van-icon name="notes-o" />
            </div>
            <div class="card-content">
              <h3>{{ $t('smartSearch.faultCaseQuery') }}</h3>
              <p>{{ $t('smartSearch.faultCaseQuerySubtitle') }}</p>
            </div>
          </div>

          <div class="m-quick-card" @click="handleQuickAction('knowledge')">
            <div class="card-icon knowledge">
              <van-icon name="description" />
            </div>
            <div class="card-content">
              <h3>{{ $t('mobile.smartSearch.quickKnowledgeSearch') }}</h3>
              <p>{{ $t('mobile.smartSearch.quickKnowledgeSearchSubtitle') }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Message List -->
      <div v-else class="m-ss-thread">
        <div
          v-for="m in activeMessages"
          :key="m.id"
          class="m-ss-msg"
          :class="{ user: m.role === 'user', assistant: m.role === 'assistant' }"
        >
          <!-- User message -->
          <template v-if="m.role === 'user'">
            <div class="m-msg-bubble user-bubble">
              <div class="m-msg-text">{{ m.content }}</div>
            </div>
          </template>

          <!-- Assistant message -->
          <template v-else-if="m.type === 'loading'">
            <div class="m-msg-bubble ai-bubble loading-bubble">
              <van-loading size="18px">{{ $t('smartSearch.thinking') }}</van-loading>
            </div>
          </template>

          <template v-else-if="m.type === 'search_result' && m.payload && m.payload.ok">
            <div class="m-answer-content">
              <!-- 识别到的查询要点 -->
              <div v-if="m.payload.recognized && (m.payload.recognized.fullCodes?.length || m.payload.recognized.typeCodes?.length || m.payload.recognized.keywords?.length || m.payload.recognized.symptom?.length || m.payload.recognized.trigger?.length || m.payload.recognized.component?.length || m.payload.recognized.neg?.length || m.payload.recognized.intent || m.payload.recognized.days)" class="m-answer-section">
                <div class="m-answer-section-title">{{ $t('mobile.smartSearch.recognized.title') }}</div>
                <div class="m-answer-section-content">
                  <div class="m-query-points">
                    <template v-if="m.payload.recognized.intent">
                      <div>{{ $t('mobile.smartSearch.recognized.intent') }}: {{ getIntentLabel(m.payload.recognized.intent) }}</div>
                    </template>
                    <template v-if="m.payload.recognized.fullCodes?.length">
                      <div>{{ $t('mobile.smartSearch.recognized.faultCode') }}: {{ m.payload.recognized.fullCodes.join(' / ') }}</div>
                    </template>
                    <template v-else-if="m.payload.recognized.typeCodes?.length">
                      <div>{{ $t('mobile.smartSearch.recognized.faultType') }}: {{ m.payload.recognized.typeCodes.join(' / ') }}</div>
                    </template>
                    <template v-if="m.payload.recognized.keywords?.length">
                      <div>{{ $t('mobile.smartSearch.recognized.keywords') }}: {{ m.payload.recognized.keywords.join(' / ') }}</div>
                    </template>
                    <template v-if="m.payload.recognized.symptom?.length">
                      <div>{{ $t('mobile.smartSearch.recognized.symptom') }}: {{ m.payload.recognized.symptom.join(' / ') }}</div>
                    </template>
                    <template v-if="m.payload.recognized.trigger?.length">
                      <div>{{ $t('mobile.smartSearch.recognized.trigger') }}: {{ m.payload.recognized.trigger.join(' / ') }}</div>
                    </template>
                    <template v-if="m.payload.recognized.component?.length">
                      <div>{{ $t('mobile.smartSearch.recognized.component') }}: {{ m.payload.recognized.component.join(' / ') }}</div>
                    </template>
                    <template v-if="m.payload.recognized.neg?.length">
                      <div>{{ $t('mobile.smartSearch.recognized.negative') }}: {{ m.payload.recognized.neg.join(' / ') }}</div>
                    </template>
                    <template v-if="m.payload.recognized.days">
                      <div>{{ $t('mobile.smartSearch.recognized.lookbackDays') }}: {{ m.payload.recognized.days }} {{ $t('mobile.smartSearch.dayUnit') }}</div>
                    </template>
                  </div>
                </div>
              </div>

              <!-- find_case: 故障案例 -->
              <div v-if="m.payload.recognized?.intent === 'find_case' && m.payload.meta?.jiraError" class="m-answer-section">
                <div class="m-answer-section-title">{{ $t('mobile.smartSearch.sectionFaultCase') }}</div>
                <div class="m-answer-section-content">
                  <div class="m-jira-error">
                    <div class="m-error-title">{{ m.payload.meta.jiraError.timeout ? $t('mobile.smartSearch.jiraTimeout') : $t('mobile.smartSearch.jiraConnectionFailed') }}</div>
                    <div class="m-error-desc">{{ m.payload.meta.jiraError.message || $t('mobile.smartSearch.jiraFallbackCaseSkipped') }}</div>
                  </div>
                </div>
              </div>
              <div v-else-if="m.payload.recognized?.intent === 'find_case' && m.payload.sources && (m.payload.sources.cases || []).length > 0" class="m-answer-section">
                <div class="m-answer-section-title">{{ $t('mobile.smartSearch.sectionFaultCase') }}</div>
                <div class="m-answer-section-content">
                  <div
                    v-for="c in (m.payload.sources?.cases || [])"
                    :key="c.ref"
                    class="m-case-line"
                  >
                    <a
                      v-if="c.type === 'jira'"
                      class="m-case-link"
                      href="#"
                      @click.prevent="openSourcesDrawerAndExpand(m, c.ref)"
                    >
                      <span class="m-case-key">{{ c.key }}</span>
                      <span v-if="c.summary" class="m-case-summary">：{{ c.summary }}</span>
                      <span class="m-case-ref">[{{ c.ref }}]</span>
                    </a>
                    <a
                      v-else-if="c.type === 'mongo' && c.id"
                      class="m-case-link"
                      href="#"
                      @click.prevent="openSourcesDrawerAndExpand(m, c.ref)"
                    >
                      <span class="m-case-key">{{ c.title || c.id }}</span>
                      <span v-if="c.jira_key" class="m-case-summary">（Jira：{{ c.jira_key }}）</span>
                      <span class="m-case-ref">[{{ c.ref }}]</span>
                    </a>
                    <template v-else>
                      <span class="m-case-key">{{ c.title || c.key || c.id || '-' }}</span>
                      <span class="m-case-ref">[{{ c.ref }}]</span>
                    </template>
                  </div>
                </div>
              </div>

              <!-- 故障码解析 -->
              <div v-if="m.payload.recognized?.intent !== 'find_case' && m.payload.sources && (m.payload.sources.faultCodes || []).length > 0" class="m-answer-section">
                <div class="m-answer-section-title">{{ $t('mobile.smartSearch.sectionFaultCode') }}</div>
                <div class="m-answer-section-content">
                  <div
                    v-for="f in (m.payload.sources?.faultCodes || [])"
                    :key="f.ref"
                    class="m-fault-item"
                  >
                    <div class="m-fault-code-line">
                      <span class="m-fault-code">{{ f.subsystem ? `${f.subsystem} - ` : '' }}{{ f.code }}</span>
                      <span v-if="f.short_message" class="m-fault-message">：{{ f.short_message }}</span>
                      <span class="m-fault-ref">[{{ f.ref }}]</span>
                    </div>
                    
                    <!-- 解释 -->
                    <div v-if="f.explanation" class="m-fault-field">
                      <span class="m-fault-field-label">{{ $t('mobile.smartSearch.fieldExplanation') }}:</span>
                      <span class="m-fault-field-value">{{ f.explanation }}</span>
                    </div>
                    
                    <!-- 用户提示 -->
                    <div v-if="f.user_hint || f.operation" class="m-fault-field">
                      <span class="m-fault-field-label">{{ $t('mobile.smartSearch.fieldUserHint') }}:</span>
                      <span class="m-fault-field-value">{{ [f.user_hint, f.operation].filter(Boolean).join(' ') || '-' }}</span>
                    </div>
                    
                    <!-- 分类 -->
                    <div v-if="f.category" class="m-fault-field">
                      <span class="m-fault-field-label">{{ $t('mobile.smartSearch.fieldCategory') }}:</span>
                      <span class="m-fault-field-value">{{ f.category }}</span>
                    </div>
                    
                    <!-- 技术排查方案 -->
                    <div class="m-fault-field">
                      <span class="m-fault-field-label">{{ $t('mobile.smartSearch.fieldTechSolution') }}:</span>
                      <div class="m-fault-tech-solution">
                        <div v-if="f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution" class="m-fault-tech-solution-text">
                          {{ f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution }}
                        </div>
                        
                        <!-- 加载按钮 -->
                        <div v-if="f.id && !f.tech_solution && !faultTechSolutions.get(f.id)" class="m-fault-tech-load">
                          <van-button
                            size="small"
                            plain
                            :loading="faultTechSolutions.get(f.id)?.loading"
                            @click="loadTechSolution(f.id)"
                          >
                            {{ $t('mobile.smartSearch.loadTechSolution') }}
                          </van-button>
                        </div>
                        
                        <!-- 附件（图片可预览，PDF可点击） -->
                        <div v-if="faultTechSolutions.get(f.id)?.loading" class="m-fault-attachments">
                          <div class="m-fault-attachments-title">{{ $t('mobile.smartSearch.fieldAttachments') }}:</div>
                          <div class="m-fault-field-value">{{ $t('shared.loading') }}</div>
                        </div>
                        <div v-else-if="(faultTechSolutions.get(f.id)?.images || []).length > 0" class="m-fault-attachments">
                          <div class="m-fault-attachments-title">{{ $t('mobile.smartSearch.fieldAttachments') }}:</div>
                          <div class="m-fault-attachments-list">
                            <!-- 图片：可预览 -->
                            <div
                              v-for="(img, imgIdx) in (faultTechSolutions.get(f.id)?.images || []).filter(img => isImageFile(img))"
                              :key="img.uid || img.url"
                              class="m-fault-attachment-image"
                              @click="handleImagePreview(faultTechSolutions.get(f.id).images, imgIdx)"
                            >
                              <img
                                :src="getGenericAttachmentProxyUrl(img.url)"
                                class="m-attachment-image"
                                :alt="img.original_name || img.filename || $t('mobile.smartSearch.attachmentImage')"
                              />
                              <div class="m-attachment-image-name">{{ img.original_name || img.filename || $t('mobile.smartSearch.attachmentImage') }}</div>
                            </div>
                            <!-- PDF/其他文件：显示文件名，可点击下载 -->
                            <a
                              v-for="img in (faultTechSolutions.get(f.id)?.images || []).filter(img => !isImageFile(img))"
                              :key="img.uid || img.url"
                              class="m-fault-attachment-file"
                              :href="getGenericAttachmentProxyUrl(img.url)"
                              target="_blank"
                              rel="noopener noreferrer"
                              @click.stop
                            >
                              <span>{{ img.original_name || img.filename || $t('mobile.smartSearch.attachmentFile') }}</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- find_case: 故障码解析放到 Jira/Mongo 之后 -->
              <div v-if="m.payload.recognized?.intent === 'find_case' && m.payload.sources && (m.payload.sources.faultCodes || []).length > 0" class="m-answer-section">
                <div class="m-answer-section-title">{{ $t('mobile.smartSearch.sectionFaultCode') }}</div>
                <div class="m-answer-section-content">
                  <div
                    v-for="f in (m.payload.sources?.faultCodes || [])"
                    :key="f.ref"
                    class="m-fault-item"
                  >
                    <div class="m-fault-code-line">
                      <span class="m-fault-code">{{ f.subsystem ? `${f.subsystem} - ` : '' }}{{ f.code }}</span>
                      <span v-if="f.short_message" class="m-fault-message">：{{ f.short_message }}</span>
                      <span class="m-fault-ref">[{{ f.ref }}]</span>
                    </div>
                    
                    <!-- 解释 -->
                    <div v-if="f.explanation" class="m-fault-field">
                      <span class="m-fault-field-label">{{ $t('mobile.smartSearch.fieldExplanation') }}:</span>
                      <span class="m-fault-field-value">{{ f.explanation }}</span>
                    </div>
                    
                    <!-- 用户提示 -->
                    <div v-if="f.user_hint || f.operation" class="m-fault-field">
                      <span class="m-fault-field-label">{{ $t('mobile.smartSearch.fieldUserHint') }}:</span>
                      <span class="m-fault-field-value">{{ [f.user_hint, f.operation].filter(Boolean).join(' ') || '-' }}</span>
                    </div>
                    
                    <!-- 分类 -->
                    <div v-if="f.category" class="m-fault-field">
                      <span class="m-fault-field-label">{{ $t('mobile.smartSearch.fieldCategory') }}:</span>
                      <span class="m-fault-field-value">{{ f.category }}</span>
                    </div>
                    
                    <!-- 技术排查方案 -->
                    <div class="m-fault-field">
                      <span class="m-fault-field-label">{{ $t('mobile.smartSearch.fieldTechSolution') }}:</span>
                      <div class="m-fault-tech-solution">
                        <div v-if="f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution" class="m-fault-tech-solution-text">
                          {{ f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution }}
                        </div>
                        
                        <!-- 加载按钮 -->
                        <div v-if="f.id && !f.tech_solution && !faultTechSolutions.get(f.id)" class="m-fault-tech-load">
                          <van-button
                            size="small"
                            plain
                            :loading="faultTechSolutions.get(f.id)?.loading"
                            @click="loadTechSolution(f.id)"
                          >
                            {{ $t('mobile.smartSearch.loadTechSolution') }}
                          </van-button>
                        </div>
                        
                        <!-- 附件 -->
                        <div v-if="faultTechSolutions.get(f.id)?.loading" class="m-fault-attachments">
                          <div class="m-fault-attachments-title">{{ $t('mobile.smartSearch.fieldAttachments') }}:</div>
                          <div class="m-fault-field-value">{{ $t('shared.loading') }}</div>
                        </div>
                        <div v-else-if="(faultTechSolutions.get(f.id)?.images || []).length > 0" class="m-fault-attachments">
                          <div class="m-fault-attachments-title">{{ $t('mobile.smartSearch.fieldAttachments') }}:</div>
                          <div class="m-fault-attachments-list">
                            <!-- 图片：可预览 -->
                            <div
                              v-for="(img, imgIdx) in (faultTechSolutions.get(f.id)?.images || []).filter(img => isImageFile(img))"
                              :key="img.uid || img.url"
                              class="m-fault-attachment-image"
                              @click="handleImagePreview(faultTechSolutions.get(f.id).images, imgIdx)"
                            >
                              <img
                                :src="getGenericAttachmentProxyUrl(img.url)"
                                class="m-attachment-image"
                                :alt="img.original_name || img.filename || $t('mobile.smartSearch.attachmentImage')"
                              />
                              <div class="m-attachment-image-name">{{ img.original_name || img.filename || $t('mobile.smartSearch.attachmentImage') }}</div>
                            </div>
                            <!-- PDF/其他文件 -->
                            <a
                              v-for="img in (faultTechSolutions.get(f.id)?.images || []).filter(img => !isImageFile(img))"
                              :key="img.uid || img.url"
                              class="m-fault-attachment-file"
                              :href="getGenericAttachmentProxyUrl(img.url)"
                              target="_blank"
                              rel="noopener noreferrer"
                              @click.stop
                            >
                              <span>{{ img.original_name || img.filename || $t('mobile.smartSearch.attachmentFile') }}</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 相似案例（非 find_case） -->
              <div v-if="m.payload.recognized?.intent !== 'find_case' && m.payload.meta?.jiraError" class="m-answer-section">
                <div class="m-answer-section-title">{{ $t('mobile.smartSearch.sectionSimilarCases') }}</div>
                <div class="m-answer-section-content">
                  <div class="m-jira-error">
                    <div class="m-error-title">{{ m.payload.meta.jiraError.timeout ? $t('mobile.smartSearch.jiraTimeout') : $t('mobile.smartSearch.jiraConnectionFailed') }}</div>
                    <div class="m-error-desc">{{ m.payload.meta.jiraError.message || $t('mobile.smartSearch.jiraFallbackSimilarSkipped') }}</div>
                  </div>
                </div>
              </div>
              <div v-if="m.payload.recognized?.intent !== 'find_case' && m.payload.sources && (m.payload.sources.cases || []).length > 0" class="m-answer-section">
                <div class="m-answer-section-title">{{ $t('mobile.smartSearch.sectionSimilarCases') }}</div>
                <div class="m-answer-section-content">
                  <div
                    v-for="c in (m.payload.sources?.cases || [])"
                    :key="c.ref"
                    class="m-case-line"
                  >
                    <a
                      class="m-case-link"
                      href="#"
                      @click.prevent="openSourcesDrawerAndExpand(m, c.ref)"
                    >
                      <template v-if="c.type === 'jira'">
                        <span class="m-case-key">{{ c.key }}</span>
                        <span v-if="c.summary" class="m-case-summary">：{{ c.summary }}</span>
                        <span class="m-case-ref">[{{ c.ref }}]</span>
                      </template>
                      <template v-else>
                        <span class="m-case-key">{{ getMongoCase(c).case_code || getMongoCase(c).id || c.id || '-' }}</span>
                        <span class="m-case-summary">：{{ getMongoCase(c).title || c.title || '-' }}</span>
                        <span class="m-case-ref">[{{ c.ref }}]</span>
                      </template>
                    </a>
                  </div>
                </div>
              </div>

              <!-- Knowledge 知识库文档 -->
              <div v-if="m.payload.sources && (m.payload.sources.kbDocs || []).length > 0" class="m-answer-section">
                <div class="m-answer-section-title">{{ $t('mobile.smartSearch.kbSourcesCount', { count: (m.payload.sources.kbDocs || []).length }) }}</div>
                <div class="m-answer-section-content">
                  <div
                    v-for="(kb, idx) in (m.payload.sources?.kbDocs || []).slice(0, 5)"
                    :key="kb.ref || idx"
                    class="m-kb-item"
                  >
                    <div class="m-kb-header">
                      <span class="m-kb-ref">[{{ kb.ref }}]</span>
                      <span class="m-kb-title">{{ kb.title || '-' }}</span>
                    </div>
                    <div v-if="kb.headingPath" class="m-kb-heading">{{ kb.headingPath }}</div>
                    <div class="m-kb-snippet" v-html="sanitizeSnippet(kb.snippet)"></div>
                    <a class="m-kb-link" href="#" @click.prevent="openSourcesDrawerAndExpand(m, kb.ref)">{{ $t('mobile.smartSearch.viewDetail') }}</a>
                  </div>
                </div>
              </div>

              <!-- AI text response if any -->
              <div v-if="m.content" class="m-msg-bubble ai-bubble">
                <div class="m-msg-text" v-html="formatMarkdown(m.content)"></div>
              </div>

              <!-- 引导入口：当无检索结果时，使用与首页一致的 3 个卡片 -->
              <div
                v-if="m.payload.suggestedRoutes && m.payload.suggestedRoutes.length && ((m.payload.sources?.faultCodes || []).length + (m.payload.sources?.cases || []).length + (m.payload.sources?.jira || []).length + (m.payload.sources?.faultCases || []).length + (m.payload.sources?.kbDocs || []).length) === 0"
                class="m-answer-actions"
              >
                <div class="m-no-data-tip">{{ $t('smartSearch.noRelatedData') }}</div>
                <div class="m-quick-cards-inline">
                  <div class="m-quick-card" @click="handleQuickAction('fault_case')">
                    <div class="card-icon case"><van-icon name="notes-o" /></div>
                    <div class="card-content">
                      <h3>{{ $t('smartSearch.faultCaseQuery') }}</h3>
                      <p>{{ $t('smartSearch.faultCaseQuerySubtitle') }}</p>
                    </div>
                  </div>
                  <div class="m-quick-card" @click="handleQuickAction('fault_code')">
                    <div class="card-icon warning"><van-icon name="warning-o" /></div>
                    <div class="card-content">
                      <h3>{{ $t('smartSearch.faultCodeQuery') }}</h3>
                      <p>{{ $t('smartSearch.faultCodeQuerySubtitle') }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 来源标识 -->
              <div 
                v-if="(m.payload.sources?.faultCodes?.length || 0) + (m.payload.sources?.cases?.length || 0) + (m.payload.sources?.kbDocs?.length || 0) > 0" 
                class="m-sources-actions"
              >
                <div 
                  class="m-copy-button" 
                  @click="copyAnswer(m)"
                >
                  <svg class="m-copy-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                  </svg>
                </div>
                <div 
                  class="m-sources-button" 
                  @click="openSourcesDrawer(m)"
                >
                  <div class="m-sources-button-icons">
                    <div 
                      v-if="(m.payload.sources?.faultCodes || []).length > 0" 
                      class="m-source-icon m-source-icon-error-code"
                    >
                      <span class="m-source-icon-text">E</span>
                </div>
                    <div 
                      v-if="(m.payload.sources?.cases || []).length > 0" 
                      class="m-source-icon m-source-icon-fault-case"
                    >
                      <span class="m-source-icon-text">F</span>
                    </div>
                    <div 
                      v-if="(m.payload.sources?.kbDocs || []).length > 0" 
                      class="m-source-icon m-source-icon-knowledge"
                    >
                      <span class="m-source-icon-text">K</span>
                    </div>
                  </div>
                  <span class="m-sources-button-text">{{ $t('mobile.smartSearch.sources') }}</span>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="m-msg-bubble ai-bubble">
              <div class="m-msg-text" v-html="formatMarkdown(m.content || '')"></div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div ref="inputWrapRef" class="m-ss-input-wrap">
      <div class="input-container">
        <van-field
          v-model="draft"
          type="textarea"
          :autosize="{ minHeight: 24, maxHeight: 120 }"
          :placeholder="$t('smartSearch.placeholder')"
          class="m-ss-input"
          @keydown.enter.exact.prevent="send"
        />
        <van-button 
          class="m-send-btn" 
          :disabled="!canSend" 
          :loading="sending"
          @click="send"
        >
          <van-icon name="arrow-up" />
        </van-button>
      </div>
    </div>

    <!-- Sources Drawer -->
    <van-popup
      v-model:show="sourceDrawerVisible"
      position="bottom"
      round
      closeable
      class="m-source-drawer"
      :style="{ height: '80%' }"
    >
      <div class="drawer-content">
        <h3 class="drawer-title">{{ $t('mobile.smartSearch.sourcesDrawerTitle') }}</h3>
        <div v-if="currentSourceMessage" class="source-list">
          <!-- 故障码来源 -->
          <div v-if="(currentSourceMessage.payload?.sources?.faultCodes || []).length > 0" class="source-section">
            <div class="section-title">{{ $t('mobile.smartSearch.faultCodeSourcesCount', { count: currentSourceMessage.payload.sources.faultCodes.length }) }}</div>
            <div v-for="f in currentSourceMessage.payload.sources.faultCodes" :key="f.ref" class="source-card">
              <div class="source-header" @click="toggleSourceExpanded(f.ref, currentSourceMessage)">
                <span class="source-ref">[{{ f.ref }}]</span>
                <span class="source-text">{{ f.subsystem ? `${f.subsystem} - ` : '' }}{{ f.code }}</span>
                <span v-if="f.short_message" class="source-desc">：{{ f.short_message }}</span>
                <van-icon 
                  :name="expandedSources.has(f.ref) ? 'arrow-up' : 'arrow-down'" 
                  class="source-expand-icon"
                />
              </div>
              <div v-if="expandedSources.has(f.ref)" class="source-expanded">
                <div class="source-detail">
                  <!-- 解释 -->
                  <div v-if="f.explanation" class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.fieldExplanation') }}</div>
                    <div class="source-detail-value">{{ f.explanation }}</div>
                  </div>
                  
                  <!-- 用户提示 -->
                  <div v-if="f.user_hint || f.operation" class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.fieldUserHint') }}</div>
                    <div class="source-detail-value">{{ [f.user_hint, f.operation].filter(Boolean).join(' ') || '-' }}</div>
                  </div>
                  
                  <!-- 参数含义 -->
                  <div v-if="f.param1 || f.param2 || f.param3 || f.param4" class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.fieldParams') }}</div>
                    <div class="source-detail-params">
                      <div v-if="f.param1" class="source-detail-param">
                        <span class="param-label">{{ $t('mobile.smartSearch.param1') }}:</span>
                        <span class="param-value">{{ f.param1 }}</span>
                      </div>
                      <div v-if="f.param2" class="source-detail-param">
                        <span class="param-label">{{ $t('mobile.smartSearch.param2') }}:</span>
                        <span class="param-value">{{ f.param2 }}</span>
                      </div>
                      <div v-if="f.param3" class="source-detail-param">
                        <span class="param-label">{{ $t('mobile.smartSearch.param3') }}:</span>
                        <span class="param-value">{{ f.param3 }}</span>
                      </div>
                      <div v-if="f.param4" class="source-detail-param">
                        <span class="param-label">{{ $t('mobile.smartSearch.param4') }}:</span>
                        <span class="param-value">{{ f.param4 }}</span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 详细信息 -->
                  <div v-if="f.detail" class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.fieldDetail') }}</div>
                    <div class="source-detail-value">{{ f.detail }}</div>
                  </div>
                  
                  <!-- 检查方法 -->
                  <div v-if="f.method" class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.fieldMethod') }}</div>
                    <div class="source-detail-value">{{ f.method }}</div>
                  </div>
                  
                  <!-- 分类 -->
                  <div v-if="f.category" class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.fieldCategory') }}</div>
                    <div class="source-detail-value">{{ f.category }}</div>
                  </div>
                  
                  <!-- 技术排查方案 -->
                  <div class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.fieldTechSolution') }}</div>
                    <div v-if="f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution" class="source-detail-value source-tech-text">
                      {{ f.tech_solution || faultTechSolutions.get(f.id)?.tech_solution }}
                    </div>
                    <div v-else-if="f.id && !faultTechSolutions.get(f.id)" class="source-detail-value">
                      <van-button
                        size="small"
                        plain
                        :loading="faultTechSolutions.get(f.id)?.loading"
                        @click="loadTechSolution(f.id)"
                      >
                        {{ $t('mobile.smartSearch.loadTechSolution') }}
                      </van-button>
                    </div>
                    <div v-else class="source-detail-value">-</div>
                    
                    <!-- 附件 -->
                    <div v-if="(faultTechSolutions.get(f.id)?.images || []).length > 0" class="source-fault-attachments">
                      <div class="source-fault-attachments-title">{{ $t('mobile.smartSearch.fieldAttachments') }}:</div>
                      <div class="source-fault-attachments-list">
                        <!-- 图片：可预览 -->
                        <div
                          v-for="(img, imgIdx) in (faultTechSolutions.get(f.id)?.images || []).filter(img => isImageFile(img))"
                          :key="img.uid || img.url"
                          class="source-fault-attachment-image"
                          @click="handleImagePreview(faultTechSolutions.get(f.id).images, imgIdx)"
                        >
                          <img
                            :src="getGenericAttachmentProxyUrl(img.url)"
                            class="source-attachment-image"
                            :alt="img.original_name || img.filename || $t('mobile.smartSearch.attachmentImage')"
                          />
                          <div class="source-attachment-image-name">{{ img.original_name || img.filename || $t('mobile.smartSearch.attachmentImage') }}</div>
                        </div>
                        <!-- PDF/其他文件：显示文件名，可点击下载 -->
                        <a
                          v-for="img in (faultTechSolutions.get(f.id)?.images || []).filter(img => !isImageFile(img))"
                          :key="img.uid || img.url"
                          class="source-fault-attachment-file"
                          :href="getGenericAttachmentProxyUrl(img.url)"
                          target="_blank"
                          rel="noopener noreferrer"
                          @click.stop
                        >
                          <span>{{ img.original_name || img.filename || $t('mobile.smartSearch.attachmentFile') }}</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 故障案例来源 -->
          <div v-if="(currentSourceMessage.payload?.sources?.cases || []).length > 0" class="source-section">
            <div class="section-title">{{ $t('mobile.smartSearch.faultCaseSourcesCount', { count: currentSourceMessage.payload.sources.cases.length }) }}</div>
            <div v-for="c in currentSourceMessage.payload.sources.cases" :key="c.ref" class="source-card">
              <div class="source-header" @click="toggleSourceExpanded(c.ref, currentSourceMessage)">
                <span class="source-ref">[{{ c.ref }}]</span>
                <template v-if="c.type === 'jira'">
                  <span class="source-text">{{ c.key }}</span>
                  <span v-if="c.summary" class="source-desc">：{{ c.summary }}</span>
                </template>
                <template v-else-if="c.type === 'mongo'">
                  <span class="source-text">{{ (getMongoCase(c).case_code || getMongoCase(c).id || '-') }}：{{ getMongoCase(c).title || c.title || '-' }}</span>
                </template>
                <template v-else>
                  <span class="source-text">{{ c.title || c.key || c.id || '-' }}</span>
                </template>
                <van-icon 
                  :name="expandedSources.has(c.ref) ? 'arrow-up' : 'arrow-down'" 
                  class="source-expand-icon"
                />
              </div>
              <div v-if="expandedSources.has(c.ref)" class="source-expanded">
                <div class="source-detail">
                  <!-- Jira 故障案例 -->
                  <template v-if="c.type === 'jira'">
                    <div v-if="jiraIssueLoading[c.key]" class="source-case-loading">{{ $t('mobile.smartSearch.loadingJiraDetail') }}</div>

                    <!-- Header: Key / Project Name + Title -->
                    <div class="source-case-preview-header">
                      <div class="source-case-preview-key-project">
                        {{ getJiraCase(c).key || c.key || '-' }}<span v-if="getJiraCase(c).projectName"> / {{ getJiraCase(c).projectName }}</span>
                      </div>
                      <div class="source-case-preview-title">{{ getJiraCase(c).summary || c.summary || '-' }}</div>
                    </div>

                    <!-- Key Information -->
                    <div class="source-case-key-info">
                      <div class="source-case-info-item">
                        <div class="source-case-info-label">{{ $t('mobile.smartSearch.caseInfo.status') }}</div>
                        <van-tag v-if="getJiraCase(c).status" type="primary" size="small" class="source-case-status-tag">
                          {{ getJiraCase(c).status }}
                        </van-tag>
                        <span v-else class="source-case-info-empty">-</span>
                      </div>
                      <div class="source-case-info-item">
                        <div class="source-case-info-label">{{ $t('mobile.smartSearch.caseInfo.components') }}</div>
                        <div class="source-case-components">
                          <van-tag
                            v-for="(comp, idx) in (getJiraCase(c).components || [])"
                            :key="idx"
                            size="small"
                            class="source-case-component-tag"
                          >
                            {{ comp }}
                          </van-tag>
                          <span v-if="!getJiraCase(c).components || getJiraCase(c).components.length === 0" class="source-case-info-empty">-</span>
                        </div>
                      </div>
                      <div class="source-case-info-item">
                        <div class="source-case-info-label">{{ $t('mobile.smartSearch.caseInfo.resolution') }}</div>
                        <div class="source-case-info-value">
                          {{ getJiraCase(c).resolution?.name || $t('mobile.smartSearch.caseInfo.unresolved') }}
                        </div>
                      </div>
                      <div class="source-case-info-item">
                        <div class="source-case-info-label">{{ $t('mobile.smartSearch.caseInfo.updated') }}</div>
                        <div class="source-case-info-value">
                          {{ formatTime(getJiraCase(c).updated) || '-' }}
                        </div>
                      </div>
                    </div>

                    <!-- 模块信息 -->
                    <div v-if="(!getJiraCase(c).components || getJiraCase(c).components.length === 0) && getJiraCase(c).module" class="source-detail-section">
                      <div class="source-detail-label">{{ $t('mobile.smartSearch.module') }}</div>
                      <div class="source-detail-value">{{ getJiraCase(c).module }}</div>
                    </div>

                    <!-- Content Section -->
                    <template v-if="isComplaintProjectByCase(c)">
                      <div v-if="getJiraCase(c).customfield_12213" class="source-case-content-section">
                        <div class="source-case-content-label">{{ $t('mobile.smartSearch.caseSection.detailedDescription') }}</div>
                        <div class="source-case-content-box">{{ getJiraCase(c).customfield_12213 }}</div>
                      </div>
                      <div v-if="getJiraCase(c).customfield_12284" class="source-case-content-section">
                        <div class="source-case-content-label">{{ $t('mobile.smartSearch.caseSection.preliminaryInvestigation') }}</div>
                        <div class="source-case-content-box">{{ getJiraCase(c).customfield_12284 }}</div>
                      </div>
                      <div v-if="getJiraCase(c).customfield_12233" class="source-case-content-section">
                        <div class="source-case-content-label">{{ $t('mobile.smartSearch.caseSection.containmentMeasures') }}</div>
                        <div class="source-case-content-box">{{ getJiraCase(c).customfield_12233 }}</div>
                      </div>
                      <div v-if="getJiraCase(c).customfield_12239" class="source-case-content-section">
                        <div class="source-case-content-label">{{ $t('mobile.smartSearch.caseSection.longTermMeasures') }}</div>
                        <div class="source-case-content-box">{{ getJiraCase(c).customfield_12239 }}</div>
                      </div>
                      <div v-if="!getJiraCase(c).customfield_12213 && !getJiraCase(c).customfield_12284 && !getJiraCase(c).customfield_12233 && !getJiraCase(c).customfield_12239" class="source-case-content-section">
                        <div class="source-case-content-label">{{ $t('mobile.smartSearch.caseSection.detailedDescription') }}</div>
                        <div class="source-case-content-box">{{ getJiraCase(c).description || getJiraCase(c).summary || '-' }}</div>
                      </div>
                    </template>
                    <template v-else>
                      <div v-if="getJiraCase(c).description || getJiraCase(c).summary" class="source-case-content-section">
                        <div class="source-case-content-label">{{ $t('mobile.smartSearch.caseSection.description') }}</div>
                        <div class="source-case-content-box">{{ getJiraCase(c).description || getJiraCase(c).summary }}</div>
                      </div>
                      <div v-if="getJiraCase(c).customfield_10705" class="source-case-content-section">
                        <div class="source-case-content-label">{{ $t('mobile.smartSearch.caseSection.investigationAndCause') }}</div>
                        <div class="source-case-content-box">{{ getJiraCase(c).customfield_10705 }}</div>
                      </div>
                      <div v-if="getJiraCase(c).customfield_10600" class="source-case-content-section">
                        <div class="source-case-content-label">{{ $t('mobile.smartSearch.caseSection.solutionDetails') }}</div>
                        <div class="source-case-content-box">{{ getJiraCase(c).customfield_10600 }}</div>
                      </div>
                    </template>

                    <!-- Attachments Section -->
                    <div v-if="(getJiraCase(c).attachments || []).length > 0" class="source-case-attachments-section">
                      <div v-if="getJiraImageAttachments(c).length > 0" class="source-case-image-attachments">
                        <div class="source-case-attachment-label">{{ $t('mobile.smartSearch.caseSection.imageAttachments') }}</div>
                        <div class="source-case-attachment-images">
                          <div 
                            v-for="img in getJiraImageAttachments(c)" 
                            :key="img.id || img.filename" 
                            class="source-case-image-thumbnail"
                            @click="handleJiraImagePreview(c, img)"
                          >
                            <img
                              :src="getJiraImageSrc(img)"
                              class="source-case-attachment-image"
                              :alt="img.filename"
                            />
                            <div class="source-case-image-name">{{ img.filename }}</div>
                          </div>
                        </div>
                      </div>
                      <div v-if="getJiraFileAttachments(c).length > 0" class="source-case-file-attachments">
                        <div class="source-case-attachment-label">{{ $t('mobile.smartSearch.caseSection.fileAttachments') }}</div>
                        <div v-for="file in getJiraFileAttachments(c)" :key="file.id || file.filename" class="source-case-attachment-item">
                          <a
                            class="source-case-attachment-link"
                            :href="getJiraImageSrc(file)"
                            target="_blank"
                            rel="noopener noreferrer"
                            @click.stop
                          >
                            {{ file.filename }}
                          </a>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- MongoDB 故障案例 -->
                  <template v-else>
                    <div v-if="mongoCaseLoading[c.id]" class="source-case-loading">{{ $t('mobile.smartSearch.loadingFaultCaseDetail') }}</div>
                    <!-- Header: Key / ID + Title -->
                    <div class="source-case-preview-header">
                      <div class="source-case-preview-key-project">
                        {{ getMongoCase(c).case_code || getMongoCase(c).jira_key || getMongoCase(c).id || '-' }}<span v-if="getMongoCase(c).title">：{{ getMongoCase(c).title }}</span>
                      </div>
                      <div class="source-case-preview-title">{{ getMongoCase(c).title || '-' }}</div>
                    </div>

                    <!-- Key Information -->
                    <div class="source-case-key-info">
                      <div class="source-case-info-item">
                        <div class="source-case-info-label">{{ $t('mobile.smartSearch.caseInfo.status') }}</div>
                        <van-tag v-if="getMongoCase(c).status" type="primary" size="small" class="source-case-status-tag">
                          {{ getMongoCase(c).status }}
                        </van-tag>
                        <span v-else class="source-case-info-empty">-</span>
                      </div>
                      <div v-if="getMongoCase(c).description" class="source-detail-section">
                        <div class="source-detail-label">{{ $t('mobile.smartSearch.caseSection.description') }}</div>
                        <div class="source-detail-value">{{ getMongoCase(c).description }}</div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Knowledge 来源 -->
          <div v-if="(currentSourceMessage.payload?.sources?.kbDocs || []).length > 0" class="source-section">
            <div class="section-title">{{ $t('mobile.smartSearch.kbSourcesCount', { count: currentSourceMessage.payload.sources.kbDocs.length }) }}</div>
            <div v-for="(k, idx) in currentSourceMessage.payload.sources.kbDocs" :key="k.ref || idx" class="source-card">
              <div class="source-header" @click="toggleSourceExpanded(k.ref, currentSourceMessage)">
                <span class="source-ref">[{{ k.ref }}]</span>
                <span class="source-text">{{ k.title || '-' }}</span>
                <span v-if="k.headingPath" class="source-desc"> · {{ k.headingPath }}</span>
                <van-icon
                  :name="expandedSources.has(k.ref) ? 'arrow-up' : 'arrow-down'"
                  class="source-expand-icon"
                />
              </div>
              <div v-if="expandedSources.has(k.ref)" class="source-expanded">
                <div class="source-detail">
                  <div v-if="k.headingPath" class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.kbHeading') }}</div>
                    <div class="source-detail-value">{{ k.headingPath }}</div>
                  </div>
                  <div class="source-detail-section">
                    <div class="source-detail-label">{{ $t('mobile.smartSearch.kbSnippet') }}</div>
                    <div class="source-detail-value m-kb-snippet" v-html="sanitizeSnippet(k.snippet)"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </van-popup>
  </div>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import api from '@/api'
import { 
  NavBar as VanNavBar, 
  Icon as VanIcon, 
  Popup as VanPopup, 
  Button as VanButton,
  Empty as VanEmpty,
  Image as VanImage,
  Loading as VanLoading,
  Field as VanField,
  Tag as VanTag,
  Dialog,
  Toast,
  showToast,
  showSuccessToast,
  showImagePreview
} from 'vant'

export default {
  name: 'MobileSmartSearch',
  components: {
    VanNavBar,
    VanIcon,
    VanPopup,
    VanButton,
    VanEmpty,
    VanImage,
    VanLoading,
    VanField,
    VanTag
  },
  setup() {
    const { t, locale } = useI18n()
    const router = useRouter()
    const store = useStore()

    const showSidebar = ref(false)
    const sourceDrawerVisible = ref(false)
    const currentSourceMessage = ref(null)
    const draft = ref('')
    const sending = ref(false)
    const messagesEl = ref(null)
    const inputWrapRef = ref(null)
    const composerOffset = ref(220)
    
    // 长按相关
    const longPressTimer = ref(null)
    const longPressTargetId = ref(null)
    
    // 技术排查方案缓存
    const faultTechSolutions = ref(new Map()) // Map<faultId, { tech_solution, images, loading }>
    const mongoCaseCache = ref({}) // Record<string, faultCase>
    const mongoCaseLoading = ref({}) // Record<string, boolean>
    const expandedSources = ref(new Set()) // 展开的来源 ref 集合
    // Jira issue detail cache for SmartSearch sources drawer (key -> issue detail)
    const jiraIssueCache = ref({}) // Record<string, issue>
    const jiraIssueLoading = ref({}) // Record<string, boolean>

    const currentUser = computed(() => store.state.auth.user)
    const conversations = ref([])
    const activeConversationId = ref(null)
    const activeConversation = computed(() => 
      conversations.value.find(c => c.id === activeConversationId.value)
    )
    const activeMessages = computed(() => activeConversation.value?.messages || [])

    // LLM Provider
    const llmProviders = ref([])
    const llmProvidersLoading = ref(false)
    const llmProviderId = ref('')
    const logoSrc = `${process.env.BASE_URL || '/'}Icons/logo.svg`
    const HISTORY_LIMIT = 50
    const userKey = computed(() => {
      const u = currentUser.value || {}
      return u.id || u.user_id || u.username || 'anonymous'
    })

    const canSend = computed(() => draft.value.trim().length > 0 && !sending.value)

    const defaultConversationTitle = computed(() => t('smartSearch.newConversation'))
    const isDefaultConversationTitle = (title) =>
      !title || title === defaultConversationTitle.value || title === '新对话'

    const normalizeTitle = (text) => {
      if (!text) return defaultConversationTitle.value
      const trimmed = text.trim()
      if (trimmed.length <= 20) return trimmed
      return trimmed.substring(0, 20) + '...'
    }

    const loadConversations = async () => {
      try {
        // 优先从 MongoDB 加载
      try {
        const resp = await api.smartSearch.getConversations({ limit: HISTORY_LIMIT })
          if (resp?.data?.conversations?.length > 0) {
            // MongoDB 对话：添加 mongo_ 前缀标识
            conversations.value = resp.data.conversations
              .slice(0, HISTORY_LIMIT)
              .map(conv => ({
                ...conv,
                id: `mongo_${conv.id}`
              }))
            // 确保每个对话都有标题
            conversations.value.forEach(conv => {
              if (isDefaultConversationTitle(conv.title)) {
                const firstUserMsg = (conv.messages || []).find(m => m && m.role === 'user')
                if (firstUserMsg && firstUserMsg.content) {
                  conv.title = normalizeTitle(firstUserMsg.content)
                }
              }
            })
          } else {
            // MongoDB 为空，fallback 到 localStorage（仅读取，不迁移）
            const raw = localStorage.getItem(`smartSearchHistory:${userKey.value}`)
            const parsed = raw ? JSON.parse(raw) : []
            conversations.value = Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : []
            // 确保每个对话都有标题
            conversations.value.forEach(conv => {
              if (isDefaultConversationTitle(conv.title)) {
                const firstUserMsg = (conv.messages || []).find(m => m && m.role === 'user')
                if (firstUserMsg && firstUserMsg.content) {
                  conv.title = normalizeTitle(firstUserMsg.content)
                }
              }
            })
          }
        } catch (apiErr) {
          // 网络错误时 fallback 到 localStorage
          console.warn('[loadConversations] API error, fallback to localStorage:', apiErr)
          const raw = localStorage.getItem(`smartSearchHistory:${userKey.value}`)
          const parsed = raw ? JSON.parse(raw) : []
          conversations.value = Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : []
          // 确保每个对话都有标题
          conversations.value.forEach(conv => {
            if (isDefaultConversationTitle(conv.title)) {
              const firstUserMsg = (conv.messages || []).find(m => m && m.role === 'user')
              if (firstUserMsg && firstUserMsg.content) {
                conv.title = normalizeTitle(firstUserMsg.content)
              }
            }
          })
        }
      } catch (err) {
        console.error('[loadConversations] error:', err)
        conversations.value = []
      }
    }

    const startNewConversation = () => {
      activeConversationId.value = null
      showSidebar.value = false
    }

    const selectConversation = async (id) => {
      activeConversationId.value = id
      showSidebar.value = false
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
      
      scrollToBottom(true)
    }

    const deleteConversation = async (id) => {
      try {
        // 如果是 MongoDB 对话，需要去掉 mongo_ 前缀
        const mongoId = id && id.startsWith('mongo_') ? id.replace('mongo_', '') : id
        await api.smartSearch.deleteConversation(mongoId)
        conversations.value = conversations.value.filter(c => c.id !== id)
        if (activeConversationId.value === id) {
          activeConversationId.value = null
        }
        // 清除长按状态
        longPressTargetId.value = null
      } catch (e) {
        Toast.fail(t('shared.deleteFailed'))
      }
    }

    const handleLongPressStart = (event, id) => {
      longPressTargetId.value = null
      longPressTimer.value = setTimeout(() => {
        // 长按触发（500ms），显示删除按钮
        longPressTargetId.value = id
        // 触觉反馈（如果支持）
        if (navigator.vibrate) {
          navigator.vibrate(50)
        }
      }, 500)
    }

    const handleLongPressEnd = () => {
      if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
      }
    }

    const handleHistoryItemClick = (id) => {
      // 删除模式下，点击当前项不做跳转，避免误触并吞掉删除点击
      if (longPressTargetId.value === id) {
        return
      }
      // 若其它项处于删除模式，先退出删除模式
      if (longPressTargetId.value && longPressTargetId.value !== id) {
        longPressTargetId.value = null
      }
      // 正常选择对话
      selectConversation(id)
    }

    const handleDeleteClick = async (id) => {
      // 移动端长按后再次点击即直接删除，避免确认弹窗在侧边栏内交互不稳定
      await deleteConversation(id)
    }

    const groupedConversations = computed(() => {
      const today = []
      const yesterday = []
      const older = []
      const now = new Date()
      const todayStart = new Date(now.setHours(0, 0, 0, 0))
      const yesterdayStart = new Date(new Date(todayStart).setDate(todayStart.getDate() - 1))

      conversations.value.forEach(c => {
        const date = new Date(c.updatedAt || c.createdAt)
        if (date >= todayStart) today.push(c)
        else if (date >= yesterdayStart) yesterday.push(c)
        else older.push(c)
      })

      return { today, yesterday, older }
    })

    const send = async () => {
      if (!canSend.value) return
      const text = draft.value.trim()
      draft.value = ''
      sending.value = true

      let conv = activeConversation.value
      if (!conv) {
        try {
          const resp = await api.smartSearch.createConversation({ title: normalizeTitle(text) })
          const created = resp?.data?.conversation
          if (created?.id) {
            conv = {
              ...created,
              id: `mongo_${created.id}`,
              messages: []
            }
          conversations.value.unshift(conv)
          activeConversationId.value = conv.id
          } else {
            throw new Error('Failed to create conversation')
          }
        } catch (e) {
          Toast.fail(t('shared.requestFailed'))
          sending.value = false
          return
        }
      }

      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString()
      }
      conv.messages.push(userMsg)
      
      const loadingMsgId = 'loading-' + Date.now()
      conv.messages.push({
        id: loadingMsgId,
        role: 'assistant',
        type: 'loading',
        createdAt: new Date().toISOString()
      })

      scrollToBottom(true)

      try {
        const resp = await api.smartSearch.search({
          conversationId: conv.id,
          query: text,
          llmProviderId: llmProviderId.value || undefined
        })

        const result = resp.data
        const loadingIndex = conv.messages.findIndex(m => m.id === loadingMsgId)
        
        const assistantMsg = {
          id: result.id || Date.now().toString(),
          role: 'assistant',
          type: 'search_result',
          content: result.answer || '',
          payload: result,
          createdAt: new Date().toISOString()
        }

        // Apply recommendation logic
        const intent = result.recognized?.intent
        const hasFaultCodes = (result.sources?.faultCodes || []).length > 0
        const hasCases = (result.sources?.cases || []).length > 0 || (result.sources?.jira || []).length > 0
        const hasAnyResults = hasFaultCodes || hasCases

        if ((intent === 'find_case' || intent === 'troubleshoot') && !hasCases) {
          assistantMsg.recommendation = {
            type: 'fault_case',
            title: t('smartSearch.faultCaseQuery'),
            text: t('smartSearch.faultCaseQuerySubtitle'),
            path: '/m/surgeries'
          }
        } else if (intent === 'lookup_fault_code' && !hasFaultCodes) {
          assistantMsg.recommendation = {
            type: 'fault_code',
            title: t('smartSearch.faultCodeQuery'),
            text: t('smartSearch.faultCodeQuerySubtitle'),
            path: '/m/error'
          }
        } else if ((intent === 'how_to_use' || intent === 'definition' || intent === 'other') && !hasAnyResults) {
          assistantMsg.recommendation = {
            type: 'multiple'
          }
        }

        if (loadingIndex >= 0) {
          conv.messages.splice(loadingIndex, 1, assistantMsg)
        } else {
          conv.messages.push(assistantMsg)
        }

        // 更新标题（首问时）
        if (isDefaultConversationTitle(conv.title)) {
          conv.title = normalizeTitle(text)
        }
        conv.updatedAt = new Date().toISOString()

        // 持久化到 MongoDB
        try {
          const mongoId = conv.id && conv.id.startsWith('mongo_') ? conv.id.replace('mongo_', '') : null
          if (mongoId) {
            const metadata = {
              intent: result.recognized?.intent || null,
              llmProvider: result.meta?.llmProvider || llmProviderId.value || null,
              llmModel: result.meta?.llmModel || null
            }
            await api.smartSearch.updateConversation(mongoId, {
              title: conv.title,
              messages: conv.messages,
              metadata
            })
          }
        } catch (persistErr) {
          console.error('[send] Failed to persist conversation:', persistErr)
          // 不阻止用户继续使用，只记录错误
        }

        scrollToBottom(true)
      } catch (e) {
        const loadingIndex = conv.messages.findIndex(m => m.id === loadingMsgId)
        const errorMsg = {
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: t('shared.requestFailed'),
          createdAt: new Date().toISOString()
        }
        if (loadingIndex >= 0) {
          conv.messages.splice(loadingIndex, 1, errorMsg)
        } else {
          conv.messages.push(errorMsg)
        }
      } finally {
        sending.value = false
      }
    }

    const handleQuickAction = (type) => {
      if (type === 'fault_code') {
        draft.value = t('mobile.smartSearch.quickDraftFaultCode')
      } else if (type === 'upload') {
        router.push({ name: 'MLogs' })
      } else if (type === 'fault_case') {
        draft.value = t('mobile.smartSearch.quickDraftFaultCase')
      } else if (type === 'knowledge') {
        draft.value = t('mobile.smartSearch.quickDraftKnowledge')
      }
    }

    const navigateTo = (path) => {
      router.push(path)
    }

    const openSourcesDrawer = (m) => {
      currentSourceMessage.value = m
      sourceDrawerVisible.value = true
      expandedSources.value.clear()
    }

    const AUTO_SCROLL_THRESHOLD = 96
    const updateComposerOffset = () => {
      nextTick(() => {
        const inputRect = inputWrapRef.value?.getBoundingClientRect?.()
        const listRect = messagesEl.value?.getBoundingClientRect?.()
        if (!inputRect || !listRect) {
          composerOffset.value = 260
          return
        }
        // 真实被 fixed 输入区覆盖的高度（而不是估算）
        const overlap = Math.max(0, listRect.bottom - inputRect.top)
        composerOffset.value = Math.ceil(overlap + 24)
      })
    }

    const isNearBottom = () => {
      const el = messagesEl.value
      if (!el) return true
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight)
      return distance <= AUTO_SCROLL_THRESHOLD
    }

    const scrollToBottom = (force = false) => {
      nextTick(() => {
        if (!messagesEl.value) return
        if (!force && !isNearBottom()) return
        requestAnimationFrame(() => {
          if (messagesEl.value) {
            messagesEl.value.scrollTop = messagesEl.value.scrollHeight
          }
        })
      })
    }

    const formatMarkdown = (text) => {
      if (!text) return ''
      return text.replace(/\n/g, '<br/>')
    }

    const getIntentLabel = (intent) => {
      const intentLabelMap = {
        troubleshoot: t('mobile.smartSearch.intent.troubleshoot'),
        lookup_fault_code: t('mobile.smartSearch.intent.lookupFaultCode'),
        find_case: t('mobile.smartSearch.intent.findCase'),
        definition: t('mobile.smartSearch.intent.definition'),
        how_to_use: t('mobile.smartSearch.intent.howToUse'),
        other: t('mobile.smartSearch.intent.other')
      }
      return intentLabelMap[intent] || intent || t('shared.unknown')
    }

    const escapeHtml = (s) => String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    // 仅允许 <em> 高亮标签
    const sanitizeSnippet = (html) => {
      const raw = String(html || '')
      const OPEN = '___M_EM_OPEN___'
      const CLOSE = '___M_EM_CLOSE___'
      const withTokens = raw
        .replace(/<\s*em\s*>/gi, OPEN)
        .replace(/<\s*\/\s*em\s*>/gi, CLOSE)
      const escaped = escapeHtml(withTokens)
      return escaped
        .replaceAll(OPEN, '<em>')
        .replaceAll(CLOSE, '</em>')
    }

    const copyAnswer = async (message) => {
      if (!message) return
      
      const parts = []
      
      // AI文本回复
      if (message.content) {
        // 移除HTML标签，只保留文本
        const textContent = message.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
        if (textContent) {
          parts.push(textContent)
        }
      }
      
      // 故障码解析
      const faultCodes = message.payload?.sources?.faultCodes || []
      if (faultCodes.length > 0) {
        parts.push(`\n【${t('mobile.smartSearch.sectionFaultCode')}】`)
        faultCodes.forEach((f, idx) => {
          const code = f.subsystem ? `${f.subsystem} - ${f.code}` : f.code
          parts.push(`${idx + 1}. ${code}${f.short_message ? '：' + f.short_message : ''}`)
          if (f.explanation) parts.push(`   ${t('mobile.smartSearch.fieldExplanation')}：${f.explanation}`)
          if (f.user_hint || f.operation) {
            parts.push(`   ${t('mobile.smartSearch.fieldSuggestion')}：${[f.user_hint, f.operation].filter(Boolean).join(' ')}`)
          }
          if (f.category) parts.push(`   ${t('mobile.smartSearch.fieldCategory')}：${f.category}`)
        })
      }
      
      // 故障案例
      const cases = message.payload?.sources?.cases || []
      if (cases.length > 0) {
        parts.push(`\n【${t('mobile.smartSearch.sectionFaultCase')}】`)
        cases.forEach((c, idx) => {
          if (c.type === 'jira') {
            parts.push(`${idx + 1}. ${c.key}${c.summary ? '：' + c.summary : ''}`)
          } else {
            parts.push(`${idx + 1}. ${c.title || c.key || c.id || '-'}`)
          }
        })
      }

      // Knowledge 来源
      const kbDocs = message.payload?.sources?.kbDocs || []
      if (kbDocs.length > 0) {
        parts.push(`\n【${t('mobile.smartSearch.kbSection')}】`)
        kbDocs.forEach((k, idx) => {
          parts.push(`${idx + 1}. ${k.title || '-'}${k.headingPath ? ' · ' + k.headingPath : ''}`)
          if (k.snippet) {
            const plainSnippet = String(k.snippet).replace(/<[^>]*>/g, '').trim()
            if (plainSnippet) parts.push(`   ${plainSnippet}`)
          }
        })
      }
      
      const textToCopy = parts.join('\n')
      
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy)
          showSuccessToast(t('mobile.smartSearch.copySuccess'))
        } else {
          // 降级方案：使用传统方法
          const textarea = document.createElement('textarea')
          textarea.value = textToCopy
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
          showSuccessToast(t('mobile.smartSearch.copySuccess'))
        }
      } catch (err) {
        console.error('Copy failed:', err)
        showToast(t('mobile.smartSearch.copyFailed'))
      }
    }

    // 技术排查方案相关函数
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

    // 判断 URL 是否需要代理
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

    // 通用附件代理 URL 函数
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

    // 图片预览函数（参照 ErrorQuery.vue）
    const handleImagePreview = (images, index) => {
      if (!Array.isArray(images)) return
      const imageList = images
        .filter(img => isImageFile(img))
        .map(img => getGenericAttachmentProxyUrl(img.url))
        .filter(Boolean)

      if (!imageList.length) {
        showToast(t('shared.noData'))
        return
      }

      const start = Math.max(0, Math.min(index, imageList.length - 1))
      
      try {
        showImagePreview({
          images: imageList,
          startPosition: start,
          closeable: true,
          showIndex: true,
          swipeDuration: 300,
          minZoom: 1,
          maxZoom: 3
        })
      } catch (error) {
        console.error('[图片预览] 预览失败:', error)
        // 降级方案：直接打开图片
        window.open(imageList[start], '_blank')
      }
    }

    const getMongoCase = (item) => {
      const id = String(item?.id || item?._id || item?.fault_case_id || '').trim()
      if (id && mongoCaseCache.value[id]) {
        return { ...(item || {}), ...(mongoCaseCache.value[id] || {}), id }
      }
      return item || {}
    }

    const ensureMongoCaseLoaded = async (mongoId, item) => {
      if (mongoCaseCache.value[mongoId] || mongoCaseLoading.value[mongoId]) return
      mongoCaseLoading.value[mongoId] = true
      try {
        const resp = await api.faultCases.getById(mongoId)
        if (resp?.data) {
          mongoCaseCache.value[mongoId] = resp.data
        }
      } catch (_) {
        // ignore
      } finally {
        mongoCaseLoading.value[mongoId] = false
      }
    }

    const toggleSourceExpanded = (ref, message) => {
      if (expandedSources.value.has(ref)) {
        expandedSources.value.delete(ref)
      } else {
        expandedSources.value.add(ref)
        // If this is a Jira case, fetch full detail on demand
        const sources = message?.payload?.sources || {}
        const cases = Array.isArray(sources.cases) ? sources.cases : []
        const item = cases.find(c => String(c.ref || '') === String(ref || ''))
        if (item && item.type === 'jira' && item.key) {
          ensureJiraIssueLoaded(item.key, item)
        }
        // If this is a MongoDB fault case item, fetch full detail on demand
        const isMongo = item && (item.type === 'mongo' || item.source === 'mongo' || item.id)
        const mongoId = isMongo ? String(item.id || item.fault_case_id || item._id || '').trim() : ''
        if (mongoId) ensureMongoCaseLoaded(mongoId, item)
      }
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

    const getJiraImageSrc = (attachment) => {
      const url = getAttachmentUrl(attachment)
      return getGenericAttachmentProxyUrl(url)
    }

    const getJiraImagePreviewUrls = (item) => {
      const images = getJiraImageAttachments(item)
      return images.map(img => getJiraImageSrc(img))
    }

    const getJiraImageIndex = (item, currentImg) => {
      const images = getJiraImageAttachments(item)
      return images.findIndex(img => (img.id || img.filename) === (currentImg.id || currentImg.filename))
    }

    // Jira 图片预览函数
    const handleJiraImagePreview = (item, currentImg) => {
      const images = getJiraImageAttachments(item)
      if (!images.length) {
        showToast(t('shared.noData'))
        return
      }
      
      const imageList = images.map(img => getJiraImageSrc(img))
      const start = getJiraImageIndex(item, currentImg)
      
      try {
        showImagePreview({
          images: imageList,
          startPosition: start,
          closeable: true,
          showIndex: true,
          swipeDuration: 300,
          minZoom: 1,
          maxZoom: 3
        })
      } catch (error) {
        console.error('[Jira图片预览] 预览失败:', error)
        // 降级方案：直接打开图片
        window.open(imageList[start], '_blank')
      }
    }

    const formatTime = (time) => {
      if (!time) return ''
      try {
        const date = new Date(time)
        return date.toLocaleString(locale.value || 'zh-CN', {
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      } catch {
        return String(time)
      }
    }

    const openSourcesDrawerAndExpand = (message, ref) => {
      openSourcesDrawer(message)
      const r = String(ref || '').trim()
      if (!r) return
      // 自动展开并触发对应来源（Jira/Mongo）详情懒加载
      if (!expandedSources.value.has(r)) {
        toggleSourceExpanded(r, message)
      }
    }

    // LLM Provider：默认使用第一个，不提供前端切换
    const loadLlmProviders = async () => {
      llmProvidersLoading.value = true
      try {
        const resp = await api.smartSearch.getLlmProviders()
        const data = resp?.data || {}
        const list = Array.isArray(data.providers) ? data.providers : []
        llmProviders.value = list
        llmProviderId.value = list[0]?.id || ''
      } catch (_) {
        llmProviderId.value = ''
      } finally {
        llmProvidersLoading.value = false
      }
    }

    // 监听侧边栏关闭，清除长按状态
    watch(showSidebar, (newVal) => {
      if (!newVal) {
        longPressTargetId.value = null
      }
    })

    watch(draft, () => {
      updateComposerOffset()
    })

    watch(() => activeMessages.value.length, () => {
      updateComposerOffset()
    })

    onMounted(() => {
      loadConversations()
      loadLlmProviders()
      updateComposerOffset()
      window.addEventListener('resize', updateComposerOffset)
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateComposerOffset)
        window.visualViewport.addEventListener('scroll', updateComposerOffset)
      }
    })

    onBeforeUnmount(() => {
      window.removeEventListener('resize', updateComposerOffset)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateComposerOffset)
        window.visualViewport.removeEventListener('scroll', updateComposerOffset)
      }
    })

    return {
      showSidebar,
      sourceDrawerVisible,
      currentSourceMessage,
      draft,
      sending,
      messagesEl,
      inputWrapRef,
      composerOffset,
      currentUser,
      logoSrc,
      conversations,
      activeConversationId,
      activeConversation,
      activeMessages,
      canSend,
      groupedConversations,
      startNewConversation,
      selectConversation,
      deleteConversation,
      handleLongPressStart,
      handleLongPressEnd,
      handleHistoryItemClick,
      handleDeleteClick,
      longPressTargetId,
      send,
      handleQuickAction,
      navigateTo,
      openSourcesDrawer,
      openSourcesDrawerAndExpand,
      toggleSourceExpanded,
      formatMarkdown,
      sanitizeSnippet,
      getIntentLabel,
      llmProviders,
      llmProvidersLoading,
      llmProviderId,
      faultTechSolutions,
      loadTechSolution,
      isImageFile,
      getGenericAttachmentProxyUrl,
      getImagePreviewList,
      getImageIndex,
      handleImagePreview,
      getMongoCase,
      mongoCaseCache,
      expandedSources,
      copyAnswer,
      jiraIssueLoading,
      getJiraCase,
      isComplaintProjectByCase,
      getJiraImageAttachments,
      getJiraFileAttachments,
      getJiraImageSrc,
      getJiraImagePreviewUrls,
      getJiraImageIndex,
      handleJiraImagePreview,
      formatTime
    }
  }
}
</script>

<style scoped>
.m-ss-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--m-color-surface);
  overflow: hidden; /* 防止页面整体滚动 */
}

.m-ss-header {
  background: var(--m-color-surface);
}

.m-ss-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.m-ss-header-left .van-icon {
  cursor: pointer;
}

/* LLM 选择器 - 在左侧插槽中 */
.m-llm-trigger {
  display: flex;
  align-items: center;
  gap: var(--m-space-1);
  padding: 2px 6px;
  font-size: var(--m-font-size-xs);
  color: var(--m-color-text-secondary);
  cursor: pointer;
  background: transparent;
}

/* 标题 - 居中显示 */
.m-ss-title {
  font-weight: 600;
  font-size: var(--m-font-size-lg);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m-color-text);
}

.m-llm-icon-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
}

.m-llm-icon {
  font-size: var(--m-font-size-md);
  color: var(--m-color-text-secondary);
}

.m-llm-name {
  font-size: var(--m-font-size-xs);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-llm-arrow {
  font-size: 10px;
  color: var(--gray-400);
}

.m-llm-selector-popup {
  max-height: 60vh;
}

.m-llm-selector-content {
  padding: 16px;
}

.m-llm-selector-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 16px;
  text-align: center;
}

.m-llm-cell-active {
  background: var(--m-color-brand-soft);
}

.m-llm-cell-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  margin-right: 8px;
}

.m-llm-cell-icon {
  font-size: 20px;
  margin-right: 8px;
  color: var(--m-color-text-secondary);
}

.m-ss-sidebar {
  display: flex;
  flex-direction: column;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--m-space-4);
  background: var(--m-color-bg);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 24px;
  height: 24px;
}

.logo-text {
  font-weight: 600;
  font-size: var(--m-font-size-xl);
  color: var(--m-color-text);
}

.new-conv-btn-wrap {
  margin-bottom: 24px;
}

.m-ss-new-btn {
  border-radius: var(--m-radius-md);
  border: 1px solid var(--m-color-border);
  color: var(--m-color-text);
}

.history-list {
  flex: 1;
  overflow-y: auto;
}

.history-label {
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text-secondary);
  margin-bottom: var(--m-space-3);
}

.history-group {
  margin-bottom: var(--m-space-5);
}

.group-title {
  font-size: var(--m-font-size-sm);
  color: var(--gray-400);
  margin-bottom: var(--m-space-2);
}

.history-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--m-radius-md);
  margin-bottom: 4px;
  transition: all 0.2s ease;
  position: relative;
  background: var(--m-color-surface);
  border: 1px solid transparent;
}

.history-item.active {
  background: var(--m-color-brand-soft);
  border-color: var(--blue-200);
}

.history-item.show-delete {
  background: var(--m-color-surface);
  border-color: var(--red-300);
  box-shadow: 0 2px 8px rgba(238, 10, 36, 0.15), 0 0 0 1px rgba(238, 10, 36, 0.08);
  transform: none;
  z-index: 10;
  margin: 0;
}

.item-text {
  flex: 1;
  font-size: var(--m-font-size-md);
  color: var(--m-color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delete-icon {
  flex-shrink: 0;
  color: var(--red-500);
  font-size: 20px;
  margin-left: 12px;
  padding: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--red-50);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.delete-icon:active {
  transform: scale(0.9);
  background: var(--red-100);
}

.m-ss-messages {
  flex: 1;
  min-height: 0; /* 确保flex子元素可以缩小 */
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--m-space-4);
  padding-bottom: calc(var(--composer-offset, 220px) + env(safe-area-inset-bottom));
  /* 滚动区域只包含内容，不包含导航栏和输入框 */
  -webkit-overflow-scrolling: touch; /* iOS 平滑滚动 */
  overscroll-behavior-y: contain;
  background: var(--m-color-surface);
}

.m-ss-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80%;
}

.empty-title {
  font-size: var(--m-font-size-xl);
  font-weight: 600;
  margin-bottom: var(--m-space-6);
  color: var(--m-color-text);
}

.m-quick-cards {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.m-quick-card {
  background: var(--m-color-surface);
  border: 1px solid var(--m-color-border);
  border-radius: var(--m-radius-lg);
  padding: var(--m-space-4);
  display: flex;
  align-items: center;
  gap: var(--m-space-3);
  box-shadow: var(--m-shadow-card);
  touch-action: manipulation;
}

.card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--m-color-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.card-icon.warning { color: var(--red-500); background: var(--red-50); }
.card-icon.upload { color: var(--green-500); background: var(--green-50); }
.card-icon.case { color: var(--orange-500); background: var(--orange-50); }
.card-icon.knowledge { color: var(--m-color-brand); background: var(--blue-50); }

.card-content h3 {
  font-size: var(--m-font-size-md);
  margin: 0 0 var(--m-space-1) 0;
  color: var(--m-color-text);
}

.card-content p {
  font-size: var(--m-font-size-sm);
  margin: 0;
  color: var(--m-color-text-secondary);
}

.m-ss-thread {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.m-ss-msg {
  display: flex;
  width: 100%;
}

.m-ss-msg.user {
  justify-content: flex-end;
}

.m-ss-msg.assistant {
  justify-content: flex-start;
}

.m-msg-bubble {
  padding: var(--m-space-3) var(--m-space-4);
  border-radius: var(--m-radius-lg);
  font-size: var(--m-font-size-md);
  line-height: var(--m-line-height-md);
}

.user-bubble {
  background: var(--blue-50);
  color: var(--m-color-text);
  border: 1px solid var(--blue-200);
  border-bottom-right-radius: var(--m-radius-sm);
}

.ai-bubble {
  background: var(--m-color-surface);
  color: var(--m-color-text);
  border: 1px solid var(--m-color-border);
  border-top-left-radius: var(--m-radius-sm);
}

.recognition-bubble {
  background: var(--m-color-brand-soft);
  border-color: var(--blue-200);
  margin-bottom: -12px;
}

.recognition-points {
  font-size: 12px;
}

.point-item {
  margin-bottom: 2px;
}

.point-label {
  color: var(--m-color-text-secondary);
}

.point-value {
  font-weight: bold;
  color: var(--m-color-text);
}

.loading-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
}

.m-answer-content {
  display: flex;
  flex-direction: column;
  gap: var(--m-space-2);
  flex: 1;
  width: 100%;
}

/* 答案区域样式 */
.m-answer-section {
  margin-bottom: 0;
}

.m-answer-section-title {
  font-size: var(--m-font-size-lg);
  font-weight: 600;
  color: var(--m-color-text);
  margin-bottom: var(--m-space-3);
}

.m-answer-section-content {
  font-size: var(--m-font-size-md);
  line-height: var(--m-line-height-lg);
  color: var(--gray-700);
}

.m-query-points {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--m-color-text-secondary);
}

/* 故障案例样式 */
.m-case-line {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.7;
}

.m-case-link {
  color: var(--m-color-brand-strong);
  text-decoration: none;
  cursor: pointer;
}

.m-case-link:active {
  opacity: 0.7;
}

.m-case-key {
  font-weight: 600;
  color: var(--m-color-brand-strong);
}

.m-case-summary {
  color: var(--m-color-text-secondary);
}

.m-case-ref {
  color: var(--m-color-brand-strong);
  font-weight: bold;
  margin-left: 4px;
}

/* 故障码解析样式 */
.m-fault-item {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--m-color-surface-soft);
  border-radius: 8px;
  border: 1px solid var(--m-color-border);
}

.m-fault-code-line {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.7;
}

.m-fault-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 14px;
  font-weight: 600;
  color: var(--m-color-text);
}

.m-fault-message {
  font-size: 14px;
  color: var(--m-color-text-secondary);
}

.m-fault-ref {
  color: var(--m-color-brand-strong);
  font-weight: bold;
  margin-left: 4px;
}

.m-fault-field {
  font-size: 13px;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.m-fault-field-label {
  color: var(--m-color-text-tertiary);
  font-weight: 500;
  flex-shrink: 0;
}

.m-fault-field-value {
  color: var(--m-color-text-secondary);
  line-height: 1.6;
}

.m-fault-tech-solution {
  margin-top: 4px;
}

.m-fault-tech-solution-text {
  color: var(--m-color-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.m-fault-tech-load {
  margin-top: 8px;
}

.m-fault-attachments {
  margin-top: 12px;
}

.m-fault-attachments-title {
  font-size: 13px;
  color: var(--m-color-text-tertiary);
  font-weight: 500;
  margin-bottom: 8px;
}

.m-fault-attachments-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.m-fault-attachment-image {
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
}

.m-fault-attachment-image:active {
  transform: scale(0.98);
}

.m-attachment-image {
  width: 100%;
  max-width: 300px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--m-color-border);
  display: block;
  pointer-events: none;
}

.m-attachment-image-name {
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.m-fault-attachment-file {
  display: inline-block;
  color: var(--m-color-brand-strong);
  text-decoration: none;
  font-size: 14px;
  padding: 4px 8px;
  border: 1px solid var(--m-color-border);
  border-radius: 4px;
  background: var(--m-color-surface);
}

.m-fault-attachment-file:active {
  opacity: 0.7;
}

/* Jira错误提示 */
.m-jira-error {
  padding: var(--m-space-3);
  background: var(--orange-50);
  border: 1px solid var(--orange-200);
  border-radius: var(--m-radius-md);
}

.m-error-title {
  font-size: var(--m-font-size-md);
  font-weight: 600;
  color: var(--orange-600);
  margin-bottom: var(--m-space-1);
}

.m-error-desc {
  font-size: var(--m-font-size-sm);
  color: var(--orange-800);
  line-height: var(--m-line-height-md);
}

/* 相似案例 */
.m-case-line {
  margin-bottom: 8px;
}

/* Knowledge */
.m-kb-item {
  background: var(--m-color-surface);
  border: 1px solid var(--m-color-border);
  border-radius: var(--m-radius-md);
  padding: 10px;
  margin-bottom: 8px;
}

.m-kb-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.m-kb-ref {
  color: var(--m-color-brand);
  font-size: 12px;
  font-weight: 600;
}

.m-kb-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--m-color-text);
}

.m-kb-heading {
  font-size: 12px;
  color: var(--m-color-text-secondary);
  margin-bottom: 4px;
}

.m-kb-snippet {
  font-size: 12px;
  color: var(--m-color-text-secondary);
  line-height: 1.5;
}

.m-kb-snippet :deep(em) {
  color: var(--m-color-brand);
  font-style: normal;
  font-weight: 600;
}

.m-kb-link {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--m-color-brand);
}

/* 来源按钮 */
.m-sources-actions {
  margin-top: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.m-copy-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 0;
  cursor: pointer;
  color: var(--m-color-text-secondary);
  transition: all 0.2s;
  touch-action: manipulation;
  padding: 0;
}

.m-copy-button:active {
  opacity: 0.7;
}

.m-copy-icon {
  width: 17px;
  height: 17px;
  color: var(--m-color-text-secondary);
}

.m-sources-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--m-color-surface);
  border: 1px solid var(--m-color-border);
  border-radius: 14px;
  cursor: pointer;
  font-size: 12px;
  color: var(--m-color-text);
  transition: all 0.2s;
  touch-action: manipulation;
}

.m-sources-button:active {
  opacity: 0.8;
}

.m-sources-button-icons {
  display: flex;
  align-items: center;
  gap: -4px;
}

.m-source-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.m-source-icon-error-code {
  background: var(--red-500);
}

.m-source-icon-fault-case {
  background: var(--orange-500);
}

.m-source-icon-knowledge {
  background: var(--m-color-brand);
}

.m-source-icon-text {
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
}

.m-sources-button-text {
  font-size: var(--m-font-size-sm);
  color: var(--m-color-text);
}

/* 无数据提示 */
.m-no-data-tip {
  text-align: center;
  color: var(--gray-400);
  font-size: var(--m-font-size-md);
  margin-bottom: var(--m-space-4);
}

/* 答案操作区域 */
.m-answer-actions {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--m-space-3);
  width: 100%;
}

.m-recommendation-wrap {
  margin-top: 4px;
}

.m-quick-cards-inline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.m-quick-card.single {
  width: 100%;
}

.m-source-btn-wrap {
  margin-top: 4px;
}

.m-source-btn {
  background: var(--m-color-surface);
  border: 1px solid var(--m-color-border);
  color: var(--m-color-text);
}

.m-ss-input-wrap {
  position: fixed;
  bottom: calc(50px + env(safe-area-inset-bottom)); /* Above tabbar */
  left: 0;
  right: 0;
  background: var(--m-color-surface);
  padding: var(--m-space-2) var(--m-space-3);
  border-top: 1px solid var(--m-color-border);
  z-index: 100;
}

.input-container {
  background: var(--m-color-surface);
  border: 1px solid var(--m-color-border);
  border-radius: 20px;
  display: flex;
  align-items: center;
  padding: var(--m-space-1) var(--m-space-1) var(--m-space-1) var(--m-space-3);
  min-height: 40px;
}
.m-ss-input {
  background: transparent;
  padding: 4px 0;
  flex: 1;
}

:deep(.m-ss-input .van-field__control) {
  background: transparent;
  color: var(--m-color-text);
  font-size: var(--m-font-size-md);
  line-height: var(--m-line-height-md);
  min-height: 24px;
  max-height: 84px;
}

.m-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  padding: 0;
  background: var(--gray-300);
  border: none;
  color: var(--gray-400);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.12s ease;
  touch-action: manipulation;
}

.m-send-btn:not(:disabled) {
  background: var(--gray-900);
  color: var(--black-white-white);
}

.m-send-btn:not(:disabled):active {
  transform: scale(0.95);
  opacity: 0.9;
}

.m-send-btn :deep(.van-icon) {
  font-size: 18px;
}

.m-source-drawer .drawer-content {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-title {
  font-size: 18px;
  font-weight: bold;
  margin: 0;
  text-align: center;
  padding: 16px 20px 12px;
  background: var(--m-color-surface);
  border-bottom: 1px solid var(--m-color-border);
  flex-shrink: 0;
}

.source-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 20px 20px;
  -webkit-overflow-scrolling: touch;
}

.source-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title::before {
  content: '';
  width: 4px;
  height: 16px;
  background: var(--m-color-brand-strong);
  border-radius: 2px;
}

.source-card {
  background: var(--m-color-surface-soft);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid var(--m-color-border);
}

.source-ref {
  color: var(--m-color-brand-strong);
  font-weight: bold;
  margin-right: 8px;
}

.code-line {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.code-badge {
  background: var(--m-color-surface);
  border: 1px solid var(--m-color-border-strong);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-weight: bold;
  font-size: 14px;
}

.code-msg {
  font-weight: bold;
  font-size: 14px;
}

.source-field {
  font-size: 13px;
  margin-top: 4px;
  display: flex;
}

.field-label {
  color: var(--m-color-text-secondary);
  flex-shrink: 0;
}

.field-value {
  color: var(--m-color-text);
}

.case-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.case-key {
  font-weight: bold;
  color: var(--m-color-brand-strong);
}

.case-summary {
  font-size: 13px;
  color: var(--m-color-text);
}

.debug-card {
  font-family: monospace;
}

.debug-label {
  color: var(--m-color-text-tertiary);
  font-size: 11px;
  margin-bottom: 2px;
}

.debug-value {
  color: var(--m-color-text);
  margin-bottom: 8px;
  font-size: 12px;
}

/* 来源抽屉新样式 */
.source-header {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 0;
  flex-wrap: wrap;
}

.source-text {
  font-weight: 600;
  color: var(--m-color-text);
  font-size: 14px;
}

.source-desc {
  color: var(--m-color-text-secondary);
  font-size: 14px;
}

.source-expand-icon {
  margin-left: auto;
  color: var(--m-color-text-secondary);
  font-size: 14px;
  transition: transform 0.2s;
}

.source-expanded {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--m-color-border);
}

.source-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.source-detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.source-detail-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--m-color-text-secondary);
}

.source-detail-value {
  font-size: 14px;
  color: var(--m-color-text);
  line-height: 1.6;
  white-space: pre-wrap;
}

.source-tech-text {
  white-space: pre-wrap;
}

.source-detail-params {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.source-detail-param {
  font-size: 13px;
  display: flex;
  gap: 8px;
}

.param-label {
  color: var(--m-color-text-secondary);
  flex-shrink: 0;
}

.param-value {
  color: var(--m-color-text);
}

.source-fault-attachments {
  margin-top: 12px;
}

.source-fault-attachments-title {
  font-size: 13px;
  color: var(--m-color-text-secondary);
  font-weight: 500;
  margin-bottom: 8px;
}

.source-fault-attachments-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-fault-attachment-image {
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
}

.source-fault-attachment-image:active {
  transform: scale(0.98);
}

.source-attachment-image {
  width: 100%;
  max-width: 300px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--m-color-border);
  display: block;
  pointer-events: none;
}

.source-attachment-image-name {
  font-size: 12px;
  color: var(--m-color-text-secondary);
}

.source-fault-attachment-file {
  display: inline-block;
  color: var(--m-color-brand);
  text-decoration: none;
  font-size: 14px;
  padding: 4px 8px;
  border: 1px solid var(--m-color-border);
  border-radius: 4px;
  background: var(--m-color-surface);
}

.source-fault-attachment-file:active {
  opacity: 0.7;
}

/* 故障案例样式 */
.source-case-loading {
  padding: 12px;
  text-align: center;
  color: var(--m-color-text-secondary);
  font-size: 14px;
}

.source-case-preview-header {
  margin-bottom: 16px;
}

.source-case-preview-key-project {
  font-size: 14px;
  font-weight: 600;
  color: var(--m-color-text);
  margin-bottom: 4px;
}

.source-case-preview-title {
  font-size: 14px;
  color: var(--m-color-text);
  line-height: 1.6;
}

.source-case-key-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.source-case-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.source-case-info-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--m-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.source-case-info-value {
  font-size: 13px;
  color: var(--m-color-text);
}

.source-case-info-empty {
  font-size: 13px;
  color: var(--m-color-text-tertiary);
}

.source-case-status-tag {
  align-self: flex-start;
}

.source-case-components {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.source-case-component-tag {
  margin: 0;
}

.source-case-content-section {
  margin-bottom: 16px;
}

.source-case-content-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--m-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.source-case-content-box {
  font-size: 14px;
  color: var(--m-color-text);
  line-height: 1.6;
  white-space: pre-wrap;
  padding: 12px;
  background: var(--m-color-bg);
  border-radius: 8px;
  border: 1px solid var(--m-color-border);
}

.source-case-attachments-section {
  margin-top: 16px;
}

.source-case-image-attachments {
  margin-bottom: 16px;
}

.source-case-attachment-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--m-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.source-case-attachment-images {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.source-case-image-thumbnail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
}

.source-case-image-thumbnail:active {
  transform: scale(0.98);
}

.source-case-attachment-image {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--m-color-border);
  display: block;
  pointer-events: none;
}

.source-case-image-name {
  font-size: 12px;
  color: var(--m-color-text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-case-file-attachments {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.source-case-attachment-item {
  font-size: 14px;
}

.source-case-attachment-link {
  color: var(--m-color-brand);
  text-decoration: none;
}

.source-case-attachment-link:active {
  opacity: 0.7;
}
</style>
