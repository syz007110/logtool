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
      </el-tabs>
    </el-card>
  </div>
</template>

<script>
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
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

    onMounted(() => {
      const onResize = () => { if (vizChart) vizChart.resize() }
      window.addEventListener('resize', onResize)
    })
    onBeforeUnmount(() => {
      // 注意：匿名处理器不移除，这里主要释放图表
      disposeChart()
    })

    return {
      activeTab,
      form, loading, result, handleParse, handleReset,
      vizJsonText, vizChartRef, handleRenderViz, fillVizExample
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

.viz-card,
.info-card {
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
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


