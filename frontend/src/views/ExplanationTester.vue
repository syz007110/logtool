<template>
  <div class="explanation-tester-container">
    <el-card class="main-card">
      <el-tabs v-model="activeTab" class="tabs-container">
        <el-tab-pane label="释义测试" name="explanation">
          <div class="tab-content">
            <el-form label-position="top" class="explanation-form">
              <!-- 故障码输入 -->
              <div class="form-section">
                <el-form-item label="故障码 (code)" required>
                  <el-input 
                    v-model="form.code" 
                    placeholder="可填日志中的完整故障码如 1010A，或 0X010A" 
                    size="large"
                    class="code-input"
                  />
                </el-form-item>
              </div>

              <!-- 可选配置 -->
              <div class="form-section">
                <div class="section-title">可选配置</div>
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="子系统">
                      <el-input v-model="form.subsystem" placeholder="如 1-9 或 A" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="自定义模板 (优先使用)">
                      <el-input v-model="form.template" placeholder="如: 轴{0:d} 错误码 {1:x}" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </div>

              <!-- 参数输入 -->
              <div class="form-section">
                <div class="section-title">模板参数</div>
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="参数1">
                      <el-input v-model="form.param1" placeholder="参数1的值" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="参数2">
                      <el-input v-model="form.param2" placeholder="参数2的值" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="参数3">
                      <el-input v-model="form.param3" placeholder="参数3的值" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="参数4">
                      <el-input v-model="form.param4" placeholder="参数4的值" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </div>

              <!-- 操作按钮 -->
              <div class="form-actions">
                <el-space>
                  <el-button type="primary" :loading="loading" @click="handleParse">解析</el-button>
                  <el-button @click="handleReset">重置</el-button>
                </el-space>
              </div>
            </el-form>
            
            <!-- 解析结果 -->
            <div class="result-section" v-if="result">
              <div class="result-title">解析结果</div>
              <div class="result-content">
                <div class="result-item">
                  <span class="result-label">子系统：</span>
                  <span class="result-value">{{ result.subsystem || '-' }}</span>
                </div>
                <div class="result-item">
                  <span class="result-label">臂号：</span>
                  <span class="result-value">{{ result.arm || '-' }}</span>
                </div>
                <div class="result-item">
                  <span class="result-label">关节号：</span>
                  <span class="result-value">{{ result.joint || '-' }}</span>
                </div>
                <div class="result-item">
                  <span class="result-label">模板：</span>
                  <span class="result-value">{{ result.template || '-' }}</span>
                </div>
                <div class="result-item">
                  <span class="result-label">参数：</span>
                  <span class="result-value">{{ JSON.stringify(result.params) || '-' }}</span>
                </div>
                <div class="result-item result-item-main">
                  <span class="result-label">释义：</span>
                  <span class="result-value explanation-text">{{ result.explanation || '-' }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="可视化测试" name="viz">
          <div class="tab-content">
            <el-card class="viz-card">
              <template #header>
                <div class="card-header">输入手术结构化数据 (JSON)</div>
              </template>
              <el-input
                v-model="vizJsonText"
                type="textarea"
                :autosize="{ minRows: 14 }"
                placeholder="粘贴手术结构化数据，或点击填充示例"
              />
              <el-space style="margin-top: 12px">
                <el-button type="primary" @click="handleRenderViz">跳转可视化页面</el-button>
                <el-button @click="fillVizExample">填充示例</el-button>
              </el-space>
            </el-card>
            <el-card class="info-card" style="margin-top: 16px">
              <template #header>
                <div class="card-header">说明</div>
              </template>
              <div class="info-text">
                <p>• 输入手术结构化数据JSON格式</p>
                <p>• 点击"跳转可视化页面"将在新标签页打开手术可视化</p>
                <p>• 点击"填充示例"可加载测试数据</p>
                <p>• 可视化页面将显示甘特图、状态机变化、网络延时等图表</p>
              </div>
            </el-card>
          </div>
        </el-tab-pane>

        <el-tab-pane label="Agent Chat" name="agent">
          <div class="tab-content tab-content--agent">
            <el-card class="agent-chat-shell">
              <template #header>
                <div class="card-header card-header--agent">
                  <span>Agent Chat</span>
                  <el-button size="small" @click="createNewAgentConversation">新建会话</el-button>
                </div>
              </template>

              <div v-if="!agentMessages.length" class="agent-empty">暂无消息，输入内容后发送。</div>
              <div v-else ref="agentChatListRef" class="agent-chat-list">
                <div
                  v-for="(m, idx) in agentMessages"
                  :key="`${m.role}-${idx}-${m.createdAt}`"
                  :class="['agent-chat-item', `agent-chat-item--${m.role}`]"
                >
                  <div class="agent-chat-meta">
                    <span>{{ formatAgentRoleLabel(m.role) }}</span>
                    <span>{{ formatChatTime(m.createdAt) }}</span>
                  </div>
                  <pre class="agent-chat-text">{{ m.text || '（空文本）' }}</pre>
                  <div v-if="m.attachments && m.attachments.length" class="agent-chat-attachments">
                    <div v-for="(a, aIdx) in m.attachments" :key="`${a.type}-${aIdx}`" class="agent-chat-attachment-item">
                      <img
                        v-if="a.type === 'image' && a.url"
                        :src="a.url"
                        class="agent-chat-attachment-image"
                        alt="attachment"
                      >
                      <span>{{ formatAttachmentLabel(a) }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="agent-composer">
                <div v-if="agentInput.attachments.length" class="agent-composer-attachments">
                  <div
                    v-for="(a, idx) in agentInput.attachments"
                    :key="`${a.localId}-${idx}`"
                    class="agent-attachment-chip"
                  >
                    <img
                      v-if="a.type === 'image' && (a.url || a.previewUrl)"
                      :src="a.url || a.previewUrl"
                      class="agent-attachment-chip-image"
                      alt="upload-preview"
                    >
                    <span>{{ formatAttachmentLabel(a) }}<span v-if="a.status === 'uploading'">（上传中）</span><span v-else-if="a.status === 'failed'">（上传失败）</span></span>
                    <el-button link type="danger" @click="removeAgentAttachment(idx)">移除</el-button>
                  </div>
                </div>

                <div class="agent-composer-editor-shell">
                  <div class="agent-composer-toolbar">
                    <el-space>
                      <input
                        ref="agentFileInputRef"
                        class="agent-file-input"
                        type="file"
                        multiple
                        @change="handleAgentFileChange"
                      >
                      <el-button :loading="agentUploading" @click="triggerAgentFileSelect">添加图片/文件</el-button>
                      <el-button @click="resetAgentInput">清空输入</el-button>
                      <el-button type="primary" :loading="agentSending || agentUploading" @click="sendAgentMessage">发送</el-button>
                    </el-space>
                  </div>

                  <div class="agent-editor-wrap">
                    <div
                      ref="agentComposerRef"
                      class="agent-rich-editor"
                      contenteditable="true"
                      @input="handleAgentEditorInput"
                      @keydown="handleAgentEditorKeydown"
                      @paste="handleAgentEditorPaste"
                      @drop.prevent="handleAgentEditorDrop"
                      @dragover.prevent
                    ></div>
                    <div v-if="agentEditorEmpty" class="agent-editor-placeholder">
                      输入消息（Enter 发送，Shift+Enter 换行；粘贴图片会自动生成图片卡片）
                    </div>
                  </div>
                </div>

              </div>
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script>
import { reactive, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import api from '../api'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { GANTT_STYLE, GANTT_COLORS, normalizeSurgeryData, toMs } from '../utils/visualizationConfig'
import { visualizeSurgery as visualizeSurgeryData } from '../utils/visualizationHelper'

export default {
  name: 'ExplanationTester',
  setup() {
    const activeTab = ref('explanation')
    const form = reactive({
      code: '',
      subsystem: '',
      template: '',
      param1: '',
      param2: '',
      param3: '',
      param4: ''
    })
    const loading = ref(false)
    const result = ref(null)
    const vizJsonText = ref('')
    const vizChartRef = ref(null)
    const agentSending = ref(false)
    const agentUploading = ref(false)
    const agentMessages = ref([])
    const agentChatListRef = ref(null)
    const agentComposerRef = ref(null)
    const agentEditorEmpty = ref(true)
    const agentFileInputRef = ref(null)
    const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    const encodeBase32 = (value, length) => {
      let num = BigInt(value)
      let out = ''
      while (out.length < length) {
        const idx = Number(num % 32n)
        out = ULID_ALPHABET[idx] + out
        num = num / 32n
      }
      return out
    }
    const generateUlid = (timestampMs = Date.now()) => {
      const ts = BigInt(Number(timestampMs) || Date.now())
      const timePart = encodeBase32(ts, 10)
      const randomBytes = new Uint8Array(10)
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        window.crypto.getRandomValues(randomBytes)
      } else {
        for (let i = 0; i < randomBytes.length; i += 1) {
          randomBytes[i] = Math.floor(Math.random() * 256)
        }
      }
      let rand = 0n
      for (const b of randomBytes) {
        rand = (rand << 8n) | BigInt(b)
      }
      const randomPart = encodeBase32(rand, 16)
      return `${timePart}${randomPart}`
    }
    const agentConversationId = ref('')
    const agentInput = reactive({
      attachments: []
    })
    let vizChart = null

    const handleParse = async () => {
      if (!form.code) {
        ElMessage.warning('请填写故障码 code')
        return
      }
      loading.value = true
      try {
        const payload = {
          code: form.code,
          param1: form.param1,
          param2: form.param2,
          param3: form.param3,
          param4: form.param4
        }
        if (form.subsystem) payload.subsystem = form.subsystem
        if (form.template) payload.template = form.template
        const resp = await api.explanations.preview(payload)
        result.value = resp.data
      } catch (e) {
        result.value = null
      } finally {
        loading.value = false
      }
    }

    const handleReset = () => {
      form.code = ''
      form.subsystem = ''
      form.template = ''
      form.param1 = ''
      form.param2 = ''
      form.param3 = ''
      form.param4 = ''
      result.value = null
    }

    const disposeChart = () => {
      if (vizChart) {
        vizChart.dispose()
        vizChart = null
      }
    }

    const renderViz = (data) => {
      if (!vizChartRef.value) return
      if (!vizChart) {
        vizChart = echarts.init(vizChartRef.value)
      }
      const t0 = toMs(data?.timeline?.powerOn)
      const tPrev = toMs(data?.timeline?.previousSurgeryEnd)
      const t1 = toMs(data?.timeline?.surgeryStart)
      const t2 = toMs(data?.timeline?.surgeryEnd)
      const t3 = toMs(data?.timeline?.powerOff)

      const arms = Array.isArray(data?.arms) ? data.arms : []
      const categories = arms.map(a => a.name || '未命名')
      const seriesData = []
      // 为不同工具臂分配基础颜色，同一臂内不同器械使用不同色调
      const armBaseColors = GANTT_COLORS.ARM_BASE_COLORS
      const toolColorByArm = {}
      
      arms.forEach((arm, idx) => {
        const segs = Array.isArray(arm.segments) ? arm.segments : []
        const baseColor = armBaseColors[idx % armBaseColors.length]
        
        segs.forEach(seg => {
          const s = toMs(seg.start)
          const e = toMs(seg.end)
          if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
            const key = seg.tool_type || seg.udi || 'unknown'
            if (!toolColorByArm[idx]) toolColorByArm[idx] = {}
            if (!toolColorByArm[idx][key]) {
              // 优先器械类型固定色
              const typeColor = GANTT_COLORS.TOOL_TYPE_COLORS[seg.tool_type || '']
              if (typeColor) {
                toolColorByArm[idx][key] = typeColor
              } else {
                // 否则基于臂基础色生成色调
                const assignedCount = Object.keys(toolColorByArm[idx]).length
                const hueShift = assignedCount * 30
                const saturation = Math.max(0.6, 1 - assignedCount * 0.1)
                const lightness = Math.max(0.4, 0.8 - assignedCount * 0.1)
                toolColorByArm[idx][key] = `hsl(${(idx * 60 + hueShift) % 360}, ${saturation * 100}%, ${lightness * 100}%)`
              }
            }
            const color = toolColorByArm[idx][key]
            seriesData.push({
              name: seg.udi || '',
              value: [idx, s, e, (e - s), seg.udi || '', seg.tool_type || '', seg.start, seg.end],
              itemStyle: { color, opacity: 0.9 },
              tool_type: seg.tool_type || ''
            })
          }
        })
      })

      // 关键时间点标签（横向 x 轴顶部，非时间线）
      const timelineEvents = []
      if (Number.isFinite(t0)) timelineEvents.push({ time: t0, name: '开机', color: '#52c41a' })
      if (Number.isFinite(tPrev)) timelineEvents.push({ time: tPrev, name: '上一场手术结束', color: '#8c8c8c' })
      if (Number.isFinite(t1)) timelineEvents.push({ time: t1, name: '手术开始', color: '#1890ff' })
      if (Number.isFinite(t2)) timelineEvents.push({ time: t2, name: '手术结束', color: '#fa8c16' })
      if (Number.isFinite(t3)) timelineEvents.push({ time: t3, name: '关机', color: '#f5222d' })
      timelineEvents.sort((a, b) => a.time - b.time)

      // 计算统一时间范围，防止事件点堆叠与条形裁切
      const allTimes = []
      seriesData.forEach(d => { if (Array.isArray(d.value)) { allTimes.push(d.value[1], d.value[2]) } })
      timelineEvents.forEach(e => { if (Number.isFinite(e.time)) allTimes.push(e.time) })
      const minX = allTimes.length ? Math.min.apply(null, allTimes) : undefined
      const maxX = allTimes.length ? Math.max.apply(null, allTimes) : undefined

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: (p) => {
            if (Array.isArray(p)) p = p[0]
            if (!p || !p.data) return ''
            // 甘特条目：data.value 为数组
            if (Array.isArray(p.data.value)) {
              const v = p.data.value
              const catIdx = v[0]
              const s = v[1]
              const e = v[2]
              const udiVal = v[4]
              const toolVal = v[5]
              const startTime = v[6]
              const endTime = v[7]
              const dur = Math.round((e - s) / 1000)
              const armName = categories[catIdx]
              const udi = udiVal || p.data.name || ''
              const tool = (toolVal || p.data.tool_type) ? toolVal || p.data.tool_type : ''
              const installTime = startTime ? new Date(startTime).toLocaleString() : ''
              const removeTime = endTime ? new Date(endTime).toLocaleString() : ''
              return `
                <div style="padding: 8px;">
                  <div style="font-weight: bold; margin-bottom: 4px;">${armName}</div>
                  <div>器械类型: ${tool}</div>
                  <div>UDI码: ${udi}</div>
                  <div>使用时长: ${dur}秒</div>
                  <div>安装时刻: ${installTime}</div>
                  <div>拔下时刻: ${removeTime}</div>
                </div>
              `
            }
            // 时间线事件：data 为事件对象 { time, name, color }
            if (p.data && p.data.time && p.data.name) {
              return `${p.data.name}<br/>时间: ${new Date(p.data.time).toLocaleString()}`
            }
            return ''
          }
        },
        grid: { left: 120, right: 40, top: 100, bottom: 110 },
        axisPointer: { link: [{ xAxisIndex: 'all' }], snap: true },
        xAxis: {
          type: 'time',
          position: 'top',
          axisLine: { show: true },
          axisTick: { show: true },
          axisLabel: { color: '#000', formatter: (val) => new Date(val).toLocaleTimeString() },
          min: Number.isFinite(minX) ? minX : undefined,
          max: Number.isFinite(maxX) ? maxX : undefined
        },
        yAxis: {
          type: 'category',
          data: categories,
          axisLine: { show: true },
          axisTick: { show: true },
          axisLabel: { show: true, color: '#000' }
        },
        dataZoom: [
          { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 20, bottom: 18 },
          { type: 'inside', xAxisIndex: 0, filterMode: 'none' }
        ],
        series: [
          // 手术区间背景色（手术开始~结束）
          (Number.isFinite(t1) && Number.isFinite(t2) && t2 > t1) ? {
            type: 'custom',
            silent: true,
            z: 0,
            renderItem: (params, api) => {
              const yTop = params.coordSys.y
              const totalHeight = params.coordSys.height
              const x1 = api.coord([t1, 0])[0]
              const x2 = api.coord([t2, 0])[0]
              const rect = echarts.graphic.clipRectByRect(
                { x: Math.min(x1, x2), y: yTop, width: Math.abs(x2 - x1), height: totalHeight },
                { x: params.coordSys.x, y: yTop, width: params.coordSys.width, height: totalHeight }
              )
              if (!rect || rect.width <= 0 || rect.height <= 0) return
              return {
                type: 'rect',
                shape: rect,
                style: { fill: '#E6E6FA' }
              }
            },
            data: [0]
          } : {},
          // 顶部标签（仅显示标签，不画时间线）
          {
            type: 'custom',
            z: 15,
            renderItem: (params, api) => {
              const idx = params.dataIndex
              const event = timelineEvents[idx]
              const x = api.coord([event.time, 0])[0]
              // 放在图表下方（dataZoom 上方）
              const axisBottom = params.coordSys.y + params.coordSys.height + 24
              const label = {
                type: 'text',
                style: {
                  text: event.name,
                  x,
                  y: axisBottom,
                  textAlign: 'center',
                  textVerticalAlign: 'bottom',
                  fontSize: 12,
                  fill: '#000'
                }
              }
              return label
            },
            data: timelineEvents
          },
          {
            type: 'custom',
            animation: false,
            renderItem: (params, api) => {
              const categoryIndex = api.value(0)
              const start = api.coord([api.value(1), categoryIndex])
              const end = api.coord([api.value(2), categoryIndex])
              // 使用可配置样式参数计算条厚度与行间距
              const bandSize = api.size([0, 1])[1]
              const usable = Math.max(1, bandSize - GANTT_STYLE.ROW_GAP_PX)
              const barHeight = Math.min(GANTT_STYLE.BAR_MAX_PX, usable * GANTT_STYLE.BAR_RATIO)
              const x = start[0]
              const width = end[0] - start[0]
              const y = start[1] - barHeight / 2

              const rect = echarts.graphic.clipRectByRect(
                { x, y, width, height: barHeight },
                { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
              )
              if (!rect || rect.width <= 0 || rect.height <= 0) return

              // 条内文字：显示器械名称（tool_type），不显示 UDI
              const label = String(api.value(5) || '')

              return {
                type: 'group',
                children: [
                  {
                    type: 'rect',
                    shape: rect,
                    // 使用 data.itemStyle.color，由 api.style 读取
                    style: api.style({ opacity: 0.9 })
                  },
                  {
                    type: 'text',
                    silent: true,
                    style: {
                      text: label,
                      x: rect.x + 6,
                      y: rect.y + rect.height / 2,
                      fill: '#fff',
                      textAlign: 'left',
                      textVerticalAlign: 'middle',
                      fontSize: 12,
                      fontWeight: 500,
                      overflow: 'truncate',
                      width: Math.max(0, rect.width - 12)
                    }
                  }
                ]
              }
            },
            encode: { x: [1, 2], y: 0 },
            data: seriesData,
            emphasis: { itemStyle: { opacity: 1 } }
          }
        ]
      }

      vizChart.setOption(option, true)
      vizChart.resize()
    }

    const handleRenderViz = () => {
      if (!vizJsonText.value) {
        ElMessage.warning('请粘贴手术结构化数据 JSON')
        return
      }
      try {
        const raw = JSON.parse(vizJsonText.value)
        // 使用统一的可视化函数，跳转到可视化页面
        visualizeSurgeryData(raw)
      } catch (e) {
        ElMessage.error('JSON 解析失败，请检查格式')
      }
    }

    const fillVizExample = () => {
      const now = Date.now()
      const example = {
        surgery_id: 'TEST-001',
        start_time: new Date(now + 5 * 60 * 1000).toISOString(),
        end_time: new Date(now + 50 * 60 * 1000).toISOString(),
        is_remote: false,
        structured_data: {
          power_cycles: [
            { on_time: new Date(now).toISOString(), off_time: new Date(now + 55 * 60 * 1000).toISOString() }
          ],
          arms: [
            { 
              name: '1号臂', 
              arm_id: 1,
              instrument_usage: [
                { 
                  start_time: new Date(now + 6 * 60 * 1000).toISOString(), 
                  end_time: new Date(now + 10 * 60 * 1000).toISOString(), 
                  udi: 'UDI-AAA-001', 
                  tool_type: '持针钳' 
                },
                { 
                  start_time: new Date(now + 15 * 60 * 1000).toISOString(), 
                  end_time: new Date(now + 22 * 60 * 1000).toISOString(), 
                  udi: 'UDI-AAB-002', 
                  tool_type: '电钩' 
                }
              ]
            },
            { 
              name: '2号臂', 
              arm_id: 2,
              instrument_usage: [
                { 
                  start_time: new Date(now + 8 * 60 * 1000).toISOString(), 
                  end_time: new Date(now + 12 * 60 * 1000).toISOString(), 
                  udi: 'UDI-BAA-003', 
                  tool_type: '直剪' 
                },
                { 
                  start_time: new Date(now + 30 * 60 * 1000).toISOString(), 
                  end_time: new Date(now + 40 * 60 * 1000).toISOString(), 
                  udi: 'UDI-BAB-004', 
                  tool_type: '双极鸭嘴电凝钳' 
                }
              ]
            },
            { 
              name: '3号臂', 
              arm_id: 3,
              instrument_usage: [
                { 
                  start_time: new Date(now + 20 * 60 * 1000).toISOString(), 
                  end_time: new Date(now + 35 * 60 * 1000).toISOString(), 
                  udi: 'UDI-CCC-005', 
                  tool_type: '0度内窥镜' 
                }
              ]
            }
          ],
          state_machine_changes: [
            { time: new Date(now + 5 * 60 * 1000).toISOString(), stateName: '手术开始' },
            { time: new Date(now + 25 * 60 * 1000).toISOString(), stateName: '器械切换' },
            { time: new Date(now + 50 * 60 * 1000).toISOString(), stateName: '手术结束' }
          ],
          previous_end_time: new Date(now - 30 * 60 * 1000).toISOString()
        }
      }
      vizJsonText.value = JSON.stringify(example, null, 2)
    }

    const formatFileSize = (size) => {
      const val = Number(size || 0)
      if (!Number.isFinite(val) || val <= 0) return '0 B'
      if (val < 1024) return `${val} B`
      if (val < 1024 * 1024) return `${(val / 1024).toFixed(1)} KB`
      return `${(val / (1024 * 1024)).toFixed(1)} MB`
    }

    const formatChatTime = (timestamp) => {
      const t = Number(timestamp)
      if (!Number.isFinite(t)) return '-'
      return new Date(t).toLocaleTimeString()
    }

    const formatAttachmentLabel = (attachment) => {
      if (!attachment || typeof attachment !== 'object') return 'unknown'
      if (attachment.type === 'image') return `图片: ${attachment.name || attachment.original_name || '-'}`
      if (attachment.type === 'file') return `文件: ${attachment.name || attachment.original_name || '-'} (${formatFileSize(attachment.size || attachment.size_bytes)})`
      return `${attachment.type || 'attachment'}`
    }

    const formatAgentRoleLabel = (role) => {
      if (role === 'user') return '你'
      if (role === 'tool') return '工具'
      if (role === 'system') return '系统'
      return '助手'
    }

    const getConversationRolloverReasonText = (reason, policy = {}) => {
      if (reason === 'force_new_command') return '收到新建会话指令（/new）'
      if (reason === 'max_turns') return `达到轮次上限（${Number(policy.maxTurns || 20)} 轮）`
      if (reason === 'idle_timeout') return `空闲超时（${Number(policy.idleTimeoutMinutes || 30)} 分钟）`
      if (reason === 'max_tokens') return `超过 token 上限（${Number(policy.maxTokens || 6000)}）`
      if (reason === 'no_active_instance') return '首次进入会话'
      return '系统自动切换'
    }

    const getAgentEditorPlainText = () => {
      const raw = String(agentComposerRef.value?.innerText || '')
      return raw.replace(/\u00A0/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    }

    const syncAgentEditorEmpty = () => {
      const text = getAgentEditorPlainText()
      agentEditorEmpty.value = !text
    }

    const clearAgentEditor = () => {
      if (agentComposerRef.value) {
        agentComposerRef.value.innerHTML = ''
      }
      syncAgentEditorEmpty()
    }

    const scrollAgentChatToBottom = async () => {
      await nextTick()
      if (!agentChatListRef.value) return
      agentChatListRef.value.scrollTop = agentChatListRef.value.scrollHeight
    }

    const uploadAgentFiles = async (files) => {
      const list = Array.from(files || []).filter(Boolean)
      if (!list.length) return
      const placeholders = list.map((f) => ({
        localId: `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
        type: String(f.type || '').startsWith('image/') ? 'image' : 'file',
        name: f.name,
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
        status: 'uploading',
        url: '',
        previewUrl: String(f.type || '').startsWith('image/') ? URL.createObjectURL(f) : ''
      }))
      agentInput.attachments.push(...placeholders)
      agentUploading.value = true
      try {
        const formData = new FormData()
        list.forEach((file) => formData.append('files', file))
        const res = await api.agent.uploadAssets(formData)
        const uploaded = Array.isArray(res?.data?.files) ? res.data.files : []
        placeholders.forEach((holder, idx) => {
          const item = uploaded[idx]
          if (!item) {
            holder.status = 'failed'
            return
          }
          holder.status = 'ready'
          holder.id = item.id
          holder.url = item.url || ''
          holder.objectKey = item.object_key
          holder.storage = item.storage
          holder.name = item.original_name || item.filename || holder.name
          holder.size = item.size_bytes || holder.size
          holder.mimeType = item.mime_type || holder.mimeType
          holder.type = String(holder.mimeType || '').startsWith('image/') ? 'image' : 'file'
          holder.expiresAt = item.expires_at
        })
      } catch (error) {
        placeholders.forEach((holder) => {
          holder.status = 'failed'
        })
        ElMessage.error(`附件上传失败: ${String(error?.message || error)}`)
      } finally {
        agentUploading.value = false
      }
    }

    const handleAgentFileChange = async (event) => {
      const list = Array.from(event?.target?.files || [])
      await uploadAgentFiles(list)
      if (agentFileInputRef.value) agentFileInputRef.value.value = ''
    }

    const triggerAgentFileSelect = () => {
      agentFileInputRef.value?.click?.()
    }

    const handleAgentEditorPaste = async (event) => {
      const items = Array.from(event?.clipboardData?.items || [])
      const files = items
        .filter((it) => String(it.kind || '').toLowerCase() === 'file')
        .map((it) => it.getAsFile())
        .filter(Boolean)
      if (!files.length) return
      event.preventDefault()
      await uploadAgentFiles(files)
    }

    const handleAgentEditorDrop = async (event) => {
      const files = Array.from(event?.dataTransfer?.files || []).filter(Boolean)
      if (!files.length) return
      await uploadAgentFiles(files)
    }

    const handleAgentEditorInput = () => {
      syncAgentEditorEmpty()
    }

    const handleAgentEditorKeydown = (event) => {
      if (event.isComposing) return
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendAgentMessage()
      }
    }

    const removeAgentAttachment = (index) => {
      if (!Array.isArray(agentInput.attachments)) return
      const item = agentInput.attachments[index]
      if (item && item.previewUrl && item.previewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(item.previewUrl) } catch (_) {}
      }
      agentInput.attachments.splice(index, 1)
    }

    const resetAgentInput = () => {
      agentInput.attachments.forEach((item) => {
        if (item && item.previewUrl && item.previewUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(item.previewUrl) } catch (_) {}
        }
      })
      agentInput.attachments = []
      if (agentFileInputRef.value) agentFileInputRef.value.value = ''
      clearAgentEditor()
    }

    const createNewAgentConversation = () => {
      agentConversationId.value = ''
      agentMessages.value = []
      resetAgentInput()
      ElMessage.success('已新建会话')
    }

    const sendAgentMessage = async () => {
      const text = getAgentEditorPlainText()
      const attachments = Array.isArray(agentInput.attachments)
        ? agentInput.attachments.filter((item) => item && item.status === 'ready')
        : []
      const sentAt = Date.now()
      const messageId = generateUlid(sentAt)

      if (!text && attachments.length === 0) {
        ElMessage.warning('请至少输入文本或添加附件')
        return
      }

      agentSending.value = true
      try {
        const userMessage = {
          role: 'user',
          createdAt: Date.now(),
          text,
          attachments
        }
        agentMessages.value.push(userMessage)
        scrollAgentChatToBottom()

        const payloadAttachments = attachments.map((item) => ({
          type: item.type || 'file',
          fileId: item.id,
          url: item.url,
          name: item.name,
          size: item.size,
          mimeType: item.mimeType,
          objectKey: item.objectKey,
          storage: item.storage
        }))
        const channelPayload = {
          type: 'web',
          conversationType: 'single'
        }
        if (agentConversationId.value) {
          channelPayload.conversationId = agentConversationId.value
        }
        const payload = {
          message: {
            externalMessageId: messageId,
            type: attachments.length > 0 ? (attachments[0]?.type || 'file') : 'text',
            text,
            attachments: payloadAttachments,
            sentAt
          },
          channel: channelPayload
        }
        const res = await api.agent.execute(payload)
        const mode = String(res?.data?.mode || '').trim().toLowerCase()
        const finalResponse = res?.data?.response || null
        if (mode !== 'sync' || !finalResponse) {
          throw new Error('agent response missing')
        }
        const returnedConversationId = String(finalResponse?.session?.conversationId || '').trim()
        if (returnedConversationId) {
          agentConversationId.value = returnedConversationId
        }

        const instance = finalResponse?.instance
        if (instance?.created_new) {
          const instanceNo = Number(instance?.instance_no || 0)
          const reasonText = getConversationRolloverReasonText(instance?.rollover_reason, finalResponse?.policy || {})
          agentMessages.value.push({
            role: 'system',
            createdAt: Date.now(),
            text: `已新建会话实例 #${instanceNo}，原因：${reasonText}`,
            attachments: []
          })
        }

        agentMessages.value.push({
          role: 'assistant',
          createdAt: Date.now(),
          text: finalResponse?.text || '',
          attachments: finalResponse?.attachments || []
        })
        scrollAgentChatToBottom()
        resetAgentInput()
      } catch (error) {
        agentMessages.value.push({
          role: 'assistant',
          createdAt: Date.now(),
          text: `请求失败: ${String(error?.message || error)}`,
          attachments: []
        })
        scrollAgentChatToBottom()
      } finally {
        agentSending.value = false
      }
    }

    onMounted(() => {
      const onResize = () => { if (vizChart) vizChart.resize() }
      window.addEventListener('resize', onResize)
    })
    onBeforeUnmount(() => {
      agentInput.attachments.forEach((item) => {
        if (item && item.previewUrl && item.previewUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(item.previewUrl) } catch (_) {}
        }
      })
      // 注意：匿名处理器不移除，这里主要释放图表
      disposeChart()
    })

    return {
      activeTab,
      form, loading, result, handleParse, handleReset,
      vizJsonText, vizChartRef, handleRenderViz, fillVizExample,
      agentChatListRef, agentFileInputRef, agentComposerRef, agentEditorEmpty,
      agentInput, agentSending, agentUploading, agentMessages,
      handleAgentFileChange, triggerAgentFileSelect, handleAgentEditorPaste, handleAgentEditorDrop,
      handleAgentEditorInput, handleAgentEditorKeydown,
      removeAgentAttachment, resetAgentInput, sendAgentMessage, createNewAgentConversation,
      formatFileSize, formatChatTime, formatAttachmentLabel, formatAgentRoleLabel
    }
  }
}
</script>

<style scoped>
.explanation-tester-container {
  height: calc(100vh - 64px);
  background: var(--black-white-white);
  padding: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-card {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 4px 20px;
}

.tabs-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.tabs-container :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.tabs-container :deep(.el-tab-pane) {
  height: 100%;
  overflow-y: auto;
}

.tab-content {
  height: 100%;
  overflow-y: auto;
}

.explanation-form {
  max-width: 800px;
}

.form-section {
  margin-bottom: 24px;
}

.form-section:last-of-type {
  margin-bottom: 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-900);
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--gray-200);
}

.code-input {
  font-family: 'Courier New', monospace;
}

.form-actions {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--gray-200);
  display: flex;
  justify-content: flex-end;
}

.result-section {
  margin-top: 24px;
  padding: 16px;
  background: var(--gray-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--gray-200);
  max-width: 800px;
}

.result-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-900);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--gray-200);
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  display: flex;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.5;
}

.result-item-main {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--gray-200);
}

.result-label {
  color: var(--gray-600);
  font-weight: 500;
  min-width: 70px;
  flex-shrink: 0;
}

.result-value {
  color: var(--gray-900);
  flex: 1;
  word-break: break-word;
}

.explanation-text {
  color: var(--gray-900);
  font-weight: 500;
  line-height: 1.6;
}

.info-text {
  color: var(--gray-600);
  line-height: 1.6;
}

.card-header {
  font-weight: 600;
  color: var(--gray-900);
  font-size: 16px;
}

.card-header--agent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.viz-card,
.info-card {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
}

.agent-chat-shell {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.agent-chat-shell :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.agent-composer {
  margin-top: auto;
  border-top: 1px solid var(--gray-200);
  padding-top: 12px;
}

.agent-file-input {
  display: none;
}

.agent-composer-attachments {
  margin-bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-attachment-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-sm);
  background: var(--gray-50);
  font-size: 12px;
}

.agent-attachment-chip-image {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  border: 1px solid var(--gray-200);
}

.agent-composer-editor-shell {
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-md);
  background: var(--black-white-white);
}

.agent-composer-toolbar {
  padding: 8px 10px;
  border-bottom: 1px solid var(--gray-200);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.agent-editor-wrap {
  position: relative;
}

.agent-rich-editor {
  min-height: 140px;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  color: var(--gray-900);
  font-size: 14px;
  line-height: 1.6;
  outline: none;
}

.agent-rich-editor :deep(ul) {
  padding-left: 22px;
}

.agent-rich-editor :deep(blockquote) {
  margin: 6px 0;
  padding-left: 10px;
  border-left: 3px solid var(--gray-300);
  color: var(--gray-700);
}

.agent-editor-placeholder {
  position: absolute;
  top: 12px;
  left: 12px;
  color: var(--gray-500);
  pointer-events: none;
  font-size: 14px;
}

.agent-chat-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.tab-content--agent {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.agent-empty {
  color: var(--gray-500);
  font-size: 13px;
}

.agent-chat-item {
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--gray-200);
  background: var(--black-white-white);
}

.agent-chat-item--user {
  background: var(--gray-50);
  align-self: flex-end;
  max-width: 86%;
}

.agent-chat-item--assistant {
  background: var(--black-white-white);
  max-width: 92%;
}

.agent-chat-item--tool {
  background: #f6ffed;
  border-color: #b7eb8f;
  max-width: 92%;
}

.agent-chat-item--system {
  background: var(--gray-100);
  border-style: dashed;
  max-width: 92%;
}

.agent-chat-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--gray-500);
  margin-bottom: 8px;
}

.agent-chat-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--gray-900);
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
}

.agent-chat-attachments {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-chat-attachment-item {
  font-size: 12px;
  color: var(--gray-700);
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-chat-attachment-image {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--gray-200);
}

.info-text p {
  margin: 0 0 8px 0;
}

.info-text p:last-child {
  margin-bottom: 0;
}


/* 响应式设计 */
@media (max-width: 768px) {
  .explanation-tester-container {
    padding: 16px;
  }
  
  .main-card :deep(.el-card__body) {
    padding: 16px;
  }
}
</style>
