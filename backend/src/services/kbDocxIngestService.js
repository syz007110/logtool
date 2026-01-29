const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const mammoth = require('mammoth');

function sha1(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex');
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtmlToText(htmlFragment) {
  const s = decodeHtmlEntities(String(htmlFragment || ''))
    // Keep images as a readable placeholder for KB search context
    .replace(/<img\b[^>]*>/gi, ' <下载原文查看图片> ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/th>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return s
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isTocHeading(text) {
  const s = String(text || '').trim().toLowerCase();
  return s === '目录' || s === 'contents' || s === 'table of contents';
}

function isTocLine(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  // Typical TOC lines: dotted leaders + page number OR tab-separated with ending page number.
  const endsWithPage = /\s\d{1,4}\s*$/.test(s);
  if (!endsWithPage) return false;
  if (/\.{4,}/.test(s)) return true;
  if (/\t/.test(s)) return true;
  // Some TOC lines use repeated underscores/spaces, keep it conservative.
  if (/_{4,}/.test(s)) return true;
  return false;
}

/**
 * Parse mammoth HTML into coarse blocks:
 * - heading(level, text)
 * - paragraph(text)
 * - table(rows: string[][])
 *
 * We intentionally keep it simple for v1.
 */
function parseHtmlToTokens(html) {
  const input = String(html || '');
  const tagRe = /<(\/?)(h[1-6]|p|table|tr|td|th)\b[^>]*>/ig;

  const tokens = [];

  let lastIndex = 0;
  let match = null;

  let collecting = null; // { type: 'heading'|'p'|'cell', level?, text: '' }
  let table = null; // { rows: string[][], currentRow: string[] }

  // Skip DOCX table-of-contents section if detected
  const toc = { active: false, baseLevel: 1, seen: false };

  const flushText = (text) => {
    if (!text) return;
    const cleaned = stripHtmlToText(text);
    if (!cleaned) return;
    if (collecting) collecting.text += (collecting.text ? '\n' : '') + cleaned;
  };

  while ((match = tagRe.exec(input)) !== null) {
    const [full, closingSlash, tagNameRaw] = match;
    const tagName = String(tagNameRaw || '').toLowerCase();
    const isClosing = closingSlash === '/';

    // Text before this tag
    const between = input.slice(lastIndex, match.index);
    flushText(between);
    lastIndex = match.index + full.length;

    // Handle tags
    if (!isClosing) {
      if (/^h[1-6]$/.test(tagName)) {
        collecting = { type: 'heading', level: Number(tagName.slice(1)), text: '' };
      } else if (tagName === 'p') {
        collecting = { type: 'p', text: '' };
      } else if (tagName === 'table') {
        table = { rows: [], currentRow: null };
      } else if (tagName === 'tr' && table) {
        table.currentRow = [];
      } else if ((tagName === 'td' || tagName === 'th') && table) {
        collecting = { type: 'cell', text: '' };
      }
    } else {
      if (/^h[1-6]$/.test(tagName) && collecting?.type === 'heading') {
        const text = String(collecting.text || '').trim();
        if (text) {
          const level = Number(collecting.level) || 1;
          // Enter TOC section: "目录/Contents" heading, skip it and subsequent TOC lines
          if (isTocHeading(text)) {
            toc.active = true;
            toc.baseLevel = level;
            toc.seen = true;
          } else {
            // Exit TOC section when a same-or-higher level heading appears
            if (toc.active && level <= toc.baseLevel) toc.active = false;
            if (!toc.active) tokens.push({ type: 'heading', level, text });
          }
        }
        collecting = null;
      } else if (tagName === 'p' && collecting?.type === 'p') {
        const text = String(collecting.text || '').trim();
        if (text) {
          // Skip TOC entries
          if (!toc.active && !toc.seen && isTocLine(text)) {
            // Heuristic-only skip even without TOC heading (best-effort)
          } else if (!toc.active && toc.seen === true && isTocLine(text)) {
            // If TOC was seen, continue skipping until heading closes it
          } else if (!toc.active && !isTocLine(text)) {
            tokens.push({ type: 'p', text });
          }
        }
        collecting = null;
      } else if ((tagName === 'td' || tagName === 'th') && table && collecting?.type === 'cell') {
        const text = String(collecting.text || '').trim();
        if (table.currentRow) table.currentRow.push(text);
        collecting = null;
      } else if (tagName === 'tr' && table && table.currentRow) {
        // keep empty cells too (for alignment)
        if (table.currentRow.some((c) => String(c || '').trim())) {
          table.rows.push(table.currentRow);
        }
        table.currentRow = null;
      } else if (tagName === 'table' && table) {
        if (table.rows.length) tokens.push({ type: 'table', rows: table.rows });
        table = null;
      }
    }
  }

  // Tail text after last tag
  flushText(input.slice(lastIndex));

  // If we ended while still collecting a paragraph (some docs omit closing tags)
  if (collecting?.type === 'p') {
    const text = String(collecting.text || '').trim();
    if (text) tokens.push({ type: 'p', text });
  }

  return tokens;
}

function inferDocType(filePath) {
  const p = String(filePath || '');
  if (/详细设计|概要设计|design/i.test(p)) return 'design';
  if (/需求|requirement/i.test(p)) return 'requirement';
  if (/说明书|手册|manual/i.test(p)) return 'manual';
  return 'other';
}

function buildHeadingPath(stack) {
  return stack.filter(Boolean).map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
}

function tokensToBlocks(tokens, { title }) {
  const headingStack = new Array(6).fill('');
  const blocks = [];

  for (const t of tokens || []) {
    if (t?.type === 'heading') {
      const level = Math.min(Math.max(Number(t.level) || 1, 1), 6);
      headingStack[level - 1] = String(t.text || '').trim();
      // clear deeper levels
      for (let i = level; i < 6; i += 1) headingStack[i] = '';
      continue;
    }
    if (t?.type === 'p') {
      const text = String(t.text || '').trim();
      if (!text) continue;
      blocks.push({
        kind: 'p',
        headingPath: buildHeadingPath(headingStack),
        title,
        text
      });
      continue;
    }
    if (t?.type === 'table') {
      const rows = Array.isArray(t.rows) ? t.rows : [];
      const lines = [];
      for (const row of rows) {
        const cells = Array.isArray(row) ? row.map((c) => String(c || '').trim()).filter((c) => c) : [];
        if (!cells.length) continue;
        lines.push(cells.join(' | '));
      }
      const text = lines.join('\n').trim();
      if (!text) continue;
      blocks.push({
        kind: 'table',
        headingPath: buildHeadingPath(headingStack),
        title,
        text
      });
    }
  }

  // If no headings detected, still keep a synthetic path based on title
  if (!blocks.length) return [];
  return blocks.map((b) => {
    const hp = Array.isArray(b.headingPath) ? b.headingPath : [];
    const finalHp = hp.length ? hp : [String(title || '').trim()].filter(Boolean);
    return { ...b, headingPath: finalHp };
  });
}

function splitLargeText(text, maxChars) {
  const s = String(text || '').trim();
  if (!s) return [];
  if (s.length <= maxChars) return [s];

  // Try to split by blank lines first, then by sentence-ish punctuation.
  const parts = s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    const out = [];
    for (const p of parts) {
      if (p.length <= maxChars) out.push(p);
      else out.push(...splitLargeText(p, maxChars));
    }
    return out;
  }

  const sentenceParts = s.split(/(?<=[。！？；;.!?])\s*/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  let buf = '';
  for (const sp of sentenceParts) {
    if (!buf) buf = sp;
    else if (buf.length + 1 + sp.length <= maxChars) buf = `${buf} ${sp}`;
    else {
      out.push(buf);
      buf = sp;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [s.slice(0, maxChars)];
}

/**
 * 检测是否是列表项
 * 匹配模式：数字编号（1)、1.）、项目符号（•、-、*）、中文编号等
 */
function isListItem(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;

  // 数字编号：1)、1.、2)、2. 等
  if (/^\d+[).]\s/.test(trimmed)) return true;

  // 项目符号：•、-、*、▪、▫ 等
  if (/^[•\-\*▪▫○●]\s/.test(trimmed)) return true;

  // 中文编号：一、二、三、等
  if (/^[一二三四五六七八九十]+[、.]\s/.test(trimmed)) return true;

  // 字母编号：a)、a.、A)、A. 等
  if (/^[a-zA-Z][).]\s/.test(trimmed)) return true;

  // 短标题模式（如"返回值："、"参数："等，通常后面跟列表项）
  if (/^[^：:]{1,20}[：:]\s*$/.test(trimmed)) return true;

  return false;
}

function blocksToChunks(blocks, { minChars = 300, maxChars = 1200, preserveParagraphs = true } = {}) {
  const out = [];
  let current = null; // { headingPath, parts: [] }

  const flush = () => {
    if (!current) return;
    const content = current.parts.join('\n\n').trim();
    if (content) out.push({ headingPath: current.headingPath, content });
    current = null;
  };

  const sameHeadingPath = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

  // Avoid orphan tiny chunks like "仿真培训任务详解：" / "操作结果绩效报告："
  const isLeadInLine = (text) => {
    const s = String(text || '').trim();
    if (!s) return false;
    return s.length <= 80 && /[:：]$/.test(s);
  };

  // Conservative "short paragraph" heuristic for merging within same headingPath.
  // We only merge when current chunk is still small, to reduce fragmentation without creating mega-chunks.
  const isMergeableShortPara = (text) => {
    const s = String(text || '').trim();
    if (!s) return false;
    // Keep it conservative: short enough and not a table-like row (many tabs/pipes).
    if (s.length > Math.max(120, Math.floor(minChars * 0.6))) return false;
    if ((s.match(/\t/g) || []).length >= 2) return false;
    if ((s.match(/\|/g) || []).length >= 4) return false;
    return true;
  };

  for (const b of blocks || []) {
    const hp = Array.isArray(b.headingPath) ? b.headingPath : [];
    const blockText = String(b.text || '').trim();
    if (!blockText) continue;

    // 段落处理
    if (preserveParagraphs && b.kind === 'p') {
      const isList = isListItem(blockText);
      const isShort = blockText.length < minChars;

      // 列表项且较短：合并到当前chunk，不独立成chunk
      if (isList && isShort) {
        // 如果当前chunk存在且headingPath相同，则合并
        if (current && sameHeadingPath(current.headingPath, hp)) {
          const nextLen = (current.parts.join('\n\n').length + (current.parts.length ? 2 : 0) + blockText.length);
          if (nextLen <= maxChars) {
            current.parts.push(blockText);
            // 如果chunk已经达到minChars且接近maxChars，提前flush
            const curLen = current.parts.join('\n\n').length;
            if (curLen >= minChars && curLen >= maxChars * 0.9) {
              flush();
            }
            continue;
          }
        }
        // 如果当前chunk不存在、headingPath不同或空间不足，先flush再创建新chunk
        flush();
        current = { headingPath: hp, parts: [blockText] };
        continue;
      }

      // 非列表项：结构绑定合并策略（减少碎片）
      if (!isList) {
        const curHp = current?.headingPath || null;
        const sameHp = current && sameHeadingPath(curHp, hp);
        const curText = sameHp ? current.parts.join('\n\n').trim() : '';
        const curLen = sameHp ? curText.length : 0;
        const sep = current?.parts?.length ? 2 : 0;
        const canAppend = sameHp && (curLen + sep + blockText.length) <= maxChars;

        // 1) If current is a tiny lead-in, attach this paragraph to it.
        if (canAppend && curLen > 0 && curLen < minChars && isLeadInLine(curText)) {
          current.parts.push(blockText);
          const newLen = current.parts.join('\n\n').length;
          if (newLen >= minChars && newLen >= maxChars * 0.9) flush();
          continue;
        }

        // 2) If this line itself is a short lead-in, keep it in current to merge with next paragraph.
        if (isShort && isLeadInLine(blockText)) {
          if (!sameHp) {
            flush();
            current = { headingPath: hp, parts: [blockText] };
          } else if (canAppend) {
            current.parts.push(blockText);
          } else {
            flush();
            current = { headingPath: hp, parts: [blockText] };
          }
          continue;
        }

        // 3) Merge consecutive short paragraphs under same headingPath until current reaches minChars.
        if (isShort && isMergeableShortPara(blockText) && sameHp && canAppend && curLen > 0 && curLen < minChars) {
          current.parts.push(blockText);
          const newLen = current.parts.join('\n\n').length;
          if (newLen >= minChars && newLen >= maxChars * 0.9) flush();
          continue;
        }
      }

      // 非列表项（默认）：先刷新当前chunk（可能包含之前的列表项/引导行）
      flush();

      // 如果段落长度在限制内，直接作为独立chunk
      if (blockText.length <= maxChars) {
        // If current is a lead-in we just flushed, it would have been emitted as a tiny chunk.
        // Instead, we create a mergeable current chunk when this paragraph is short and same headingPath.
        if (isMergeableShortPara(blockText) && blockText.length < minChars) {
          current = { headingPath: hp, parts: [blockText] };
          continue;
        }
        out.push({ headingPath: hp, content: blockText });
        continue;
      }

      // 超长段落：按句子分割，但每个piece独立成chunk，不与其他段落合并
      const pieces = splitLargeText(blockText, maxChars);
      for (const piece of pieces) {
        out.push({ headingPath: hp, content: piece });
      }
      continue;
    }

    // 表格和其他类型：保持原有逻辑，允许合并（如果空间允许）
    const pieces = splitLargeText(blockText, maxChars);
    for (const piece of pieces) {
      if (!current || !sameHeadingPath(current.headingPath, hp)) {
        flush();
        current = { headingPath: hp, parts: [] };
      }

      const nextLen = (current.parts.join('\n\n').length + (current.parts.length ? 2 : 0) + piece.length);
      if (nextLen <= maxChars) {
        current.parts.push(piece);
      } else {
        // If current is too small, still flush; then start new chunk with this piece.
        flush();
        current = { headingPath: hp, parts: [piece] };
      }

      // If we already reached minChars, we can flush at boundary to avoid mega-chunks.
      const curLen = current.parts.join('\n\n').length;
      if (curLen >= minChars && curLen >= maxChars * 0.9) {
        flush();
      }
    }
  }
  flush();

  return out;
}

async function parseDocxToChunks(filePath, { minChars = 300, maxChars = 1200, preserveParagraphs = true } = {}) {
  const fp = String(filePath || '').trim();
  if (!fp) throw new Error('filePath is required');

  const stat = await fs.promises.stat(fp);
  const title = path.basename(fp);

  // Mammoth: HTML keeps headings better than rawText for Word "Heading" styles
  const result = await mammoth.convertToHtml(
    { path: fp },
    {
      includeDefaultStyleMap: true,
      // Emit <img> tags so we can replace them with a readable placeholder downstream.
      convertImage: mammoth.images.imgElement(() => ({ src: 'kb-image' }))
    }
  );
  const html = String(result?.value || '');
  const tokens = parseHtmlToTokens(html);
  const blocks = tokensToBlocks(tokens, { title });
  const chunks = blocksToChunks(blocks, { minChars, maxChars, preserveParagraphs });

  const doc = {
    docId: sha1(fp),
    path: fp,
    title,
    docType: inferDocType(fp),
    lang: 'zh',
    mtimeMs: stat.mtimeMs,
    size: stat.size
  };

  return { doc, chunks, debug: { warnings: result?.messages || [] } };
}

module.exports = {
  parseDocxToChunks,
  // exported for testing / reuse
  _internal: {
    parseHtmlToTokens,
    tokensToBlocks,
    blocksToChunks,
    stripHtmlToText,
    inferDocType
  }
};

