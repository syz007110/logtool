const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Op } = require('sequelize');

const { pingElasticsearch, getElasticsearchClient } = require('../config/elasticsearch');
const kbStorage = require('../config/kbStorage');
const { kbIngestQueue } = require('../config/queue');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');
const { indexDocxDir } = require('../services/kbIndexService');
const { searchSnippets, buildSnippetAnswerText } = require('../services/kbSearchService');
const KbDocument = require('../models/kb_document');
const KbChunk = require('../models/kb_chunk');
const KbFileType = require('../models/kb_file_type');
const KbDocumentFileType = require('../models/kb_document_file_type');

function normalizeLang(req) {
  const acceptLanguage = req.headers['accept-language'] || 'zh';
  return String(acceptLanguage).startsWith('en') ? 'en' : 'zh';
}

function safeUnlink(fp) {
  try {
    if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_) { }
}

function clampInt(n, min, max, fallback) {
  const v = Number.parseInt(n, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, min), max);
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

function decodeMaybeLatin1(name) {
  try {
    return Buffer.from(String(name || ''), 'latin1').toString('utf8');
  } catch (_) {
    return String(name || '');
  }
}

function getBearerToken(req) {
  const raw = req?.headers?.authorization || req?.get?.('authorization') || '';
  const parts = String(raw).split(' ');
  if (parts.length === 2 && /^bearer$/i.test(parts[0])) return parts[1];
  return '';
}

function withQueryToken(url, req) {
  const token = getBearerToken(req);
  if (!token) return url;
  if (!url || !String(url).includes('/api/oss/')) return url;
  if (String(url).includes('token=')) return url;
  const sep = String(url).includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

function safeFilename(name, fallback = 'file') {
  const base = path.basename(String(name || '').trim() || fallback);
  return base.replace(/[\r\n"]/g, '_');
}

// 统一的状态权限定义（前后端保持一致）
const KB_STATUS_PERMISSIONS = {
  // 可删除的状态：所有最终状态（成功或失败），不包括进行中的状态
  DELETABLE: new Set([
    'parsed',
    'parse_failed',
    'file_error',
    'processing_failed',
    'failed',
    'upload_failed',
    'queue_failed'
  ]),
  // 可重建的状态：所有最终状态（成功或失败），不包括进行中的状态
  REBUILDABLE: new Set([
    'parsed',
    'parse_failed',
    'file_error',
    'processing_failed',
    'failed',
    'upload_failed',
    'queue_failed'
  ]),
  // 可下载的状态：只有解析成功的文件可以下载
  DOWNLOADABLE: new Set(['parsed'])
};

function parseTypeIds(val) {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) {
    // if already an array, parse each element and merge
    const merged = val.flatMap((x) => parseTypeIds(x));
    return Array.from(new Set(merged)).filter((n) => Number.isFinite(n) && n > 0);
  }
  const raw = String(val).trim();
  if (!raw) return [];

  // JSON array: "[1,2]"
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return Array.from(new Set(arr.map((x) => Number.parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0)));
      }
    } catch (_) { }
  }

  // comma-separated: "1,2"
  if (raw.includes(',')) {
    return Array.from(new Set(raw.split(',').map((x) => Number.parseInt(String(x).trim(), 10)).filter((n) => Number.isFinite(n) && n > 0)));
  }

  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? [n] : [];
}

async function kbStatus(req, res) {
  const ping = await pingElasticsearch();
  const index = String(process.env.KB_ES_INDEX || 'kb_chunks_index').trim();
  
  let indexExists = false;
  let indexCount = null;
  let indexError = null;
  
  if (ping.ok) {
    try {
      const client = getElasticsearchClient();
      const existsResp = await client.indices.exists({ index });
      indexExists = (typeof existsResp === 'boolean')
        ? existsResp
        : (existsResp && typeof existsResp === 'object' && Object.prototype.hasOwnProperty.call(existsResp, 'body'))
          ? !!existsResp.body
          : !!existsResp;
      
      if (indexExists) {
        try {
          const countResp = await client.count({ index });
          indexCount = typeof countResp === 'object' && countResp.count !== undefined
            ? countResp.count
            : (countResp?.body?.count ?? null);
        } catch (e) {
          indexError = String(e?.message || e);
        }
      }
    } catch (e) {
      indexError = String(e?.message || e);
    }
  }
  
  return res.json({
    ok: true,
    elasticsearch: ping,
    kb: {
      index,
      indexExists,
      indexCount,
      indexError,
      storage: kbStorage.STORAGE,
      ossPrefix: kbStorage.OSS_PREFIX,
      maxFiles: kbStorage.MAX_FILES,
      maxFileSize: kbStorage.MAX_FILE_SIZE
    }
  });
}

async function kbSearch(req, res) {
  const q = String(req.query?.q || req.query?.query || '').trim();
  if (!q) return res.status(400).json({ ok: false, message: 'q 不能为空' });

  const lang = normalizeLang(req);
  const limit = clampInt(req.query?.limit, 1, 20, 5);

  const result = await searchSnippets(q, { lang, limit });
  const answerText = buildSnippetAnswerText(result.items);

  return res.json({
    ok: true,
    query: q,
    lang,
    limit,
    answerText,
    items: result.items,
    ...(req.query?.debug === '1' ? { debug: result.debug } : {})
  });
}

async function kbCreateIndex(req, res) {
  try {
    const { ensureKbIndex } = require('../services/kbIndexService');
    const result = await ensureKbIndex({ recreate: false });
    return res.json({
      ok: true,
      message: result.created ? '索引创建成功' : '索引已存在',
      index: result.index,
      created: result.created
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: '创建索引失败',
      error: String(e?.message || e)
    });
  }
}

async function kbReindex(req, res) {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const dir = String(body.dir || process.env.KB_DOCS_DIR || '').trim();
  if (!dir) return res.status(400).json({ ok: false, message: 'dir 不能为空（请传 body.dir 或配置 KB_DOCS_DIR）' });

  try {
    const st = await fs.promises.stat(dir);
    if (!st.isDirectory()) return res.status(400).json({ ok: false, message: 'dir 不是目录' });
  } catch (e) {
    return res.status(400).json({ ok: false, message: `dir 不可访问: ${String(e?.message || e)}` });
  }

  const recreateIndex = !!body.recreateIndex;
  const force = !!body.force;
  const minChars = clampInt(body.minChars, 50, 5000, 300);
  const maxChars = clampInt(body.maxChars, 200, 20000, 1200);
  const maxFiles = clampInt(body.maxFiles, 1, 200000, 5000);
  const preserveParagraphs = body.preserveParagraphs !== undefined
    ? !!body.preserveParagraphs
    : String(process.env.KB_CHUNK_PRESERVE_PARAGRAPHS || 'true').toLowerCase() !== 'false';

  const startedAt = Date.now();
  const summary = await indexDocxDir({ dir, recreateIndex, minChars, maxChars, maxFiles, force, preserveParagraphs });

  return res.json({
    ok: true,
    elapsedMs: Date.now() - startedAt,
    ...summary
  });
}

async function listKbDocuments(req, res) {
  try {
    const { page, limit } = normalizePagination(req.query?.page, req.query?.limit, MAX_PAGE_SIZE.STANDARD);
    const offset = (page - 1) * limit;

    const status = String(req.query?.status || '').trim();
    const uploadDate = String(req.query?.upload_date || '').trim(); // YYYY-MM-DD
    const fileType = String(req.query?.file_type || '').trim();

    const where = {};
    if (status) where.status = status;
    if (uploadDate) {
      const d = new Date(uploadDate);
      if (Number.isFinite(d.getTime())) {
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        where.upload_time = { [Op.between]: [start, end] };
      }
    }

    let queryOptions = {
      include: [{
        model: require('../models/kb_document_file_type'),
        as: 'fileTypes',
        attributes: ['file_type_id'],
        include: [{
          model: require('../models/kb_file_type'),
          as: 'fileType',
          attributes: ['id', 'name_zh', 'name_en', 'code']
        }]
      }],
      order: [['upload_time', 'DESC']],
      limit,
      offset
    };

    // 如果有文件类型筛选，需要特殊处理
    if (fileType) {
      const fileTypeId = parseInt(fileType, 10);
      if (Number.isFinite(fileTypeId)) {
        queryOptions.include[0].where = { file_type_id: fileTypeId };
        queryOptions.where = where;
      } else {
        queryOptions.where = where;
      }
    } else {
      queryOptions.where = where;
    }

    const { rows, count } = await KbDocument.findAndCountAll(queryOptions);

    const items = (rows || []).map((r) => {
      const d = r.toJSON ? r.toJSON() : r;
      let downloadUrl = '';

      if (d.storage === 'oss' && d.oss_key) {
        const key = String(d.oss_key).replace(/^\//, '');
        const baseUrl = `/api/oss/kb?key=${encodeURIComponent(key)}&download=1&filename=${encodeURIComponent(safeFilename(d.original_name || d.filename || 'kb-document'))}`;
        downloadUrl = withQueryToken(baseUrl, req);
      } else if (d.storage === 'local' && d.object_key) {
        // Local storage: use document ID-based download endpoint
        const baseUrl = `/api/kb/documents/${d.id}/download`;
        downloadUrl = baseUrl;
      }

      // 提取文件类型ID列表
      const fileTypes = (d.fileTypes || []).map(ft => ft.file_type_id).filter(id => id != null);

      return {
        id: d.id,
        original_name: d.original_name,
        uploader_id: d.uploader_id,
        fileTypes,
        upload_time: d.upload_time,
        status: d.status,
        chunk_count: d.chunk_count,
        error_message: d.error_message || null,
        storage: d.storage,
        oss_key: d.oss_key || null,
        sha256: d.sha256 || null,
        downloadUrl
      };
    });

    return res.json({ success: true, data: items, total: count, page, limit });
  } catch (e) {
    return res.status(500).json({ success: false, message: '获取知识库列表失败', error: String(e?.message || e) });
  }
}

async function uploadKbDocuments(req, res) {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, message: '未选择文件' });
    if (files.length > kbStorage.MAX_FILES) {
      files.forEach((f) => safeUnlink(f.path));
      return res.status(400).json({ success: false, message: `最多同时上传 ${kbStorage.MAX_FILES} 个文件` });
    }

    const uploaded = [];
    for (const file of files) {
      // 文件类型标签（支持每个文件单独传参；如果是批量同一请求，也尽量按 index 取值）
      const idx = uploaded.length;
      const rawTypeIds =
        (Array.isArray(req.body?.typeIds) ? req.body.typeIds[idx] : req.body?.typeIds) ??
        (Array.isArray(req.body?.type_ids) ? req.body.type_ids[idx] : req.body?.type_ids);
      const typeIds = parseTypeIds(rawTypeIds);

      if (typeIds.length) {
        const typeRows = await KbFileType.findAll({
          where: { id: { [Op.in]: typeIds }, enabled: true },
          attributes: ['id']
        });
        const okIds = new Set((typeRows || []).map((t) => t.id));
        const invalid = typeIds.filter((id) => !okIds.has(id));
        if (invalid.length) {
          safeUnlink(file.path);
          return res.status(400).json({ success: false, message: '文件类型无效或已停用', invalidTypeIds: invalid });
        }
      }

      // normalize filename encoding
      const originalName = decodeMaybeLatin1(file.originalname || '');
      const ext = path.extname(originalName).toLowerCase();
      const extNorm = ext === '.docx' ? 'docx' : (ext === '.md' || ext === '.markdown') ? 'md' : ext === '.txt' ? 'txt' : '';
      if (!extNorm) {
        safeUnlink(file.path);
        return res.status(400).json({ success: false, message: '文件类型不支持（仅支持 docx / md / txt）' });
      }

      const docRow = await KbDocument.create({
        original_name: originalName,
        filename: '',
        ext: extNorm,
        mime_type: file.mimetype || '',
        size_bytes: file.size,
        storage: kbStorage.STORAGE === 'oss' ? 'oss' : 'local',
        uploader_id: req.user?.id || null,
        upload_time: new Date(),
        status: 'uploading',
        chunk_count: 0,
        error_message: null,
        lang: normalizeLang(req)
      });

      // 写入文档-类型关联（多标签）
      if (typeIds.length) {
        try {
          await KbDocumentFileType.bulkCreate(
            typeIds.map((typeId) => ({ doc_id: docRow.id, file_type_id: typeId }))
          );
        } catch (_) {
          // 关联写入失败不阻断上传主流程
        }
      }

      try {
        const sha256 = await sha256File(file.path);

        if (kbStorage.STORAGE === 'oss') {
          const client = await kbStorage.getOssClient();
          if (!client) throw new Error('OSS client not available');

          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const safeBase = path.basename(originalName, ext).replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 80) || 'kb';
          const finalName = `${safeBase}-${unique}${ext}`;
          const objectKey = kbStorage.buildOssObjectKey(finalName);

          const result = await client.put(objectKey, file.path);
          const etag = String(result?.res?.headers?.etag || result?.etag || '').replace(/"/g, '') || null;

          await docRow.update({
            oss_key: objectKey,
            etag,
            sha256,
            status: 'queued'
          });
          safeUnlink(file.path);
        } else {
          // local storage: move into LOCAL_DIR
          kbStorage.ensureLocalDir();
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const safeBase = path.basename(originalName, ext).replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 80) || 'kb';
          const finalName = `${safeBase}-${unique}${ext}`;
          const dest = path.resolve(kbStorage.LOCAL_DIR, finalName);
          await fs.promises.rename(file.path, dest);
          await docRow.update({
            object_key: finalName,
            sha256,
            status: 'queued'
          });
        }

        // enqueue
        await kbIngestQueue.add('ingest-kb', { docId: docRow.id });

        uploaded.push({
          id: docRow.id,
          original_name: originalName,
          status: 'queued'
        });
      } catch (err) {
        safeUnlink(file.path);
        await docRow.update({ status: 'upload_failed', error_message: String(err?.message || err) });
        return res.status(500).json({ success: false, message: '上传失败', error: String(err?.message || err) });
      }
    }

    return res.json({ success: true, files: uploaded });
  } catch (e) {
    return res.status(500).json({ success: false, message: '上传失败', error: String(e?.message || e) });
  }
}

async function listKbFileTypes(req, res) {
  try {
    const { page, limit, search } = req.query;
    const where = {};

    // 搜索条件
    if (search) {
      where[Op.or] = [
        { code: { [Op.like]: `%${search}%` } },
        { name_zh: { [Op.like]: `%${search}%` } },
        { name_en: { [Op.like]: `%${search}%` } }
      ];
    }

    const queryOptions = {
      where,
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    };

    // 分页支持：如果传了 page 和 limit，则分页；否则返回所有数据
    if (page && limit) {
      const { page: pageNum, limit: limitNum } = normalizePagination(page, limit, MAX_PAGE_SIZE.STANDARD);
      queryOptions.limit = limitNum;
      queryOptions.offset = (pageNum - 1) * limitNum;
      const { count, rows } = await KbFileType.findAndCountAll(queryOptions);
      return res.json({
        success: true,
        data: (rows || []).map((r) => (r.toJSON ? r.toJSON() : r)),
        total: count
      });
    } else {
      // 未传分页参数：返回所有启用的类型（用于下拉选择等场景）
      where.enabled = true;
      const rows = await KbFileType.findAll({ where, order: [['sort_order', 'ASC'], ['id', 'ASC']] });
      return res.json({
        success: true,
        data: (rows || []).map((r) => (r.toJSON ? r.toJSON() : r)),
        total: rows.length
      });
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: '获取文件类型失败', error: String(e?.message || e) });
  }
}

async function createKbFileType(req, res) {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const code = String(body.code || '').trim();
    const nameZh = String(body.name_zh || body.nameZh || '').trim();
    const nameEn = String(body.name_en || body.nameEn || '').trim();
    const sortOrder = Number.parseInt(body.sort_order ?? body.sortOrder ?? 0, 10);
    const enabled = body.enabled !== undefined ? !!body.enabled : body.is_active !== undefined ? !!body.is_active : true;

    if (!code) return res.status(400).json({ success: false, message: 'code 不能为空' });
    if (!/^[A-Za-z0-9_-]+$/.test(code)) return res.status(400).json({ success: false, message: 'code 格式不正确' });
    if (!nameZh) return res.status(400).json({ success: false, message: 'name_zh 不能为空' });
    if (!nameEn) return res.status(400).json({ success: false, message: 'name_en 不能为空' });

    const row = await KbFileType.create({
      code,
      name_zh: nameZh,
      name_en: nameEn,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      enabled
    });

    return res.json({ success: true, data: row.toJSON ? row.toJSON() : row });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes('unique') || msg.includes('Unique') || msg.includes('duplicate')) {
      return res.status(409).json({ success: false, message: 'code 已存在' });
    }
    return res.status(500).json({ success: false, message: '创建文件类型失败', error: msg });
  }
}

async function updateKbFileType(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'id 无效' });

  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const nameZh = body.name_zh !== undefined || body.nameZh !== undefined
      ? String((body.name_zh ?? body.nameZh) || '').trim()
      : undefined;
    const nameEn = body.name_en !== undefined || body.nameEn !== undefined
      ? String((body.name_en ?? body.nameEn) || '').trim()
      : undefined;
    const sortOrder = body.sort_order !== undefined || body.sortOrder !== undefined
      ? Number.parseInt(body.sort_order ?? body.sortOrder, 10)
      : undefined;
    const enabled = body.enabled !== undefined ? !!body.enabled : body.is_active !== undefined ? !!body.is_active : undefined;

    const row = await KbFileType.findByPk(id);
    if (!row) return res.status(404).json({ success: false, message: '文件类型不存在' });

    const patch = {};
    if (nameZh !== undefined) {
      if (!nameZh) return res.status(400).json({ success: false, message: 'name_zh 不能为空' });
      patch.name_zh = nameZh;
    }
    if (nameEn !== undefined) {
      if (!nameEn) return res.status(400).json({ success: false, message: 'name_en 不能为空' });
      patch.name_en = nameEn;
    }
    if (sortOrder !== undefined) patch.sort_order = Number.isFinite(sortOrder) ? sortOrder : 0;
    if (enabled !== undefined) patch.enabled = enabled;

    await row.update(patch);
    return res.json({ success: true, data: row.toJSON ? row.toJSON() : row });
  } catch (e) {
    return res.status(500).json({ success: false, message: '更新文件类型失败', error: String(e?.message || e) });
  }
}

async function deleteKbFileType(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'id 无效' });

  try {
    const row = await KbFileType.findByPk(id);
    if (!row) return res.status(404).json({ success: false, message: '文件类型不存在' });

    const used = await KbDocumentFileType.count({ where: { file_type_id: id } });
    if (used > 0) {
      return res.status(400).json({ success: false, message: '该类型已被使用，无法删除' });
    }

    await row.destroy();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: '删除文件类型失败', error: String(e?.message || e) });
  }
}

async function deleteKbDocument(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'id 无效' });

  const doc = await KbDocument.findByPk(id);
  if (!doc) return res.status(404).json({ success: false, message: '文件不存在' });

  const status = String(doc.status || '');
  if (!KB_STATUS_PERMISSIONS.DELETABLE.has(status)) {
    return res.status(400).json({ success: false, message: `当前状态不可删除: ${status}` });
  }

  try {
    await doc.update({ status: 'deleting' });
  } catch (_) { }

  // 1) ES delete (best-effort)
  try {
    const client = getElasticsearchClient();
    const index = String(process.env.KB_ES_INDEX || 'kb_chunks_index').trim();
    await client.deleteByQuery({
      index,
      conflicts: 'proceed',
      refresh: false,
      query: { term: { docId: String(id) } }
    });
  } catch (_) { }

  // 2) PG delete chunks + doc
  try {
    await KbChunk.destroy({ where: { doc_id: id } });
  } catch (_) { }

  // 3) delete object from storage (best-effort)
  try {
    if (doc.storage === 'oss' && doc.oss_key) {
      const client = await kbStorage.getOssClient();
      if (client) await client.delete(String(doc.oss_key).replace(/^\//, ''));
    } else if (doc.storage === 'local' && doc.object_key) {
      const fp = path.resolve(kbStorage.LOCAL_DIR, String(doc.object_key));
      safeUnlink(fp);
    }
  } catch (_) { }

  try {
    await doc.destroy();
  } catch (e) {
    return res.status(500).json({ success: false, message: '删除失败', error: String(e?.message || e) });
  }

  return res.json({ success: true });
}

async function downloadKbDocument(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'id 无效' });
  }

  const doc = await KbDocument.findByPk(id);
  if (!doc) {
    return res.status(404).json({ success: false, message: '文件不存在' });
  }

  // 检查状态：只有解析成功的文件可以下载
  const status = String(doc.status || '');
  if (!KB_STATUS_PERMISSIONS.DOWNLOADABLE.has(status)) {
    return res.status(400).json({ success: false, message: `当前状态不可下载: ${status}` });
  }

  const d = doc.toJSON ? doc.toJSON() : doc;
  let filePath = '';
  let filename = safeFilename(d.original_name || d.filename || `kb-document-${id}`);

  try {
    if (d.storage === 'oss' && d.oss_key) {
      // OSS storage: redirect to OSS proxy endpoint (handles token automatically)
      const key = String(d.oss_key).replace(/^\//, '');
      const redirectUrl = `/api/oss/kb?key=${encodeURIComponent(key)}&download=1&filename=${encodeURIComponent(filename)}`;
      return res.redirect(withQueryToken(redirectUrl, req));
    } else if (d.storage === 'local' && d.object_key) {
      // Local storage: stream file directly
      filePath = path.resolve(kbStorage.LOCAL_DIR, String(d.object_key));

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: '文件不存在' });
      }

      const stats = fs.statSync(filePath);
      const ext = path.extname(filename) || path.extname(String(d.original_name || '')) || '';
      if (!filename.endsWith(ext)) {
        filename += ext;
      }

      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Content-Type', d.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', stats.size);

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: '文件读取失败', error: String(err?.message || err) });
        }
      });
      return;
    } else {
      return res.status(400).json({ success: false, message: '文件存储信息不完整' });
    }
  } catch (e) {
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: '下载失败', error: String(e?.message || e) });
    }
  }
}

async function rebuildKbDocument(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ success: false, message: 'id 无效' });

  const doc = await KbDocument.findByPk(id);
  if (!doc) return res.status(404).json({ success: false, message: '文件不存在' });

  const status = String(doc.status || '');
  if (!KB_STATUS_PERMISSIONS.REBUILDABLE.has(status)) {
    return res.status(400).json({ success: false, message: `当前状态不可更新索引: ${status}` });
  }

  try {
    await doc.update({ status: 'queued', error_message: null, chunk_count: 0 });
  } catch (_) { }

  try {
    await kbIngestQueue.add('ingest-kb', { docId: id });
  } catch (e) {
    return res.status(500).json({ success: false, message: '更新索引失败', error: String(e?.message || e) });
  }

  return res.json({ success: true, id, status: 'queued' });
}

async function getChunkContent(req, res) {
  const docId = Number(req.params?.docId);
  const chunkNo = Number(req.params?.chunkNo);

  if (!Number.isFinite(docId) || docId <= 0) {
    return res.status(400).json({ ok: false, message: 'docId 无效' });
  }
  if (!Number.isFinite(chunkNo) || chunkNo <= 0) {
    return res.status(400).json({ ok: false, message: 'chunkNo 无效' });
  }

  try {
    const chunk = await KbChunk.findOne({
      where: { doc_id: docId, chunk_no: chunkNo }
    });

    if (!chunk) {
      return res.status(404).json({ ok: false, message: 'Chunk 不存在' });
    }

    const content = String(chunk.content || '').trim();
    if (!content) {
      return res.status(404).json({ ok: false, message: 'Chunk 内容为空' });
    }

    // 限制内容长度：最多 1200 字符
    const maxLength = 1200;
    const truncated = content.length > maxLength ? content.slice(0, maxLength) + '...' : content;
    const isTruncated = content.length > maxLength;

    return res.json({
      ok: true,
      data: {
        docId,
        chunkNo,
        headingPath: chunk.heading_path || '',
        content: truncated,
        isTruncated,
        fullLength: content.length
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: '获取 Chunk 内容失败', error: String(e?.message || e) });
  }
}

module.exports = {
  kbStatus,
  kbSearch,
  kbCreateIndex,
  kbReindex,
  listKbDocuments,
  uploadKbDocuments,
  deleteKbDocument,
  downloadKbDocument,
  rebuildKbDocument,
  getChunkContent,
  listKbFileTypes,
  createKbFileType,
  updateKbFileType,
  deleteKbFileType
};

