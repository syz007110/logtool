const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const authz = require('../middlewares/permission');
const { connectMongo, isMongoConnected } = require('../config/mongodb');
const { translateText } = require('../services/translationService');

const FaultCase = require('../mongoModels/FaultCase');
const FaultCaseI18n = require('../mongoModels/FaultCaseI18n');
const ReviewNotification = require('../mongoModels/ReviewNotification');

const ErrorCode = require('../models/error_code');
const UserRole = require('../models/user_role');
const RolePermission = require('../models/role_permission');
const Permission = require('../models/permission');

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

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
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
  return doc?.updated_at_user || doc?.updatedAt || doc?.createdAt || new Date(0);
}

async function ensureMongoReady() {
  await connectMongo();
  return isMongoConnected();
}

async function getReviewerUserIds() {
  // Find users having permission 'fault_case:review' via MySQL RBAC
  const permissionName = 'fault_case:review';
  const perm = await Permission.findOne({ where: { name: permissionName } });
  if (!perm) return [];

  const rolePerms = await RolePermission.findAll({ where: { permission_id: perm.id } });
  const roleIds = rolePerms.map(rp => rp.role_id).filter(Boolean);
  if (roleIds.length === 0) return [];

  const userRoles = await UserRole.findAll({ where: { role_id: roleIds, is_active: true } });
  return Array.from(new Set(userRoles.map(ur => ur.user_id).filter(Boolean)));
}

async function canReadCase(req, faultCase) {
  if (!faultCase) return false;
  if (faultCase.is_published === true) return true; // is_published: true 表示已发布
  if (req.user && faultCase.created_by === req.user.id) return true;
  // reviewers can read all drafts
  if (req.user && await authz.userHasDbPermission(req.user.id, 'fault_case:review')) return true;
  return false;
}

async function canEditCase(req, faultCase) {
  if (!faultCase) return false;
  if (req.user && faultCase.created_by === req.user.id) return true;
  if (req.user && await authz.userHasDbPermission(req.user.id, 'fault_case:review')) return true;
  return false;
}

async function overlayI18nIfNeeded(req, faultCaseObj) {
  const accept = req.headers['accept-language'] || req.query.lang || 'zh';
  const lang = normalizeLang(accept);
  if (!faultCaseObj || lang === 'zh') return faultCaseObj;

  const i18n = await FaultCaseI18n.findOne({ fault_case_id: faultCaseObj._id, lang });
  if (!i18n) return faultCaseObj;

  const overlay = (k) => (typeof i18n[k] === 'string' && i18n[k].trim() !== '' ? i18n[k] : faultCaseObj[k]);
  return {
    ...faultCaseObj,
    title: overlay('title'),
    symptom: overlay('symptom'),
    possible_causes: overlay('possible_causes'),
    troubleshooting_steps: overlay('troubleshooting_steps'),
    experience: overlay('experience'),
    keywords: Array.isArray(i18n.keywords) && i18n.keywords.length ? i18n.keywords : faultCaseObj.keywords
  };
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
        const client = await getOssClient();
        objectKey = buildTempOssObjectKey(path.basename(file.filename || file.originalname || 'file'));
        const result = await client.put(objectKey, file.path);
        url = buildOssUrl(objectKey, result?.url);
        safeUnlink(file.path);
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

async function finalizeAttachment(asset) {
  const result = { ...asset };

  // local: move tmp -> permanent
  if (result.storage === 'local') {
    ensureLocalDir();
    const isTemp = (result.object_key && result.object_key.startsWith('tmp/')) || (result.url && result.url.includes('/fault-cases/tmp/'));
    if (isTemp) {
      const filename = path.basename(result.object_key || result.url);
      const src = path.resolve(TMP_DIR, filename);
      const dest = path.resolve(LOCAL_DIR, filename);
      fs.renameSync(src, dest);
      result.object_key = filename;
      result.url = buildLocalUrl(filename);
    }
    return result;
  }

  // oss: copy tmp -> permanent
  if (result.storage === 'oss' && result.object_key && result.object_key.includes('/tmp/')) {
    const client = await getOssClient();
    const destKey = result.object_key.replace('/tmp/', '/');
    await client.copy(destKey, result.object_key);
    await client.delete(result.object_key);
    result.object_key = destKey;
    result.url = buildOssUrl(destKey);
  } else if (result.storage === 'oss' && result.object_key && result.object_key.startsWith(TMP_PREFIX)) {
    // safety: in case TMP_PREFIX doesn't contain /tmp/ exactly
    const client = await getOssClient();
    const destKey = buildOssObjectKey(path.basename(result.object_key));
    await client.copy(destKey, result.object_key);
    await client.delete(result.object_key);
    result.object_key = destKey;
    result.url = buildOssUrl(destKey);
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
      title,
      symptom = '',
      possible_causes = '',
      troubleshooting_steps = '',
      experience = '',
      device_id = '',
      keywords,
      related_error_code_ids = [],
      attachments = [],
      updated_at_user = null,
      submit_for_review = false
    } = req.body || {};

    if (!title || !String(title).trim()) return res.status(400).json({ message: 'title 不能为空' });

    // 验证附件数量（上限10个）
    if (attachments && attachments.length > 10) {
      return res.status(400).json({ message: '附件数量不能超过10个' });
    }

    const relatedIds = await validateRelatedErrorCodes(related_error_code_ids);
    const normalizedAttachments = normalizeAttachmentsPayload(attachments);
    const finalized = [];
    for (const a of normalizedAttachments) finalized.push(await finalizeAttachment(a));

    const nowUser = updated_at_user ? new Date(updated_at_user) : null;
    const review = submit_for_review
      ? { state: 'pending', submitted_at: new Date() }
      : { state: 'none' };

    const faultCase = await FaultCase.create({
      title: String(title).trim(),
      symptom,
      possible_causes,
      troubleshooting_steps,
      experience,
      device_id,
      keywords: parseKeywords(keywords),
      related_error_code_ids: relatedIds,
      attachments: finalized,
      is_published: false, // false 表示草稿，true 表示已发布
      review,
      created_by: req.user.id,
      updated_by: req.user.id,
      updated_at_user: nowUser
    });

    if (submit_for_review) {
      const reviewerIds = await getReviewerUserIds();
      if (reviewerIds.length) {
        await ReviewNotification.insertMany(
          reviewerIds.map((uid) => ({
            user_id: uid,
            type: 'fault_case_review',
            fault_case_id: faultCase._id,
            title: faultCase.title,
            status: 'unread'
          })),
          { ordered: false }
        );
      }
    }

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
      title,
      symptom,
      possible_causes,
      troubleshooting_steps,
      experience,
      device_id,
      keywords,
      related_error_code_ids,
      attachments,
      updated_at_user = undefined,
      submit_for_review = false
    } = req.body || {};

    if (title !== undefined && !String(title).trim()) return res.status(400).json({ message: 'title 不能为空' });

    // 验证附件数量（上限10个）
    if (attachments !== undefined && attachments.length > 10) {
      return res.status(400).json({ message: '附件数量不能超过10个' });
    }

    const patch = {};
    if (title !== undefined) patch.title = String(title).trim();
    if (symptom !== undefined) patch.symptom = symptom || '';
    if (possible_causes !== undefined) patch.possible_causes = possible_causes || '';
    if (troubleshooting_steps !== undefined) patch.troubleshooting_steps = troubleshooting_steps || '';
    if (experience !== undefined) patch.experience = experience || '';
    if (device_id !== undefined) patch.device_id = device_id || '';
    if (keywords !== undefined) patch.keywords = parseKeywords(keywords);
    if (related_error_code_ids !== undefined) patch.related_error_code_ids = await validateRelatedErrorCodes(related_error_code_ids);
    if (attachments !== undefined) {
      const normalizedAttachments = normalizeAttachmentsPayload(attachments);
      const finalized = [];
      for (const a of normalizedAttachments) finalized.push(await finalizeAttachment(a));
      patch.attachments = finalized;
    }
    if (updated_at_user !== undefined) patch.updated_at_user = updated_at_user ? new Date(updated_at_user) : null;

    patch.updated_by = req.user.id;
    // Any modification requires re-review for publishing
    patch.is_published = false; // false 表示草稿，true 表示已发布
    patch.review = submit_for_review
      ? { state: 'pending', submitted_at: new Date(), reviewed_at: null, reviewed_by: null, comment: '' }
      : { state: 'none', submitted_at: null, reviewed_at: null, reviewed_by: null, comment: '' };

    const updated = await FaultCase.findByIdAndUpdate(id, patch, { new: true });

    if (submit_for_review) {
      const reviewerIds = await getReviewerUserIds();
      if (reviewerIds.length) {
        await ReviewNotification.insertMany(
          reviewerIds.map((uid) => ({
            user_id: uid,
            type: 'fault_case_review',
            fault_case_id: updated._id,
            title: updated.title,
            status: 'unread'
          })),
          { ordered: false }
        );
      }
    }

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
    await ReviewNotification.deleteMany({ fault_case_id: id, type: 'fault_case_review' });

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
    return res.json({ faultCase: merged });
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
    const limit = Math.min(Number.parseInt(req.query.limit || '5', 10) || 5, 20);

    const docs = await FaultCase.aggregate([
      { $match: { is_published: true } }, // is_published: true 表示已发布
      { $addFields: { effectiveUpdatedAt: { $ifNull: ['$updated_at_user', '$updatedAt'] } } },
      { $sort: { effectiveUpdatedAt: -1, updatedAt: -1 } },
      { $limit: limit }
    ]);

    const out = [];
    for (const d of docs) out.push(await overlayI18nIfNeeded(req, d));
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
    const limit = Math.min(Number.parseInt(req.query.limit || '20', 10) || 20, 100);
    const mine = String(req.query.mine || '').toLowerCase() === '1' || String(req.query.mine || '').toLowerCase() === 'true';

    const filter = {};

    // visibility:
    // - mine=1: only my cases (draft/pending/rejected/published)
    // - else: published OR my drafts; reviewers see all
    const isReviewer = req.user && await authz.userHasDbPermission(req.user.id, 'fault_case:review');
    if (mine) {
      filter.created_by = req.user.id;
    } else if (!isReviewer) {
      filter.$or = [{ is_published: true }, { created_by: req.user.id }]; // is_published: true 表示已发布
    }

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
      { $addFields: { effectiveUpdatedAt: { $ifNull: ['$updated_at_user', '$updatedAt'] } } },
      { $sort: { effectiveUpdatedAt: -1, updatedAt: -1 } },
      { $limit: limit }
    ]);

    const out = [];
    for (const d of docs) out.push(await overlayI18nIfNeeded(req, d));

    return res.json({ faultCases: out });
  } catch (err) {
    console.error('searchFaultCases error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

// ----- Review workflow -----
const submitFaultCaseReview = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'invalid id' });

    const faultCase = await FaultCase.findById(id);
    if (!faultCase) return res.status(404).json({ message: req.t('shared.notFound') });
    if (!(await canEditCase(req, faultCase))) return res.status(403).json({ message: '权限不足' });

    faultCase.is_published = false; // false 表示草稿
    faultCase.review = { state: 'pending', submitted_at: new Date(), reviewed_at: null, reviewed_by: null, comment: '' };
    faultCase.updated_by = req.user.id;
    await faultCase.save();

    const reviewerIds = await getReviewerUserIds();
    if (reviewerIds.length) {
      await ReviewNotification.insertMany(
        reviewerIds.map((uid) => ({
          user_id: uid,
          type: 'fault_case_review',
          fault_case_id: faultCase._id,
          title: faultCase.title,
          status: 'unread'
        })),
        { ordered: false }
      );
    }

    return res.json({ message: '已提交审核', faultCase });
  } catch (err) {
    console.error('submitFaultCaseReview error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const reviewFaultCase = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: 'invalid id' });

    const { action, comment = '' } = req.body || {};
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ message: 'action must be approve|reject' });
    }

    const faultCase = await FaultCase.findById(id);
    if (!faultCase) return res.status(404).json({ message: req.t('shared.notFound') });

    // 单人审核模式：一旦审核完成（approved/rejected），不允许再次审核以避免状态回跳
    if (faultCase.review?.state === 'approved' || faultCase.review?.state === 'rejected') {
      return res.status(400).json({ message: '该案例已审核完成，不能重复审核' });
    }

    if (action === 'approve') {
      faultCase.is_published = true; // true 表示已发布
      faultCase.review = { state: 'approved', submitted_at: faultCase.review?.submitted_at || null, reviewed_at: new Date(), reviewed_by: req.user.id, comment: String(comment || '') };
    } else {
      faultCase.is_published = false; // false 表示草稿
      faultCase.review = { state: 'rejected', submitted_at: faultCase.review?.submitted_at || null, reviewed_at: new Date(), reviewed_by: req.user.id, comment: String(comment || '') };
    }
    faultCase.updated_by = req.user.id;
    await faultCase.save();

    // 单人审核模式：任一审核人处理后，所有审核人的待办都应失效
    await ReviewNotification.updateMany(
      { type: 'fault_case_review', fault_case_id: faultCase._id },
      { $set: { status: 'processed' } }
    );

    return res.json({ message: '审核完成', faultCase });
  } catch (err) {
    console.error('reviewFaultCase error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const getReviewInbox = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const limit = Math.min(Number.parseInt(req.query.limit || '20', 10) || 20, 100);
    const status = (req.query.status || 'unread').toString(); // unread|read|processed|all
    const filter = { user_id: req.user.id, type: 'fault_case_review' };
    if (status !== 'all') filter.status = status;

    const items = await ReviewNotification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ items });
  } catch (err) {
    console.error('getReviewInbox error:', err);
    return res.status(500).json({ message: req.t('shared.operationFailed'), error: err.message });
  }
};

const markInboxRead = async (req, res) => {
  try {
    if (!(await ensureMongoReady())) {
      return res.status(503).json({ message: 'MongoDB 未连接，故障案例功能不可用' });
    }
    const { ids = [] } = req.body || {};
    const objIds = (Array.isArray(ids) ? ids : [])
      .map(toObjectId)
      .filter(Boolean);
    if (!objIds.length) return res.json({ updated: 0 });

    const r = await ReviewNotification.updateMany(
      { _id: { $in: objIds }, user_id: req.user.id, type: 'fault_case_review' },
      { $set: { status: 'read' } }
    );

    return res.json({ updated: r.modifiedCount || 0 });
  } catch (err) {
    console.error('markInboxRead error:', err);
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
    ['title', 'symptom', 'possible_causes', 'troubleshooting_steps', 'experience'].forEach((k) => {
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

    const fields = ['title', 'symptom', 'possible_causes', 'troubleshooting_steps', 'experience'];
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
  submitFaultCaseReview,
  reviewFaultCase,
  getReviewInbox,
  markInboxRead,
  getFaultCaseI18nByLang,
  saveFaultCaseI18nByLang,
  autoTranslateFaultCaseI18n,
  // export constants for route wiring
  MAX_FILES,
  MAX_FILE_SIZE,
  ALLOWED_MIMES
};


