const fs = require('fs');
const path = require('path');

const { getElasticsearchClient } = require('../config/elasticsearch');
const { parseDocxToChunks } = require('./kbDocxIngestService');

function getKbIndexName() {
  return String(process.env.KB_ES_INDEX || 'kb_chunks_index').trim();
}

function getAnalyzerIndex() {
  return String(process.env.KB_ES_ANALYZER_INDEX || 'ik_max_word').trim();
}

function getAnalyzerSearch() {
  return String(process.env.KB_ES_ANALYZER_SEARCH || 'ik_smart').trim();
}

function backendRoot() {
  // backend/src/services -> backend/
  return path.resolve(__dirname, '..', '..');
}

function getManifestPath() {
  return path.join(backendRoot(), 'storage', 'kb', 'manifest.json');
}

async function readManifest() {
  const fp = getManifestPath();
  try {
    const raw = await fs.promises.readFile(fp, 'utf8');
    const json = JSON.parse(raw);
    if (json && typeof json === 'object' && json.files && typeof json.files === 'object') return json;
    return { version: 1, updatedAt: null, files: {} };
  } catch (_) {
    return { version: 1, updatedAt: null, files: {} };
  }
}

async function writeManifest(manifest) {
  const fp = getManifestPath();
  await fs.promises.mkdir(path.dirname(fp), { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    files: manifest?.files && typeof manifest.files === 'object' ? manifest.files : {}
  };
  await fs.promises.writeFile(fp, JSON.stringify(payload, null, 2), 'utf8');
}

async function ensureKbIndex({ recreate = false } = {}) {
  const client = getElasticsearchClient();
  const index = getKbIndexName();
  const existsResp = await client.indices.exists({ index });
  const exists = (typeof existsResp === 'boolean')
    ? existsResp
    : (existsResp && typeof existsResp === 'object' && Object.prototype.hasOwnProperty.call(existsResp, 'body'))
      ? !!existsResp.body
      : !!existsResp;

  if (recreate && exists) {
    await client.indices.delete({ index });
  }

  const existsAfter = recreate ? false : exists;
  if (existsAfter) return { ok: true, created: false, index };

  const analyzerIndex = getAnalyzerIndex();
  const analyzerSearch = getAnalyzerSearch();

  try {
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
          docId: { type: 'keyword' },
          path: { type: 'keyword' },
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
          content: {
            type: 'text',
            analyzer: ai,
            search_analyzer: as
          },
          mtimeMs: { type: 'long' },
          size: { type: 'long' },
          docType: { type: 'keyword' },
          lang: { type: 'keyword' }
        }
      }
    });

    await client.indices.create({
      ...createBody(analyzerIndex, analyzerSearch)
    });
  } catch (e) {
    // Race-safe: ignore "already exists" errors.
    const type = String(e?.meta?.body?.error?.type || e?.name || '').toLowerCase();
    if (type.includes('resource_already_exists')) {
      // ok
    } else {
      // If IK isn't installed yet, fallback to standard analyzers for v1 usability.
      const reason = String(e?.meta?.body?.error?.reason || e?.message || '').toLowerCase();
      const isAnalyzerMissing = reason.includes('analyzer') && (reason.includes('not found') || reason.includes('unknown'));
      if (isAnalyzerMissing && (analyzerIndex.startsWith('ik_') || analyzerSearch.startsWith('ik_'))) {
        await client.indices.create({ ...createBody('standard', 'standard') });
      } else {
        throw e;
      }
    }
  }

  return { ok: true, created: true, index };
}

async function scanDocxFiles(dir, { maxFiles = 5000 } = {}) {
  const root = String(dir || '').trim();
  if (!root) throw new Error('dir is required');

  const out = [];

  async function walk(current) {
    if (out.length >= maxFiles) return;
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const ent of entries) {
      if (out.length >= maxFiles) break;
      const name = ent.name;
      if (!name) continue;
      // skip temp Office files
      if (name.startsWith('~$')) continue;

      const full = path.join(current, name);
      if (ent.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      if (/\.docx$/i.test(name)) out.push(full);
    }
  }

  await walk(root);
  return out;
}

function makeChunkDoc({ doc, chunk, chunkNo }) {
  const hp = Array.isArray(chunk.headingPath) ? chunk.headingPath : [];
  const headingPathText = hp.filter(Boolean).join(' / ');
  return {
    docId: doc.docId,
    path: doc.path,
    title: doc.title,
    headingPath: headingPathText,
    chunkNo,
    content: chunk.content,
    mtimeMs: doc.mtimeMs,
    size: doc.size,
    docType: doc.docType,
    lang: doc.lang
  };
}

async function indexDocxDir({
  dir,
  recreateIndex = false,
  minChars = 300,
  maxChars = 1200,
  maxFiles = 5000,
  force = false,
  preserveParagraphs = true
} = {}) {
  const client = getElasticsearchClient();
  const index = getKbIndexName();

  await ensureKbIndex({ recreate: !!recreateIndex });

  const manifest = await readManifest();
  const files = await scanDocxFiles(dir, { maxFiles });

  const summary = {
    ok: true,
    index,
    dir,
    scanned: files.length,
    skipped: 0,
    indexedFiles: 0,
    indexedChunks: 0,
    failedFiles: 0,
    failures: []
  };

  for (const fp of files) {
    let stat = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      stat = await fs.promises.stat(fp);
      const prev = manifest.files?.[fp];
      if (!force && prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
        summary.skipped += 1;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const parsed = await parseDocxToChunks(fp, { minChars, maxChars, preserveParagraphs });
      const doc = parsed.doc;
      const chunks = Array.isArray(parsed.chunks) ? parsed.chunks : [];

      // Delete existing doc chunks first (best-effort) when updating
      // eslint-disable-next-line no-await-in-loop
      await client.deleteByQuery({
        index,
        conflicts: 'proceed',
        refresh: false,
        query: { term: { docId: doc.docId } }
      });

      const ops = [];
      for (let i = 0; i < chunks.length; i += 1) {
        const c = chunks[i];
        ops.push({ index: { _index: index, _id: `${doc.docId}:${i + 1}` } });
        ops.push(makeChunkDoc({ doc, chunk: c, chunkNo: i + 1 }));
      }

      if (ops.length) {
        // eslint-disable-next-line no-await-in-loop
        const resp = await client.bulk({ refresh: false, operations: ops });
        if (resp?.errors) {
          // Collect up to 3 item errors for debugging
          const items = Array.isArray(resp.items) ? resp.items : [];
          const firstErrors = items
            .map((it) => it?.index?.error || it?.create?.error || null)
            .filter(Boolean)
            .slice(0, 3);
          throw new Error(`bulk_index_errors: ${JSON.stringify(firstErrors)}`);
        }
      }

      manifest.files[fp] = {
        docId: doc.docId,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        indexedAt: new Date().toISOString(),
        chunkCount: chunks.length
      };

      summary.indexedFiles += 1;
      summary.indexedChunks += chunks.length;
    } catch (e) {
      summary.failedFiles += 1;
      summary.failures.push({ path: fp, message: String(e?.message || e) });
      // continue indexing other files
    }
  }

  await writeManifest(manifest);
  await client.indices.refresh({ index });

  return summary;
}

module.exports = {
  ensureKbIndex,
  indexDocxDir,
  scanDocxFiles
};

