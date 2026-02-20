<template>
  <div class="unified-diff-dual-lines" ref="rootRef">
    <div
      v-for="(line, idx) in lines"
      :key="idx"
      class="diff-row"
      :class="{
        'diff-row-removed': line.type === 'removed',
        'diff-row-added': line.type === 'added',
        'diff-row-equal': line.type === 'equal'
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
  return computeUnifiedLinesWithDualNums(props.prev, props.current)
})

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
  flex: 0 0 36px;
  min-width: 36px;
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
</style>
