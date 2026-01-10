const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const authz = require('../middlewares/permission');
const { connectMongo, isMongoConnected } = require('../config/mongodb');
const { translateText } = require('../services/translationService');

const FaultCase = require('../mongoModels/FaultCase');
const FaultCaseI18n = require('../mongoModels/FaultCaseI18n');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

const ErrorCode = require('../models/error_code');
const Permission = require('../models/permission');
const { objectKeyFromUrl } = require('../utils/oss');

const {
  STORAGE,
  LOCAL_DIR,
  TMP_DIR,
  MAX_FILES,
  MAX_FILE_SIZE,
  ALLOWED_MIMES,
  TMP_PREFIX,
  ensureTempDir,
  ensureLocalDir,
  buildTempLocalUrl,
  buildLocalUrl,
  getOssClient,
  buildOssUrl,
  buildOssObjectKey,
  buildTempOssObjectKey
} = require('../config/faultCaseStorage');

const USE_BACKEND_OSS_PROXY = String(process.env.FAULT_CASE_OSS_USE_PROXY || process.env.OSS_USE_BACKEND_PROXY || '').toLowerCase() === 'true';

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

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function normalizeFaultCaseAttachmentsForResponse(faultCaseObj, req) {
  if (!USE_BACKEND_OSS_PROXY) return faultCaseObj;
  if (!faultCaseObj || !Array.isArray(faultCaseObj.attachments)) return faultCaseObj;

  const attachments = faultCaseObj.attachments.map((a) => {
    if (!a) return a;
    const storage = a.storage === 'oss' ? 'oss' : 'local';
    if (storage !== 'oss') return a;

    // Prefer object_key; fallback to parsing from url (historical internal URLs)
    const key = String(a.object_key || objectKeyFromUrl(a.url) || '').replace(/^\//, '');
    if (!key) return a;

    // buildOssUrl will return proxy url when USE_BACKEND_OSS_PROXY is enabled
    return { ...a, url: withQueryToken(buildOssUrl(key), req) };
  });

  return { ...faultCaseObj, attachments };
}

function normalizeLang(raw) {
  const s = (raw || '').toString();
  if (!s) return 'zh';
  if (s.startsWith('en')) return 'en';
  if (s.startsWith('zh')) return 'zh';
  return s.split('-')[0];
}

function parseKeywords(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
  // support comma/space separated
  return String(val)
    .split(/[,，\n\r\t ]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
}

function effectiveUpdatedAt(doc) {
  return doc?.updatedAt || doc?.createdAt || new Date(0);
}

async function ensureMongoReady() {
  await connectMongo();
  return isMongoConnected();
}

async function canReadCase(req, faultCase) {
  if (!faultCase) return false;
  // 数据库中的记录都是已发布状态，所有用户都可以查看
  return true;
}

async function canEditCase(req, faultCase) {
  if (!faultCase) return false;
  if (req.user && faultCase.created_by === req.user.id) return true;
  return false;
}

async function overlayI18nIfNeeded(req, faultCaseObj) {
  const accept = req.headers['accept-language'] || req.query.lang || 'zh';
  const lang = normalizeLang(accept);
  if (!faultCaseObj || lang === 'zh') return faultCaseObj;

  const i18n = await FaultCaseI18n.findOne({ fault_case_id: faultCaseObj._id, lang });
  if (!i18n) return faultCaseObj;

  const overlay = (k) => (typeof i18n[k] === 'string' && i18n[k].trim() !== '' ? i18n[k] : faultCaseObj[k]);
  const merged = {
    ...faultCaseObj,
    title: overlay('title'),
    symptom: overlay('symptom'),
    possible_causes: overlay('possible_causes'),
    solution: overlay('solution'),
    remark: overlay('remark'),
    keywords: Array.isArray(i18n.keywords) && i18n.keywords.length ? i18n.keywords : faultCaseObj.keywords
  };
  return merged;
}

async function validateRelatedErrorCodes(ids = []) {
  const uniqueIds = Array.from(new Set((ids || []).map(n => Number(n)).filter(n => Number.isFinite(n))));
  if (uniqueIds.length === 0) return [];
  const found = await ErrorCode.findAll({ where: { id: uniqueIds }, attributes: ['id'] });
  const foundIds = new Set(found.map(x => x.id));
  const missing = uniqueIds.filter(x => !foundIds.has(x));
  if (missing.length) {
    const err = new Error(`存在未知故障码ID: ${missing.join(', ')}`);
    err.code = 'ERROR_CODE_NOT_FOUND';
    throw err;
  }
  return uniqueIds;
}

// ----- Attachments -----
async function uploadFaultCaseAttachments(req, res) {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: req.t('shared.validationFailed'), error: 'NO_FILE' });
    if (files.length > MAX_FILES) {
      files.forEach((f) => safeUnlink(f.path));
      return res.status(400).json({ message: `最多上传 ${MAX_FILES} 个附件` });
    }

    const uploaded = [];
    for (const file of files) {
      if (file && file.originalname) {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
      }

      if (ALLOWED_MIMES.length && !ALLOWED_MIMES.includes(file.mimetype)) {
        safeUnlink(file.path);
        return res.status(400).json({ message: '文件类型不支持', error: 'UNSUPPORTED_FILE_TYPE' });
      }

      let url = '';
      let objectKey = '';
      const storage = STORAGE === 'oss' ? 'oss' : 'local';

      if (STORAGE === 'oss') {
        try {
          const client = await getOssClient();
          objectKey = buildTempOssObjectKey(path.basename(file.filename || file.originalname || 'file'));
          const result = await client.put(objectKey, file.path);
          url = withQueryToken(buildOssUrl(objectKey, result?.url), req);
          safeUnlink(file.path);
        } catch (err) {
          console.error('上传OSS失败:', err.message);
          safeUnlink(file.path);
          return res.status(500).json({ message: '上传失败，请稍后重试', error: err.message });
        }
      } else {
        ensureTempDir();
        const filename = path.basename(file.path);
        url = buildTempLocalUrl(filename);
        objectKey = `tmp/${filename}`;
      }

      uploaded.push({
        url,
        storage,
        filename: file.filename || objectKey,
        original_name: file.originalname,
        object_key: objectKey,
        size_bytes: file.size,
        mime_type: file.mimetype
      });
    }

    return res.json({ success: true, files: uploaded });
  } catch (err) {
    console.error('上传故障案例附件失败:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
}

async function finalizeAttachment(asset, req) {
  const result = { ...asset };

  // local: move tmp -> permanent
  if (result.storage === 'local') {
    ensureLocalDir();
    const isTemp = (result.object_key && result.object_key.startsWith('tmp/')) || (result.url && result.url.includes('/fault-cases/tmp/'));
    if (isTemp) {
      const filename = path.basename(result.object_key || result.url);
      const src = path.resolve(TMP_DIR, filename);
      const dest = path.resolve(LOCAL_DIR, filename);
      try {
        fs.renameSync(src, dest);
        result.object_key = filename;
        result.url = buildLocalUrl(filename);
      } catch (e) {
        console.warn('移动临时文件失败:', e.message);
        throw new Error('保存附件失败（本地文件移动失败）');
      }
    }
    return result;
  }

  // oss: copy tmp -> permanent
  if (result.storage === 'oss' && result.object_key && result.object_key.includes('/tmp/')) {
    const client = await getOssClient();
    const destKey = result.object_key.replace('/tmp/', '/');
    try {
      await client.copy(destKey, result.object_key);
      await client.delete(result.object_key);
      result.object_key = destKey;
      result.url = withQueryToken(buildOssUrl(destKey), req);
    } catch (e) {
      console.warn('OSS 复制/删除临时文件失败:', e.message);
      throw new Error('保存附件失败（OSS 文件搬运失败）');
    }
  } else if (result.storage === 'oss' && result.object_key && result.object_key.startsWith(TMP_PREFIX)) {
    // safety: in case TMP_PREFIX doesn't contain /tmp/ exactly
    const client = await getOssClient();
    const destKey = buildOssObjectKey(path.basename(result.object_key));
    try {
      await client.copy(destKey, result.object_key);
      await client.delete(result.object_key);
      result.object_key = destKey;
      result.url = withQueryToken(buildOssUrl(destKey), req);
    } catch (e) {
      console.warn('OSS 复制/删除临时文件失败:', e.message);
      throw new Error('保存附件失败（OSS 文件搬运失败）');
    }
  }
  return result;
}

function normalizeAttachmentsPayload(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      if (!x.url || !x.storage) return null;
      return {
        url: String(x.url),
        storage: x.storage === 'oss' ? 'oss' : 'local',
        filename: x.filename ? String(x.filename) : '',
        original_name: x.original_name ? String(x.original_name) : '',
        object_key: x.object_key ? String(x.object_key) : '',
        mime_type: x.mime_type ? String(x.mime_type) : '',
        size_bytes: Number.isFinite(Number(x.size_bytes)) ? Number(x.size_bytes) : undefined
      };
    })
    .filter(Boolean)
    .slice(0, MAX_FILES);
}

// ----- CRUD / Search -----
const createFaultCase = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }

    const {
      source = 'manual',
      jira_key = '',
      module = '',
      title,
      symptom = '',
      possible_causes = '',
      solution = '',
      remark = '',
      equipment_model = '',
      keywords,
      related_error_code_ids = [],
      attachments = [],
      status = ''
    } = req.body || {};

    if (!title || !String(title).trim()) return res.status(400).json({ message: 'title 不能为空' });

    // 验证附件数量（上限10个）
    if (attachments && attachments.length > 10) {
      return res.status(400).json({ message: '附件数量不能超过10个' });
    }

    const src = source === 'jira' ? 'jira' : 'manual';
    const jiraKey = String(jira_key || '').trim();
    if (src === 'jira') {
      if (!jiraKey) return res.status(400).json({ message: 'jira_key 不能为空（source=jira）' });
      const existed = await FaultCase.findOne({ jira_key: jiraKey }).select('_id').lean();
      if (existed?._id) {
        return res.status(409).json({ message: `该 Jira 已添加为故障案例: ${jiraKey}`, existingId: String(existed._id) });
      }
    }

    const relatedIds = await validateRelatedErrorCodes(related_error_code_ids);
    const normalizedAttachments = normalizeAttachmentsPayload(attachments);
    const finalized = [];
    for (const a of normalizedAttachments) finalized.push(await finalizeAttachment(a, req));

    const faultCase = await FaultCase.create({
      source: src,
      ...(jiraKey ? { jira_key: jiraKey } : {}),
      module: String(module || '').trim(),
      title: String(title).trim(),
      symptom,
      possible_causes,
      solution,
      remark,
      equipment_model: Array.isArray(equipment_model) ? equipment_model.filter(m => m && String(m).trim()).map(m => String(m).trim()) : (equipment_model ? [String(equipment_model).trim()] : []),
      keywords: parseKeywords(keywords),
      related_error_code_ids: relatedIds,
      attachments: finalized,
      status: String(status || '').trim(), // 工作流状态，对应 fault_case_statuses 表的 status_key
      created_by: req.user.id,
      updated_by: req.user.id
    });

    return res.status(201).json({ message: req.t('shared.created'), faultCase });
  } catch (err) {
    console.error('createFaultCase error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const updateFaultCase = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }

    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'invalid id' });

    const faultCase = await FaultCase.findById(id);
    if (!faultCase) return res.status(404).json({ message: req.t('shared.notFound') });
    if (!(await canEditCase(req, faultCase))) return res.status(403).json({ message: '权限不足' });

    const {
      source,
      jira_key,
      module,
      title,
      symptom,
      possible_causes,
      solution,
      remark,
      equipment_model,
      keywords,
      related_error_code_ids,
      attachments,
      status
    } = req.body || {};

    if (title !== undefined && !String(title).trim()) return res.status(400).json({ message: 'title 不能为空' });

    // 验证附件数量（上限10个）
    if (attachments !== undefined && attachments.length > 10) {
      return res.status(400).json({ message: '附件数量不能超过10个' });
    }

    const patch = {};
    const unset = {};
    if (source !== undefined) patch.source = source === 'jira' ? 'jira' : 'manual';
    if (jira_key !== undefined) {
      const v = String(jira_key || '').trim();
      if (!v) unset.jira_key = 1;
      else patch.jira_key = v;
    }
    if (module !== undefined) patch.module = String(module || '').trim();
    if (title !== undefined) patch.title = String(title).trim();
    if (symptom !== undefined) patch.symptom = symptom || '';
    if (possible_causes !== undefined) patch.possible_causes = possible_causes || '';
    if (solution !== undefined) patch.solution = solution || '';
    if (remark !== undefined) patch.remark = remark || '';
    if (equipment_model !== undefined) patch.equipment_model = Array.isArray(equipment_model) ? equipment_model.filter(m => m && String(m).trim()).map(m => String(m).trim()) : (equipment_model ? [String(equipment_model).trim()] : []);
    if (keywords !== undefined) patch.keywords = parseKeywords(keywords);
    if (related_error_code_ids !== undefined) patch.related_error_code_ids = await validateRelatedErrorCodes(related_error_code_ids);
    if (attachments !== undefined) {
      const normalizedAttachments = normalizeAttachmentsPayload(attachments);
      const finalized = [];
      for (const a of normalizedAttachments) finalized.push(await finalizeAttachment(a, req));
      patch.attachments = finalized;
    }
    if (status !== undefined) patch.status = String(status || '').trim();

    // validate jira source requires jira_key
    const effectiveSource = patch.source || faultCase.source || 'manual';
    const effectiveJiraKey = patch.jira_key !== undefined ? patch.jira_key : faultCase.jira_key;
    if (effectiveSource === 'jira' && !effectiveJiraKey) {
      return res.status(400).json({ message: 'source=jira 时必须提供 jira_key' });
    }

    patch.updated_by = req.user.id;

    const updateOps = { $set: patch };
    if (Object.keys(unset).length) updateOps.$unset = unset;
    const updated = await FaultCase.findByIdAndUpdate(id, updateOps, { new: true });

    return res.json({ message: req.t('shared.updated'), faultCase: updated });
  } catch (err) {
    console.error('updateFaultCase error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const deleteFaultCase = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'invalid id' });

    const faultCase = await FaultCase.findById(id);
    if (!faultCase) return res.status(404).json({ message: req.t('shared.notFound') });
    if (!(await canEditCase(req, faultCase))) return res.status(403).json({ message: '权限不足' });

    await FaultCase.deleteOne({ _id: id });
    await FaultCaseI18n.deleteMany({ fault_case_id: id });

    return res.json({ message: req.t('shared.deleted') });
  } catch (err) {
    console.error('deleteFaultCase error:', err);
    return res.status(500).json({ message: req.t('shared.deleteFailed'), error: err.message });
  }
};

const getFaultCaseDetail = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'invalid id' });

    const faultCase = await FaultCase.findById(id).lean();
    if (!faultCase) return res.status(404).json({ message: req.t('shared.notFound') });
    if (!(await canReadCase(req, faultCase))) return res.status(403).json({ message: '权限不足' });

    const merged = await overlayI18nIfNeeded(req, faultCase);
    return res.json({ faultCase: normalizeFaultCaseAttachmentsForResponse(merged, req) });
  } catch (err) {
    console.error('getFaultCaseDetail error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const listLatestFaultCases = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const { limit } = normalizePagination(1, req.query.limit || '5', 20);

    const docs = await FaultCase.aggregate([
      { $match: {} }, // 数据库中的记录都是已发布状态
      { $sort: { updatedAt: -1 } },
      { $limit: limit }
    ]);

    const out = [];
    for (const d of docs) out.push(normalizeFaultCaseAttachmentsForResponse(await overlayI18nIfNeeded(req, d), req));
    return res.json({ faultCases: out });
  } catch (err) {
    console.error('listLatestFaultCases error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const searchFaultCases = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const q = (req.query.q || '').toString().trim();
    const errorCode = (req.query.errorCode || req.query.error_code || '').toString().trim();
    const { limit } = normalizePagination(1, req.query.limit, MAX_PAGE_SIZE.FAULT_CASE);
    const mine = String(req.query.mine || '').toLowerCase() === '1' || String(req.query.mine || '').toLowerCase() === 'true';

    const filter = {};

    // visibility:
    // - mine=1: only my cases
    // - else: all cases (数据库中的记录都是已发布状态)
    if (mine) {
      filter.created_by = req.user.id;
    }
    // 否则不添加筛选条件，返回所有记录

    const and = [];
    if (q) {
      and.push({
        $or: [
          { $text: { $search: q } },
          { keywords: { $in: parseKeywords(q) } }
        ]
      });
    }

    if (errorCode) {
      // If numeric -> treat as error_code id; else lookup by code
      let ids = [];
      const asNum = Number(errorCode);
      if (Number.isFinite(asNum) && asNum > 0) {
        ids = [asNum];
      } else {
        const found = await ErrorCode.findAll({
          where: { code: errorCode },
          attributes: ['id']
        });
        ids = found.map(x => x.id);
      }
      if (ids.length) and.push({ related_error_code_ids: { $in: ids } });
      else and.push({ related_error_code_ids: { $in: [-1] } }); // no match
    }

    if (and.length) filter.$and = and;

    const docs = await FaultCase.aggregate([
      { $match: filter },
      { $sort: { updatedAt: -1 } },
      { $limit: limit }
    ]);

    const out = [];
    for (const d of docs) out.push(normalizeFaultCaseAttachmentsForResponse(await overlayI18nIfNeeded(req, d), req));

    return res.json({ faultCases: out });
  } catch (err) {
    console.error('searchFaultCases error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// ----- i18n -----
const getFaultCaseI18nByLang = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'invalid id' });
    const lang = normalizeLang(req.query.lang || req.body?.lang);
    if (!lang || lang === 'zh') return res.json({ i18nContent: null });

    const doc = await FaultCaseI18n.findOne({ fault_case_id: id, lang }).lean();
    return res.json({ i18nContent: doc || null });
  } catch (err) {
    console.error('getFaultCaseI18nByLang error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const saveFaultCaseI18nByLang = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'invalid id' });
    const { lang } = req.body || {};
    const normLang = normalizeLang(lang);
    if (!normLang || normLang === 'zh') return res.status(400).json({ message: 'lang required (non-zh)' });

    const patch = {};
    ['title', 'symptom', 'possible_causes', 'solution', 'remark'].forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k] || '';
    });
    if (req.body.keywords !== undefined) patch.keywords = parseKeywords(req.body.keywords);

    const updated = await FaultCaseI18n.findOneAndUpdate(
      { fault_case_id: id, lang: normLang },
      { $set: { fault_case_id: id, lang: normLang, ...patch } },
      { new: true, upsert: true }
    );

    return res.json({ message: req.t('shared.updated'), i18nContent: updated });
  } catch (err) {
    console.error('saveFaultCaseI18nByLang error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const autoTranslateFaultCaseI18n = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'invalid id' });

    const { lang, overwrite = false } = req.body || {};
    const targetLang = normalizeLang(lang);
    if (!targetLang || targetLang === 'zh') return res.status(400).json({ message: 'lang required (non-zh)' });

    const source = await FaultCase.findById(id).lean();
    if (!source) return res.status(404).json({ message: req.t('shared.notFound') });

    const existing = await FaultCaseI18n.findOne({ fault_case_id: id, lang: targetLang }).lean();
    const existingFields = existing || {};

    const fields = ['title', 'symptom', 'possible_causes', 'solution', 'remark'];
    const translated = {};
    let translatedCount = 0;

    for (const k of fields) {
      const srcVal = (source[k] || '').toString();
      const existVal = (existingFields[k] || '').toString();
      if (!overwrite && existVal.trim() !== '') {
        translated[k] = existVal;
        continue;
      }
      if (!srcVal.trim()) {
        translated[k] = existVal || '';
        continue;
      }
      try {
        translated[k] = await translateText(srcVal, targetLang, 'zh-CN');
        if (translated[k] && translated[k].trim()) translatedCount += 1;
      } catch (e) {
        translated[k] = existVal || '';
      }
    }

    // keywords: translate each token
    const srcKw = Array.isArray(source.keywords) ? source.keywords : [];
    const existKw = Array.isArray(existingFields.keywords) ? existingFields.keywords : [];
    if (!overwrite && existKw.length) {
      translated.keywords = existKw;
    } else if (srcKw.length) {
      const kwOut = [];
      for (const kw of srcKw.slice(0, 50)) {
        try {
          const t = await translateText(String(kw), targetLang, 'zh-CN');
          kwOut.push(t || String(kw));
        } catch (_) {
          kwOut.push(String(kw));
        }
      }
      translated.keywords = kwOut;
    } else {
      translated.keywords = existKw;
    }

    if (translatedCount === 0) {
      return res.status(500).json({ message: '自动翻译失败：没有字段被成功翻译' });
    }

    const saved = await FaultCaseI18n.findOneAndUpdate(
      { fault_case_id: id, lang: targetLang },
      { $set: { fault_case_id: id, lang: targetLang, ...translated } },
      { new: true, upsert: true }
    );

    return res.json({ message: 'Translation completed', translatedFields: saved });
  } catch (err) {
    console.error('autoTranslateFaultCaseI18n error:', err);
    return res.status(500).json({ message: '自动翻译失败', error: err.message });
  }
};

module.exports = {
  uploadFaultCaseAttachments,
  createFaultCase,
  updateFaultCase,
  deleteFaultCase,
  getFaultCaseDetail,
  listLatestFaultCases,
  searchFaultCases,
  getFaultCaseI18nByLang,
  saveFaultCaseI18nByLang,
  autoTranslateFaultCaseI18n,
  // export constants for route wiring
  MAX_FILES,
  MAX_FILE_SIZE,
  ALLOWED_MIMES
};


