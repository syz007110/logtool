<template>
  <div>
    <a-page-header title="测试" sub-title="仅管理员可用" />
    <a-tabs style="margin-top: 16px">
      <a-tab-pane key="explanation" tab="释义测试">
        <a-card>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="故障码 (code)">
              <a-input v-model:value="form.code" placeholder="可填日志中的完整故障码如 1010A，或 0X010A" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="子系统 (可选)">
              <a-input v-model:value="form.subsystem" placeholder="如 1-9 或 A" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="自定义模板 (可选，优先使用)">
              <a-input v-model:value="form.template" placeholder="如: 轴{0:d} 错误码 {1:x}" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6">
            <a-form-item label="参数1">
              <a-input v-model:value="form.param1" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="参数2">
              <a-input v-model:value="form.param2" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="参数3">
              <a-input v-model:value="form.param3" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="参数4">
              <a-input v-model:value="form.param4" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-space>
          <a-button type="primary" :loading="loading" @click="handleParse">解析</a-button>
          <a-button @click="handleReset">重置</a-button>
        </a-space>
      </a-form>
    </a-card>
    <a-card style="margin-top: 16px" v-if="result">
      <a-descriptions bordered title="解析结果" :column="1">
        <a-descriptions-item label="子系统">{{ result.subsystem }}</a-descriptions-item>
        <a-descriptions-item label="臂号">{{ result.arm }}</a-descriptions-item>
        <a-descriptions-item label="关节号">{{ result.joint }}</a-descriptions-item>
        <a-descriptions-item label="模板">{{ result.template }}</a-descriptions-item>
        <a-descriptions-item label="参数">{{ JSON.stringify(result.params) }}</a-descriptions-item>
        <a-descriptions-item label="释义">{{ result.explanation }}</a-descriptions-item>
      </a-descriptions>
    </a-card>
      </a-tab-pane>

      <a-tab-pane key="viz" tab="可视化测试">
        <a-card title="输入手术结构化数据 (JSON)">
          <a-textarea
            v-model:value="vizJsonText"
            :auto-size="{ minRows: 14 }"
            placeholder="粘贴手术结构化数据，或点击填充示例"
          />
          <a-space style="margin-top: 12px">
            <a-button type="primary" @click="handleRenderViz">跳转可视化页面</a-button>
            <a-button @click="fillVizExample">填充示例</a-button>
          </a-space>
        </a-card>
        <a-card style="margin-top: 16px" title="说明">
          <div style="color: #666; line-height: 1.6;">
            <p>• 输入手术结构化数据JSON格式</p>
            <p>• 点击"跳转可视化页面"将在新标签页打开手术可视化</p>
            <p>• 点击"填充示例"可加载测试数据</p>
            <p>• 可视化页面将显示甘特图、状态机变化、网络延时等图表</p>
          </div>
        </a-card>
      </a-tab-pane>
    </a-tabs>
  </div>
  
</template>

<script>
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import api from '../api'
import { message } from 'ant-design-vue'
import * as echarts from 'echarts'
import { GANTT_STYLE, GANTT_COLORS, normalizeSurgeryData, toMs } from '../utils/visualizationConfig'
import { visualizeSurgery as visualizeSurgeryData } from '../utils/visualizationHelper'

export default {
  name: 'ExplanationTester',
  setup() {
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
        message.warning('请填写故障码 code')
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
        message.warning('请粘贴手术结构化数据 JSON')
        return
      }
      try {
        const raw = JSON.parse(vizJsonText.value)
        // 使用统一的可视化函数，跳转到可视化页面
        visualizeSurgeryData(raw)
      } catch (e) {
        message.error('JSON 解析失败，请检查格式')
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
      form, loading, result, handleParse, handleReset,
      vizJsonText, vizChartRef, handleRenderViz, fillVizExample
    }
  }
}
</script>

<style scoped>
</style>


