<template>
  <component
    :is="tag"
    class="markdown-renderer"
    v-html="sanitizedHtml"
  />
</template>

<script>
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

function renderMarkdown (content) {
  const source = String(content || '').trim()
  if (!source) return ''
  return micromark(source, {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
    allowDangerousHtml: false
  })
}

function decorateLinks (html) {
  if (typeof document === 'undefined') return html
  const root = document.createElement('div')
  root.innerHTML = html
  root.querySelectorAll('a[href]').forEach((anchor) => {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  })
  return root.innerHTML
}

function compactRenderedHtml(html, compact) {
  if (!compact || typeof document === 'undefined') return html
  const root = document.createElement('div')
  root.innerHTML = html

  const nextElementSiblingOf = (node) => {
    let current = node?.nextSibling || null
    while (current) {
      if (current.nodeType === 1) return current
      if (current.nodeType === 3 && String(current.textContent || '').trim()) return null
      current = current.nextSibling
    }
    return null
  }

  const isInlineOnlyParagraph = (element) => {
    if (!element || element.nodeName !== 'P') return false
    return Array.from(element.children).every((child) => {
      return ['A', 'CODE', 'EM', 'STRONG', 'SPAN', 'SMALL', 'SUB', 'SUP', 'IMG', 'BR'].includes(child.nodeName)
    })
  }

  const paragraphs = Array.from(root.querySelectorAll('p'))
  for (const paragraph of paragraphs) {
    if (!paragraph.isConnected) continue
    if (!String(paragraph.textContent || '').trim() && paragraph.querySelectorAll('img, br').length === 0) {
      paragraph.remove()
      continue
    }
    if (!isInlineOnlyParagraph(paragraph)) continue

    let next = nextElementSiblingOf(paragraph)
    while (next && isInlineOnlyParagraph(next)) {
      const nextHtml = String(next.innerHTML || '').trim()
      if (nextHtml) {
        const currentHtml = String(paragraph.innerHTML || '').trim()
        paragraph.innerHTML = `${currentHtml}${currentHtml ? ' ' : ''}${nextHtml}`
      }
      const consumed = next
      next = nextElementSiblingOf(next)
      consumed.remove()
    }
  }

  return root.innerHTML
}

function isStructuredMarkdownLine(line) {
  const text = String(line || '').trim()
  if (!text) return false
  return /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s|```|\|.+\||-{3,}|\*{3,})/.test(text)
}

function normalizeChatMarkdown(content, compact) {
  let source = String(content || '').replace(/\r\n/g, '\n')
  source = source.replace(/<br\s*\/?>/gi, '\n')
  source = source.replace(/\n{3,}/g, '\n\n')
  if (!compact) return source

  const lines = source.split('\n')
  const out = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i]
    const trimmed = current.trim()

    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock
      out.push(current)
      continue
    }

    if (inCodeBlock) {
      out.push(current)
      continue
    }

    if (trimmed !== '') {
      out.push(current)
      continue
    }

    const prev = out.length > 0 ? String(out[out.length - 1] || '') : ''
    let next = ''
    for (let j = i + 1; j < lines.length; j += 1) {
      if (String(lines[j] || '').trim() !== '') {
        next = String(lines[j] || '')
        break
      }
    }

    const prevTrimmed = prev.trim()
    const nextTrimmed = next.trim()
    if (!prevTrimmed || !nextTrimmed) continue

    const keepBlankLine = isStructuredMarkdownLine(prevTrimmed) || isStructuredMarkdownLine(nextTrimmed)
    if (keepBlankLine) {
      if (out[out.length - 1] !== '') out.push('')
    }
  }

  const merged = []
  let paragraphBuffer = []
  inCodeBlock = false

  const flushParagraphBuffer = () => {
    if (!paragraphBuffer.length) return
    merged.push(paragraphBuffer.join(' ').replace(/\s{2,}/g, ' ').trim())
    paragraphBuffer = []
  }

  for (const line of out) {
    const trimmed = String(line || '').trim()

    if (/^```/.test(trimmed)) {
      flushParagraphBuffer()
      inCodeBlock = !inCodeBlock
      merged.push(line)
      continue
    }

    if (inCodeBlock) {
      merged.push(line)
      continue
    }

    if (!trimmed) {
      flushParagraphBuffer()
      if (merged[merged.length - 1] !== '') merged.push('')
      continue
    }

    if (isStructuredMarkdownLine(trimmed)) {
      flushParagraphBuffer()
      merged.push(line)
      continue
    }

    paragraphBuffer.push(trimmed)
  }

  flushParagraphBuffer()
  return merged.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export default {
  name: 'MarkdownRenderer',
  props: {
    content: {
      type: String,
      default: ''
    },
    compact: {
      type: Boolean,
      default: false
    },
    tag: {
      type: String,
      default: 'div'
    }
  },
  setup (props) {
    const sanitizedHtml = computed(() => {
      const normalized = normalizeChatMarkdown(props.content, props.compact)
      const rendered = renderMarkdown(normalized)
      if (!rendered) return ''
      const cleaned = DOMPurify.sanitize(rendered, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'script'],
        FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload']
      })
      return compactRenderedHtml(decorateLinks(cleaned), props.compact)
    })

    return {
      sanitizedHtml
    }
  }
}
</script>

<style scoped>
.markdown-renderer {
  line-height: 1.46;
  color: inherit;
  word-break: break-word;
}

.markdown-renderer :deep(p),
.markdown-renderer :deep(ul),
.markdown-renderer :deep(ol),
.markdown-renderer :deep(blockquote),
.markdown-renderer :deep(pre),
.markdown-renderer :deep(table),
.markdown-renderer :deep(h1),
.markdown-renderer :deep(h2),
.markdown-renderer :deep(h3),
.markdown-renderer :deep(h4),
.markdown-renderer :deep(h5),
.markdown-renderer :deep(h6) {
  margin: 0;
}

.markdown-renderer :deep(p + p) {
  margin-top: 3px;
}

.markdown-renderer :deep(p + ul),
.markdown-renderer :deep(p + ol),
.markdown-renderer :deep(p + blockquote),
.markdown-renderer :deep(p + pre),
.markdown-renderer :deep(p + table),
.markdown-renderer :deep(ul + p),
.markdown-renderer :deep(ol + p),
.markdown-renderer :deep(blockquote + p),
.markdown-renderer :deep(pre + p),
.markdown-renderer :deep(table + p),
.markdown-renderer :deep(ul + ul),
.markdown-renderer :deep(ol + ol),
.markdown-renderer :deep(blockquote + blockquote),
.markdown-renderer :deep(pre + pre),
.markdown-renderer :deep(table + table) {
  margin-top: 6px;
}

.markdown-renderer :deep(h1 + p),
.markdown-renderer :deep(h2 + p),
.markdown-renderer :deep(h3 + p),
.markdown-renderer :deep(h4 + p),
.markdown-renderer :deep(h5 + p),
.markdown-renderer :deep(h6 + p),
.markdown-renderer :deep(p + h1),
.markdown-renderer :deep(p + h2),
.markdown-renderer :deep(p + h3),
.markdown-renderer :deep(p + h4),
.markdown-renderer :deep(p + h5),
.markdown-renderer :deep(p + h6) {
  margin-top: 6px;
}

.markdown-renderer :deep(ul),
.markdown-renderer :deep(ol) {
  padding-left: 16px;
}

.markdown-renderer :deep(li + li) {
  margin-top: 1px;
}

.markdown-renderer :deep(blockquote) {
  padding: 7px 10px;
  border-left: 3px solid #d0d5dd;
  border-radius: 0 10px 10px 0;
  background: #f8fafc;
  color: #475467;
}

.markdown-renderer :deep(pre) {
  overflow-x: auto;
  padding: 9px 11px;
  border-radius: 12px;
  background: #101828;
  color: #f8fafc;
}

.markdown-renderer :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.92em;
  padding: 0.14em 0.38em;
  border-radius: 6px;
  background: #eef2f6;
  color: #1f2937;
}

.markdown-renderer :deep(pre code) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
}

.markdown-renderer :deep(table) {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border: 1px solid #e4e7ec;
  border-radius: 12px;
}

.markdown-renderer :deep(th),
.markdown-renderer :deep(td) {
  padding: 7px 9px;
  border: 1px solid #e4e7ec;
  text-align: left;
  vertical-align: top;
}

.markdown-renderer :deep(th) {
  background: #f8fafc;
  color: #344054;
  font-weight: 600;
}

.markdown-renderer :deep(a) {
  color: #175cd3;
  text-decoration: none;
}

.markdown-renderer :deep(a:hover) {
  text-decoration: underline;
}

.markdown-renderer :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 10px;
}

.markdown-renderer :deep(hr) {
  margin: 10px 0;
  border: none;
  border-top: 1px solid #e4e7ec;
}

.markdown-renderer :deep(h1),
.markdown-renderer :deep(h2),
.markdown-renderer :deep(h3),
.markdown-renderer :deep(h4),
.markdown-renderer :deep(h5),
.markdown-renderer :deep(h6) {
  line-height: 1.28;
  color: #101828;
}

.markdown-renderer :deep(h1) {
  font-size: 22px;
}

.markdown-renderer :deep(h2) {
  font-size: 19px;
}

.markdown-renderer :deep(h3) {
  font-size: 17px;
}
</style>
