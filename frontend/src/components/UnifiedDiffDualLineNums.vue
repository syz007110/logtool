<template>
  <div
    class="unified-diff-dual-lines"
    ref="rootRef"
    :style="{ '--line-num-width': lineNumWidth }"
  >
    <div
      v-for="(line, idx) in lines"
      :key="idx"
      class="diff-row"
      :class="{
        'diff-row-removed': line.type === 'removed',
        'diff-row-added': line.type === 'added',
        'diff-row-equal': line.type === 'equal',
        'diff-row-collapsed': line.type === 'collapsed'
      }"
    >
      <span class="line-num line-num-old">{{ line.oldNum ?? '' }}</span>
      <span class="line-num line-num-new">{{ line.newNum ?? '' }}</span>
      <span class="line-content" :class="{ 'line-content-changed': line.type !== 'equal' }">
        <span class="line-prefix">{{ line.prefix }}</span>
        <code>{{ line.value }}</code>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import DiffMatchPatch from 'diff-match-patch'

const props = defineProps({
  prev: { type: String, default: '' },
  current: { type: String, default: '' }
})

const rootRef = ref(null)

function computeUnifiedLinesWithDualNums(prev, current) {
  const dmp = new DiffMatchPatch()
  const a = dmp.diff_linesToChars_(prev || '', current || '')
  const diffs = dmp.diff_main(a.chars1, a.chars2, false)
  dmp.diff_cleanupSemantic(diffs)
  dmp.diff_charsToLines_(diffs, a.lineArray)

  const result = []
  let oldNum = 1
  let newNum = 1

  for (let i = 0; i < diffs.length; i++) {
    const [op, text] = diffs[i]
    const linesArr = text.replace(/\n$/, '').split('\n')

    if (op === -1) {
      for (let j = 0; j < linesArr.length; j++) {
        result.push({
          type: 'removed',
          prefix: '-',
          value: linesArr[j],
          oldNum: oldNum++,
          newNum: null
        })
      }
    } else if (op === 0) {
      for (let j = 0; j < linesArr.length; j++) {
        result.push({
          type: 'equal',
          prefix: ' ',
          value: linesArr[j],
          oldNum: oldNum++,
          newNum: newNum++
        })
      }
    } else {
      for (let j = 0; j < linesArr.length; j++) {
        result.push({
          type: 'added',
          prefix: '+',
          value: linesArr[j],
          oldNum: null,
          newNum: newNum++
        })
      }
    }
  }

  return result
}

const lines = computed(() => {
  const raw = computeUnifiedLinesWithDualNums(props.prev, props.current)
  // For huge payloads, collapse long equal blocks to reduce DOM nodes and repaint cost.
  if (raw.length > 1200) {
    return collapseEqualLines(raw, 3, 30)
  }
  return raw
})

const lineNumWidth = computed(() => {
  const maxLineNum = lines.value.reduce((max, line) => {
    const oldNum = Number(line?.oldNum || 0)
    const newNum = Number(line?.newNum || 0)
    return Math.max(max, oldNum, newNum)
  }, 0)
  const digits = Math.max(String(maxLineNum || 1).length, 2)
  return `${Math.max(digits + 4, 6)}ch`
})

function collapseEqualLines(lines, context = 3, minCollapseRun = 30) {
  const out = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'equal') {
      out.push(lines[i])
      i += 1
      continue
    }
    let j = i
    while (j < lines.length && lines[j].type === 'equal') j += 1
    const runLen = j - i
    if (runLen > (context * 2 + minCollapseRun)) {
      out.push(...lines.slice(i, i + context))
      out.push({
        type: 'collapsed',
        oldNum: null,
        newNum: null,
        prefix: '...',
        value: `${runLen - context * 2} unchanged lines`
      })
      out.push(...lines.slice(j - context, j))
    } else {
      out.push(...lines.slice(i, j))
    }
    i = j
  }
  return out
}

defineExpose({
  rootRef,
  rootEl: () => rootRef.value
})
</script>

<style scoped>
.unified-diff-dual-lines {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  background: #fff;
  padding: 0.5em 0;
  overflow-x: auto;
}

.diff-row {
  display: flex;
  width: 100%;
  min-height: 1.5em;
}

.diff-row .line-num {
  flex: 0 0 var(--line-num-width, 4ch);
  min-width: var(--line-num-width, 4ch);
  padding: 0 6px;
  text-align: right;
  color: #999;
  font-size: 0.9em;
  user-select: none;
}

.diff-row .line-num-old {
  border-right: 1px solid #eee;
}

.diff-row .line-num-new {
  border-right: 1px solid #eee;
}

.diff-row .line-content {
  flex: 1;
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-row .line-prefix {
  display: inline-block;
  width: 1.2em;
  opacity: 0.8;
}

.diff-row .line-content code {
  font-family: inherit;
  background: none;
  padding: 0;
}

.diff-row-removed .line-content {
  background-color: rgba(255, 0, 0, 0.08);
}

.diff-row-added .line-content {
  background-color: rgba(0, 200, 100, 0.08);
}

.diff-row-equal .line-content {
  background: transparent;
}

.diff-row-collapsed .line-content {
  color: #666;
  background: #fafafa;
  font-style: italic;
}
</style>
