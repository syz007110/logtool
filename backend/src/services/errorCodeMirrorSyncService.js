const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');

const MIRROR_SUBSYSTEM_MAP = Object.freeze({
  '1': '8',
  '8': '1',
  '3': '9',
  '9': '3',
  '5': 'A',
  A: '5'
});

const MAIN_SYNC_FIELDS = [
  'code',
  'is_axis_error',
  'is_arm_error',
  'solution',
  'for_expert',
  'for_novice',
  'related_log',
  'level',
  'category'
];

const I18N_SYNC_FIELDS = [
  'short_message',
  'user_hint',
  'operation',
  'detail',
  'method',
  'param1',
  'param2',
  'param3',
  'param4',
  'tech_solution',
  'explanation'
];

function normalizeSubsystem(subsystem) {
  if (subsystem === null || subsystem === undefined) return '';
  return String(subsystem).trim().toUpperCase();
}

function getMirroredSubsystem(subsystem) {
  const normalized = normalizeSubsystem(subsystem);
  return MIRROR_SUBSYSTEM_MAP[normalized] || null;
}

function isMirrorSubsystem(subsystem) {
  return Boolean(getMirroredSubsystem(subsystem));
}

function buildMirrorMainPayload(sourceErrorCode, targetSubsystem) {
  const payload = { subsystem: targetSubsystem };
  MAIN_SYNC_FIELDS.forEach((field) => {
    payload[field] = sourceErrorCode[field];
  });
  return payload;
}

function buildMirrorI18nPayload(i18nRow, targetErrorCodeId) {
  const payload = {
    error_code_id: targetErrorCodeId,
    lang: i18nRow.lang
  };
  I18N_SYNC_FIELDS.forEach((field) => {
    payload[field] = i18nRow[field] ?? null;
  });
  return payload;
}

async function syncMirrorErrorCodeBySourceId({ sourceErrorCodeId, transaction }) {
  const sourceErrorCode = await ErrorCode.findByPk(sourceErrorCodeId, { transaction });
  if (!sourceErrorCode) {
    return { synced: false, skipped: true, reason: 'source_not_found' };
  }

  const targetSubsystem = getMirroredSubsystem(sourceErrorCode.subsystem);
  if (!targetSubsystem) {
    return { synced: false, skipped: true, reason: 'subsystem_not_mirrored' };
  }

  const mirrorMainPayload = buildMirrorMainPayload(sourceErrorCode, targetSubsystem);

  let targetErrorCode = await ErrorCode.findOne({
    where: { subsystem: targetSubsystem, code: sourceErrorCode.code },
    transaction
  });

  let created = false;
  if (targetErrorCode) {
    await targetErrorCode.update(mirrorMainPayload, { transaction });
  } else {
    targetErrorCode = await ErrorCode.create(mirrorMainPayload, { transaction });
    created = true;
  }

  const sourceI18nList = await I18nErrorCode.findAll({
    where: { error_code_id: sourceErrorCode.id },
    transaction
  });

  for (const sourceI18n of sourceI18nList) {
    const payload = buildMirrorI18nPayload(sourceI18n, targetErrorCode.id);
    const targetI18n = await I18nErrorCode.findOne({
      where: {
        error_code_id: targetErrorCode.id,
        lang: sourceI18n.lang
      },
      transaction
    });

    if (targetI18n) {
      await targetI18n.update(payload, { transaction });
    } else {
      await I18nErrorCode.create(payload, { transaction });
    }
  }

  return {
    synced: true,
    skipped: false,
    targetErrorCodeId: targetErrorCode.id,
    targetSubsystem,
    created,
    syncedLanguages: sourceI18nList.map((item) => item.lang)
  };
}

module.exports = {
  MIRROR_SUBSYSTEM_MAP,
  getMirroredSubsystem,
  isMirrorSubsystem,
  syncMirrorErrorCodeBySourceId
};
