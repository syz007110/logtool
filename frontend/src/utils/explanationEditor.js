/**
 * 故障解析（explanation）编辑器的自动补全与校验
 * 支持：占位符 {0}~{3}、转义表 :d、过滤器、JSON 规则格式
 */
import { autocompletion } from '@codemirror/autocomplete'
import { linter, lintGutter } from '@codemirror/lint'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { ViewPlugin, Decoration, EditorView, tooltips } from '@codemirror/view'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import faultMappingsRaw from '../../../shared/config/FaultMappings.json'

// _meta 为转义表命名，仅用于提示；实际映射表键为数字字符串
const FAULT_MAPPINGS_META = (faultMappingsRaw && faultMappingsRaw._meta) || {}
const mappingEntries = Object.entries(faultMappingsRaw || {}).filter(([k]) => k !== '_meta')

// 转义表补全选项：从 FaultMappings 生成 { index, info }，info 优先使用 _meta 名称
const FAULT_MAPPING_OPTIONS = mappingEntries.map(([idx, table]) => {
  const name = FAULT_MAPPINGS_META[idx] || ''
  const sample = typeof table === 'object' ? Object.values(table).find(v => v && String(v).trim()) : ''
  const info = name || (sample ? `如: ${String(sample).slice(0, 20)}${String(sample).length > 20 ? '…' : ''}` : `转义表 ${idx}`)
  return { index: idx, info }
})
// 0 表示跳过映射，直接使用参数原始值（与后端 explanationParser 一致）
FAULT_MAPPING_OPTIONS.unshift({ index: '0', info: '跳过映射，直接使用参数原始值' })

// 占位符补全：{0}~{3} 对应 param1~param4
const PLACEHOLDER_OPTIONS = [
  { label: '{0}', type: 'variable', detail: 'param1', info: '参数1' },
  { label: '{1}', type: 'variable', detail: 'param2', info: '参数2' },
  { label: '{2}', type: 'variable', detail: 'param3', info: '参数3' },
  { label: '{3}', type: 'variable', detail: 'param4', info: '参数4' }
]

// 带常用过滤器的占位符
const PLACEHOLDER_WITH_FILTER_OPTIONS = [
  { label: '{0|scale(0.001)}', type: 'variable', detail: 'param1', info: '参数1 × 0.001' },
  { label: '{1|scale(0.001)}', type: 'variable', detail: 'param2', info: '参数2 × 0.001' },
  { label: '{0|round(2)}', type: 'variable', detail: 'param1', info: '参数1 保留2位小数' },
  { label: '{0|fixed(2)}', type: 'variable', detail: 'param1', info: '参数1 固定2位小数' },
  { label: '{0|unit(ms->s)}', type: 'variable', detail: 'param1', info: '参数1 单位换算 ms→s' },
  { label: '{0|hex(2)}', type: 'variable', detail: 'param1', info: '参数1 转十六进制' },
  { label: '{0|zpad(4)}', type: 'variable', detail: 'param1', info: '参数1 左侧补零至4位' }
]

// 过滤器名称与说明（在 | 后补全时动态生成完整占位符）
const FILTER_DEFS = [
  { name: 'scale(0.001)', info: '数值 × 系数' },
  { name: 'mul(100)', info: '数值 × 系数' },
  { name: 'div(1000)', info: '数值 ÷ 除数' },
  { name: 'round(2)', info: '四舍五入，保留小数位' },
  { name: 'fixed(2)', info: '固定小数位数' },
  { name: 'unit(ms->s)', info: '单位换算' },
  { name: 'hex(2)', info: '转十六进制' },
  { name: 'zpad(4)', info: '左侧补零' },
  { name: "prefix('单位: ')", info: '数值前加前缀' },
  { name: "suffix(' ms')", info: '数值后加后缀' },
  { name: 'ascii()', info: '数值转 ASCII 字符' },
  { name: 'asciiHex()', info: '十六进制字符串转 ASCII（如 414243→ABC）' },
  { name: 'highByte', info: '取高字节' },
  { name: 'lowByte', info: '取低字节' }
]

// JSON 规则结构片段
const JSON_SNIPPET = {
  label: 'JSON 规则结构',
  type: 'keyword',
  apply: `{
  "rules": [
    { "match": { "param1": 1 }, "template": "模板A", "priority": 0 },
    { "match": { "param1": { "gt": 10 } }, "template": "模板B" }
  ],
  "fallback": "默认模板"
}`,
  info: 'match 支持: eq, gt, gte, lt, lte, in, between, bitAnd, regex'
}

// 释义输入框默认模板（新建故障码时自动填充）
export const DEFAULT_EXPLANATION_TEMPLATE = `{
  "rules": [
    { "match": { "param1": 1 }, "template": "模板A", "priority": 0 },
    { "match": { "param1": { "gt": 10 } }, "template": "模板B" }
  ],
  "fallback": "默认模板"
}`

// match 支持的操作符：在 "param1": { " 后提示
const MATCH_OPERATORS = [
  { key: 'eq', info: '等于' },
  { key: 'gt', info: '大于' },
  { key: 'gte', info: '大于等于' },
  { key: 'lt', info: '小于' },
  { key: 'lte', info: '小于等于' },
  { key: 'in', info: '在数组中' },
  { key: 'between', info: '区间' },
  { key: 'bitAnd', info: '按位与' },
  { key: 'regex', info: '正则匹配' }
]

/**
 * 占位符补全：输入 { 时触发
 */
function explanationCompletionSource (context) {
  // 使用全文光标前内容，避免仅用当前行时在换行/JSON 等场景下匹配不到
  const before = context.state.sliceDoc(0, context.pos)
  let from = context.pos

  // 检测是否在 match 条件对象内：优先于占位符 {，避免 "param1": { 或 {0| 被误匹配
  // 情况1：已输入 key 的前缀，如 "param1": { " 或 "param2": { "gt
  const matchOpKey = before.match(/"param[1-4]":\s*\{[^}]*"([^"]*)$/)
  if (matchOpKey) {
    const prefix = matchOpKey[1]
    from = context.pos - prefix.length
    const options = MATCH_OPERATORS
      .filter(opt => opt.key.startsWith(prefix))
      .map(opt => ({
        label: opt.key,
        type: 'keyword',
        detail: opt.info,
        info: opt.info,
        apply: `"${opt.key}": `
      }))
    if (options.length > 0) {
      return {
        from,
        options,
        validFor: /^[a-zA-Z]*$/,
        filter: false
      }
    }
  }

  // 情况2：刚输入 {，在 match 对象开头，如 "param1": { 或 "param1": {
  const matchOpStart = before.match(/"param[1-4]":\s*\{\s*$/)
  if (matchOpStart) {
    from = context.pos
    const options = MATCH_OPERATORS.map(opt => ({
      label: opt.key,
      type: 'keyword',
      detail: opt.info,
      info: opt.info,
      apply: `"${opt.key}": `
    }))
    return {
      from,
      options,
      validFor: /^.*$/,
      filter: false
    }
  }

  // 检测是否在输入转义表索引：{0: 或 {0:1 或 {0:0 等
  const matchMapping = before.match(/\{([0-3]):(-?\d*)$/)
  if (matchMapping) {
    const paramIdx = matchMapping[1]
    const prefix = matchMapping[2] || ''
    from = context.pos - matchMapping[0].length
    const options = FAULT_MAPPING_OPTIONS
      .filter(opt => String(opt.index).startsWith(prefix))
      .map(opt => ({
        label: opt.index,
        type: 'constant',
        detail: opt.info,
        info: opt.info,
        apply: `{${paramIdx}:${opt.index}}`
      }))
    if (options.length > 0) {
      return {
        from,
        options,
        validFor: /^\{[0-3]:-?\d*$/,
        filter: false // 禁用默认过滤，显示全部转义表选项
      }
    }
  }

  // 检测是否在输入过滤器：{0| 或 {1|scale 或 {| 等（独立分支，与 {0: 同理，避免被 matchPlaceholder 抢占）
  const matchFilter = before.match(/\{([0-3]?)\|([^}]*)$/)
  if (matchFilter) {
    const paramIdx = matchFilter[1] || '0'
    from = context.pos - matchFilter[0].length
    const options = FILTER_DEFS.map(({ name, info }) => ({
      label: name,
      type: 'function',
      info,
      apply: `{${paramIdx}|${name}}`
    }))
    return {
      from,
      options,
      validFor: /^\{[0-3]?\|[^}]*$/,
      filter: false // 禁用默认过滤，显示全部 14 个过滤器
    }
  }

  // 检测是否在输入占位符：{0、{1 等（不含 |，不匹配单独的 {）
  const matchPlaceholder = before.match(/\{([0-3])(?!\|)([^}]*)?$/)
  if (matchPlaceholder) {
    from = context.pos - matchPlaceholder[0].length
    const paramIdx = matchPlaceholder[1]
    const options = [
      ...PLACEHOLDER_OPTIONS,
      ...FILTER_DEFS.map(({ name, info }) => ({
        label: `{${paramIdx}|${name}}`,
        type: 'function',
        detail: info,
        info,
        apply: `{${paramIdx}|${name}}`
      }))
    ]
    return {
      from,
      options,
      validFor: /^\{[0-3]$/,
      filter: false // 禁用默认过滤，显示全部占位符/转义表/过滤器
    }
  }

  // 检测是否在文档开头或空行，可建议 JSON 结构
  const trimmedBefore = before.trim()
  if ((context.pos === 0 || trimmedBefore === '') && context.explicit) {
    return {
      from: context.pos,
      options: [JSON_SNIPPET, ...PLACEHOLDER_OPTIONS],
      validFor: /^.*$/,
      filter: false
    }
  }

  return null
}

// 占位符高亮：{0}、{1}、{0|scale(0.001)} 等
const PLACEHOLDER_REGEX = /\{[0-3](?::-?\d+)?(?:\|[^}]*)?\}/g

function placeholderHighlightPlugin () {
  return ViewPlugin.fromClass(class {
    constructor (view) {
      this.decorations = this.buildDecorations(view)
    }

    update (update) {
      if (update.docChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations (view) {
      const decos = []
      const text = view.state.doc.toString()
      let m
      PLACEHOLDER_REGEX.lastIndex = 0
      while ((m = PLACEHOLDER_REGEX.exec(text)) !== null) {
        decos.push(Decoration.mark({ class: 'cm-explanationPlaceholder' }).range(m.index, m.index + m[0].length))
      }
      return Decoration.set(decos)
    }
  }, {
    decorations: v => v.decorations
  })
}

/**
 * 占位符语法校验：未闭合的 { }
 */
function placeholderLinter (view) {
  const text = view.state.doc.toString()
  const diagnostics = []

  let stack = 0
  let inString = false
  let stringChar = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inString) {
      if (c === stringChar && text[i - 1] !== '\\') inString = false
      i++
      continue
    }
    if (c === '"' || c === "'") {
      inString = true
      stringChar = c
      i++
      continue
    }
    if (c === '{') {
      stack++
      i++
      continue
    }
    if (c === '}') {
      stack--
      if (stack < 0) {
        diagnostics.push({
          from: i,
          to: i + 1,
          severity: 'error',
          message: '多余的 }，占位符格式错误'
        })
        stack = 0
      }
      i++
      continue
    }
    i++
  }

  if (stack > 0) {
    const lastOpen = text.lastIndexOf('{')
    if (lastOpen >= 0) {
      diagnostics.push({
        from: lastOpen,
        to: lastOpen + 1,
        severity: 'error',
        message: '占位符未闭合，缺少 }'
      })
    }
  }

  return diagnostics
}

/**
 * 合并校验：JSON 格式时用 JSON 校验，否则用占位符校验
 */
function explanationLinter (view) {
  const text = view.state.doc.toString()
  const trimmed = text.trim()

  if (!trimmed) return []

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return jsonParseLinter()(view)
  }

  return placeholderLinter(view)
}

/**
 * 故障解析编辑器的 CodeMirror 扩展
 */
export function explanationExtensions () {
  return [
    tooltips({
      parent: document.body,
      position: 'fixed'
    }), /* 悬浮窗挂到 body 且使用 fixed，避免关闭弹窗后撑大页面滚动范围 */
    EditorView.theme({
      '&': { height: '100%', overflow: 'visible' }, /* visible 允许补全悬浮窗溢出，不被裁剪 */
      '.cm-scroller': { overflow: 'auto' }
    }),
    syntaxHighlighting(defaultHighlightStyle),
    json(),
    placeholderHighlightPlugin(),
    autocompletion({
      override: [explanationCompletionSource],
      activateOnTyping: true
    }),
    linter(explanationLinter),
    lintGutter()
  ]
}
