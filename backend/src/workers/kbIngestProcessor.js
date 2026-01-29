const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { postgresqlSequelize } = require('../config/postgresql');
const { getElasticsearchClient } = require('../config/elasticsearch');
const kbStorage = require('../config/kbStorage');
const { parseDocxToChunks, _internal } = require('../services/kbDocxIngestService');

// Lazy-load models to avoid init order issues
const KbDocument = require('../models/kb_document');
const KbChunk = require('../models/kb_chunk');

function safeUnlink(fp) {
  try {
    if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_) {}
}

function safeMkdir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

function normalizeExt(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (ext === '.docx') return 'docx';
  if (ext === '.md' || ext === '.markdown') return 'md';
  if (ext === '.txt') return 'txt';
  return '';
}

function decodeMaybeLatin1(name) {
  try {
    // multer on windows sometimes yields utf8 already; keep best-effort
    return Buffer.from(String(name || ''), 'latin1').toString('utf8');
  } catch (_) {
    return String(name || '');
  }
}

function sha256File(fp) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(fp);
    s.on('error', reject);
    s.on('data', (buf) => h.update(buf));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function clampHeadingLevel(level) {
  const n = Number(level) || 1;
  return Math.min(Math.max(n, 1), 6);
}

function headingStackToPath(headingStack, title) {
  const hp = (headingStack || []).filter(Boolean);
  return hp.length ? hp : [String(title || '').trim()].filter(Boolean);
}

/**
 * 多模式标题识别（面向“手册类文本”）
 * - Markdown ATX: # 标题
 * - 编号标题: 1.0 xxx / 6.4 xxx / 6.4.2 xxx（避免误判 1. xxx 列表项）
 * - 中文章节: 第X章/节/部分（可选增强）
 *
 * 返回：{ level, text, confidence } 或 null
 */
function detectHeadingLine(line, { prevBlank = false, nextBlank = false } = {}) {
  const s = String(line || '').trim();
  if (!s) return null;

  // ATX headings
  const mAtx = s.match(/^(#{1,6})\s+(.+)$/);
  if (mAtx) {
    return {
      level: clampHeadingLevel(mAtx[1].length),
      text: String(mAtx[2] || '').trim(),
      confidence: 1.0
    };
  }

  // Numbered headings: require at least one dot AND digits after each dot.
  // Examples: 1.0 / 1.1 / 6.4.2
  // Non-example (list item): 1. xxx
  const mNum = s.match(/^(\d+(?:\.\d+){1,5})\s+(.+)$/);
  if (mNum) {
    const nums = String(mNum[1]).split('.');
    const tail = nums[nums.length - 1];

    // Heuristic: "1.0" is often a top-level section label.
    const rawLevel = (tail === '0') ? (nums.length - 1) : nums.length;
    const level = clampHeadingLevel(rawLevel || 1);

    // Context confidence: headings often have blank line around them, and are relatively short.
    const titleText = `${mNum[1]} ${String(mNum[2] || '').trim()}`.trim();
    let confidence = 0.85;
    if (prevBlank) confidence += 0.05;
    if (nextBlank) confidence += 0.05;
    if (titleText.length <= 80) confidence += 0.05;
    confidence = Math.min(1.0, confidence);

    return { level, text: titleText, confidence };
  }

  // Chinese chapter headings (optional)
  // e.g. 第一章 xxx / 第1章 xxx / 第十节 xxx / 第三部分 xxx
  const mZh = s.match(/^(第[0-9一二三四五六七八九十百千]+[章节部分])\s*(.+)?$/);
  if (mZh) {
    const text = `${String(mZh[1] || '').trim()} ${String(mZh[2] || '').trim()}`.trim();
    let confidence = 0.75;
    if (prevBlank) confidence += 0.05;
    if (nextBlank) confidence += 0.05;
    if (text.length <= 80) confidence += 0.05;
    confidence = Math.min(1.0, confidence);
    return { level: 1, text, confidence };
  }

  return null;
}

function parseMarkdownToBlocks(markdown, { title }) {
  const text = String(markdown || '');
  const lines = text.split(/\r?\n/);
  const headingStack = new Array(6).fill('');
  const blocks = [];

  let inCode = false;
  let para = [];
  let lastHeadingLevel = 0;

  const flushPara = () => {
    const content = para.join('\n').trim();
    para = [];
    if (!content) return;
    blocks.push({
      kind: 'p',
      headingPath: headingStackToPath(headingStack, title),
      title,
      text: content
    });
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = String(lines[idx] || '');
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      para.push(line);
      continue;
    }
    if (!inCode) {
      const prevLine = idx > 0 ? String(lines[idx - 1] || '') : '';
      const nextLine = idx < lines.length - 1 ? String(lines[idx + 1] || '') : '';
      const h = detectHeadingLine(line, { prevBlank: !prevLine.trim(), nextBlank: !nextLine.trim() });
      if (h && h.confidence >= 0.8) {
        flushPara();

        // Basic structure repair: prevent jumps (e.g. 1 -> 3). Clamp to lastLevel + 1.
        let level = clampHeadingLevel(h.level);
        if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) level = lastHeadingLevel + 1;
        lastHeadingLevel = level;

        headingStack[level - 1] = String(h.text || '').trim();
        for (let i = level; i < 6; i += 1) headingStack[i] = '';
        continue;
      }
      if (!line.trim()) {
        flushPara();
        continue;
      }
    }
    para.push(line);
  }
  flushPara();
  return blocks;
}

function parseTextToBlocks(text, { title }) {
  const s = String(text || '');
  const lines = s.split(/\r?\n/);
  const headingStack = new Array(6).fill('');
  const blocks = [];

  let para = [];
  let lastHeadingLevel = 0;
  let detectedHeadings = 0;

  const flushPara = () => {
    const content = para.join('\n').trim();
    para = [];
    if (!content) return;
    blocks.push({
      kind: 'p',
      headingPath: headingStackToPath(headingStack, title),
      title,
      text: content
    });
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = String(lines[idx] || '');

    const prevLine = idx > 0 ? String(lines[idx - 1] || '') : '';
    const nextLine = idx < lines.length - 1 ? String(lines[idx + 1] || '') : '';
    const h = detectHeadingLine(line, { prevBlank: !prevLine.trim(), nextBlank: !nextLine.trim() });

    if (h && h.confidence >= 0.8) {
      flushPara();
      detectedHeadings += 1;

      let level = clampHeadingLevel(h.level);
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) level = lastHeadingLevel + 1;
      lastHeadingLevel = level;

      headingStack[level - 1] = String(h.text || '').trim();
      for (let i = level; i < 6; i += 1) headingStack[i] = '';
      continue;
    }

    if (!line.trim()) {
      flushPara();
      continue;
    }

    para.push(line);
  }
  flushPara();

  // Backward-compatible fallback: if we detected no headings, keep old behavior (split by blank lines).
  if (!detectedHeadings) {
    const parts = s.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    return parts.map((p) => ({
      kind: 'p',
      headingPath: [String(title || '').trim()].filter(Boolean),
      title,
      text: p
    }));
  }

  return blocks;
}

async function parseFileToChunks(localFilePath, { originalName, minChars = 300, maxChars = 1200, preserveParagraphs = true } = {}) {
  const ext = normalizeExt(originalName || localFilePath);
  const title = path.basename(String(originalName || localFilePath || 'document'));

  if (ext === 'docx') {
    return parseDocxToChunks(localFilePath, { minChars, maxChars, preserveParagraphs });
  }

  const raw = await fs.promises.readFile(localFilePath, 'utf8');
  const blocks = ext === 'md'
    ? parseMarkdownToBlocks(raw, { title })
    : parseTextToBlocks(raw, { title });

  const chunks = _internal.blocksToChunks(blocks, { minChars, maxChars, preserveParagraphs });
  const stat = await fs.promises.stat(localFilePath);
  const doc = {
    docId: '', // caller will override
    path: localFilePath,
    title,
    docType: 'other',
    lang: 'zh',
    mtimeMs: stat.mtimeMs,
    size: stat.size
  };
  return { doc, chunks, debug: {} };
}

function getKbIndexName() {
  return String(process.env.KB_ES_INDEX || 'kb_chunks_index').trim();
}

async function ensureKbIndex() {
  const client = getElasticsearchClient();
  const index = getKbIndexName();

  const existsResp = await client.indices.exists({ index });
  const exists = (typeof existsResp === 'boolean')
    ? existsResp
    : (existsResp && typeof existsResp === 'object' && Object.prototype.hasOwnProperty.call(existsResp, 'body'))
      ? !!existsResp.body
      : !!existsResp;
  if (exists) return;

  const analyzerIndex = String(process.env.KB_ES_ANALYZER_INDEX || 'ik_max_word').trim();
  const analyzerSearch = String(process.env.KB_ES_ANALYZER_SEARCH || 'ik_smart').trim();

  const createBody = (ai, as) => ({
    index,
    settings: {
      index: {
        number_of_shards: Number.parseInt(process.env.KB_ES_SHARDS || '1', 10) || 1,
        number_of_replicas: Number.parseInt(process.env.KB_ES_REPLICAS || '0', 10) || 0
      }
    },
    mappings: {
      properties: {
        // keep兼容字段（kbSearchService / smartSearchController 已使用）
        docId: { type: 'keyword' }, // 这里用 KB document id（字符串）
        path: { type: 'keyword' }, // oss_key
        title: {
          type: 'text',
          analyzer: ai,
          search_analyzer: as,
          fields: { keyword: { type: 'keyword', ignore_above: 256 } }
        },
        headingPath: {
          type: 'text',
          analyzer: ai,
          search_analyzer: as,
          fields: { keyword: { type: 'keyword', ignore_above: 512 } }
        },
        chunkNo: { type: 'integer' },
        content: { type: 'text', analyzer: ai, search_analyzer: as },
        mtimeMs: { type: 'long' },
        size: { type: 'long' },
        docType: { type: 'keyword' },
        lang: { type: 'keyword' },

        // KB 元数据（管理/权限/标签扩展）
        uploaderId: { type: 'integer' },
        uploadedAt: { type: 'date' },
        sha256: { type: 'keyword' }
      }
    }
  });

  try {
    await client.indices.create(createBody(analyzerIndex, analyzerSearch));
  } catch (e) {
    const type = String(e?.meta?.body?.error?.type || e?.name || '').toLowerCase();
    if (type.includes('resource_already_exists')) return;

    const reason = String(e?.meta?.body?.error?.reason || e?.message || '').toLowerCase();
    const isAnalyzerMissing = reason.includes('analyzer') && (reason.includes('not found') || reason.includes('unknown'));
    if (isAnalyzerMissing && (analyzerIndex.startsWith('ik_') || analyzerSearch.startsWith('ik_'))) {
      await client.indices.create(createBody('standard', 'standard'));
      return;
    }
    throw e;
  }
}

function makeEsChunkDoc({ docRow, chunkRow }) {
  // 从文件路径推断 docType（不再使用数据库 doc_type 字段）
  const filePath = docRow.oss_key || docRow.object_key || docRow.original_name || '';
  const docType = _internal.inferDocType(filePath);
  
  return {
    docId: String(docRow.id),
    path: docRow.oss_key || docRow.object_key || '',
    title: docRow.original_name || docRow.filename || '',
    headingPath: chunkRow.heading_path || '',
    chunkNo: chunkRow.chunk_no,
    content: chunkRow.content || '',
    mtimeMs: docRow.mtime_ms || null,
    size: docRow.size_bytes || null,
    docType,
    lang: docRow.lang || 'zh',
    uploaderId: docRow.uploader_id || null,
    uploadedAt: docRow.upload_time || docRow.created_at || null,
    sha256: docRow.sha256 || ''
  };
}

async function indexToElasticsearch({ docRow, chunkRows }) {
  const client = getElasticsearchClient();
  const index = getKbIndexName();
  await ensureKbIndex();

  await client.deleteByQuery({
    index,
    conflicts: 'proceed',
    refresh: false,
    query: { term: { docId: String(docRow.id) } }
  });

  const ops = [];
  for (const c of chunkRows) {
    ops.push({ index: { _index: index, _id: `${docRow.id}:${c.chunk_no}` } });
    ops.push(makeEsChunkDoc({ docRow, chunkRow: c }));
  }
  if (ops.length) {
    const resp = await client.bulk({ refresh: false, operations: ops });
    if (resp?.errors) {
      const items = Array.isArray(resp.items) ? resp.items : [];
      const firstErrors = items
        .map((it) => it?.index?.error || it?.create?.error || null)
        .filter(Boolean)
        .slice(0, 3);
      throw new Error(`bulk_index_errors: ${JSON.stringify(firstErrors)}`);
    }
  }
  await client.indices.refresh({ index });
}

async function downloadFromOssToTemp({ objectKey, tmpDir, filename }) {
  const client = await kbStorage.getOssClient();
  if (!client) throw new Error('OSS client not available (STORAGE != oss)');
  safeMkdir(tmpDir);
  const dest = path.join(tmpDir, filename);
  await client.get(objectKey, dest);
  return dest;
}

async function processKbIngestJob(job) {
  const docId = Number(job?.data?.docId);
  if (!Number.isFinite(docId) || docId <= 0) {
    throw new Error('docId is required');
  }

  const docRow = await KbDocument.findByPk(docId);
  if (!docRow) {
    return { ok: false, skipped: true, reason: 'doc_not_found', docId };
  }

  // Only handle expected statuses
  await docRow.update({ status: 'parsing', error_message: null });

  const tmpRoot = path.resolve(__dirname, '..', '..', 'uploads', 'kb-worker-tmp');
  const tmpDir = path.join(tmpRoot, String(docId));
  safeMkdir(tmpDir);

  let localPath = '';

  try {
    const originalName = docRow.original_name || docRow.filename || `kb-${docId}`;
    const ext = path.extname(String(originalName || '')) || '';
    const safeName = `doc_${docId}${ext || ''}`;

    if (docRow.storage === 'oss') {
      localPath = await downloadFromOssToTemp({
        objectKey: String(docRow.oss_key || ''),
        tmpDir,
        filename: safeName
      });
    } else {
      // local storage: object_key is relative inside LOCAL_DIR
      const fp = path.resolve(kbStorage.LOCAL_DIR, String(docRow.object_key || ''));
      localPath = fp;
    }

    // Parse + chunk
    const preserveParagraphs = String(process.env.KB_CHUNK_PRESERVE_PARAGRAPHS || 'true').toLowerCase() !== 'false';
    const parsed = await parseFileToChunks(localPath, {
      originalName,
      minChars: Number.parseInt(process.env.KB_CHUNK_MIN_CHARS || '300', 10) || 300,
      maxChars: Number.parseInt(process.env.KB_CHUNK_MAX_CHARS || '1200', 10) || 1200,
      preserveParagraphs
    });

    const chunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];

    // Replace chunks in PG
    await postgresqlSequelize.transaction(async (t) => {
      await KbChunk.destroy({ where: { doc_id: docId }, transaction: t });

      if (chunks.length) {
        await KbChunk.bulkCreate(
          chunks.map((c, idx) => ({
            doc_id: docId,
            chunk_no: idx + 1,
            heading_path: Array.isArray(c.headingPath) ? c.headingPath.filter(Boolean).join(' / ') : '',
            content: String(c.content || '').trim()
          })),
          { transaction: t }
        );
      }

      await docRow.update(
        { status: 'parsed', chunk_count: chunks.length, error_message: null },
        { transaction: t }
      );
    });

    // Fetch chunk rows for indexing
    const chunkRows = await KbChunk.findAll({ where: { doc_id: docId }, order: [['chunk_no', 'ASC']] });
    await indexToElasticsearch({ docRow: docRow.toJSON ? docRow.toJSON() : docRow, chunkRows: chunkRows.map((x) => (x.toJSON ? x.toJSON() : x)) });

    return { ok: true, docId, chunkCount: chunks.length };
  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg.toLowerCase().includes('unsupported') ? 'file_error' : 'parse_failed';
    try {
      await docRow.update({ status, error_message: msg });
    } catch (_) {}
    throw e;
  } finally {
    // cleanup tmp file
    if (localPath && localPath.startsWith(tmpDir)) safeUnlink(localPath);
  }
}

module.exports = {
  processKbIngestJob
};

