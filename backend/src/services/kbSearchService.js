const { getElasticsearchClient } = require('../config/elasticsearch');
const { ensureKbIndex } = require('./kbIndexService');

function getKbIndexName() {
  return String(process.env.KB_ES_INDEX || 'kb_chunks_index').trim();
}

function clampInt(n, min, max, fallback) {
  const v = Number.parseInt(n, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
}

function normalizeLang(lang) {
  const s = String(lang || '').trim().toLowerCase();
  return s.startsWith('en') ? 'en' : 'zh';
}

function buildSnippet(hit) {
  const hl = hit?.highlight?.content;
  if (Array.isArray(hl) && hl.length) {
    // 返回所有高亮片段（数组形式），用于前端折叠/展开
    return hl.map(f => String(f || '').trim()).filter(Boolean);
  }
  const content = String(hit?._source?.content || '').trim();
  if (!content) return [];
  // 没有高亮时，返回单个片段（数组形式，保持一致性）
  const snippet = content.length > 220 ? `${content.slice(0, 220)}...` : content;
  return [snippet];
}

async function searchSnippets(query, { lang = 'zh', limit = 5 } = {}) {
  const q = String(query || '').trim();
  if (!q) return { ok: true, items: [], debug: { skipped: true, reason: 'empty_query' } };

  const safeLimit = clampInt(limit, 1, 20, 5);
  const targetLang = normalizeLang(lang);

  const client = getElasticsearchClient();
  const index = getKbIndexName();

  // Ensure index exists (no-op if already created)
  await ensureKbIndex({ recreate: false });

  const resp = await client.search({
    index,
    size: safeLimit,
    track_total_hits: true,
    _source: ['docId', 'path', 'title', 'headingPath', 'chunkNo', 'mtimeMs', 'docType', 'lang', 'content'],
    query: {
      bool: {
        must: [
          {
            multi_match: {
              query: q,
              type: 'best_fields',
              fields: ['title^4', 'headingPath^2', 'content'],
              operator: 'or'
            }
          }
        ],
        filter: [{ term: { lang: targetLang } }]
      }
    },
    highlight: {
      pre_tags: ['<em>'],
      post_tags: ['</em>'],
      fields: {
        content: {
          fragment_size: 180,
          number_of_fragments: 3,
          no_match_size: 0
        }
      },
      require_field_match: false
    }
  });

  const hits = Array.isArray(resp?.hits?.hits) ? resp.hits.hits : [];
  const items = hits.map((h, idx) => {
    const snippets = buildSnippet(h);
    return {
      ref: `D${idx + 1}`,
      score: h?._score ?? null,
      docId: h?._source?.docId || '',
      title: h?._source?.title || '',
      path: h?._source?.path || '',
      headingPath: h?._source?.headingPath || '',
      chunkNo: h?._source?.chunkNo || null,
      docType: h?._source?.docType || '',
      mtimeMs: h?._source?.mtimeMs ?? null,
      snippets, // 数组形式：所有高亮片段
      snippet: snippets.length > 0 ? snippets[0] : '' // 向后兼容：第一个片段作为 snippet
    };
  }).filter((x) => x.snippets && x.snippets.length > 0);

  return {
    ok: true,
    items,
    debug: {
      index,
      lang: targetLang,
      total: resp?.hits?.total?.value ?? items.length
    }
  };
}

function buildSnippetAnswerText(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '';
  const lines = [];
  lines.push('知识库检索到的相关片段（原文引用，不推断）：');
  for (const it of list) {
    const loc = [it.title, it.headingPath].filter(Boolean).join(' · ');
    lines.push(`- [${it.ref}] ${loc}`);
    // 合并所有片段，用 "..." 分隔
    const snippets = Array.isArray(it.snippets) ? it.snippets : (it.snippet ? [it.snippet] : []);
    const merged = snippets.filter(Boolean).join(' ... ');
    lines.push(`  ${merged.trim()}`);
  }
  return lines.join('\n').trim();
}

module.exports = {
  searchSnippets,
  buildSnippetAnswerText
};

