const fs = require('fs');
const path = require('path');

const { postgresqlSequelize } = require('../config/postgresql');
const agentAssetStorage = require('../config/agentAssetStorage');

function parseAttachments(input) {
  if (Array.isArray(input)) return input;
  if (!input) return [];
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizeAssetKey(attachment = {}) {
  const storage = String(attachment.storage || '').trim().toLowerCase();
  const objectKey = String(attachment.objectKey || attachment.object_key || '').trim().replace(/\\/g, '/').replace(/^\//, '');
  const storedName = String(attachment.storedName || attachment.stored_name || '').trim();
  const assetId = String(attachment.assetId || attachment.asset_id || '').trim();
  if (!storage || (!objectKey && !storedName && !assetId)) return null;
  return {
    storage,
    objectKey,
    storedName,
    assetId
  };
}

function toAssetIdentity(key) {
  if (!key) return '';
  return [
    key.storage || '',
    key.objectKey || '',
    key.storedName || '',
    key.assetId || ''
  ].join('|');
}

function collectAttachmentCandidates(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const attachments = parseAttachments(row?.attachments);
    for (const attachment of attachments) {
      const key = normalizeAssetKey(attachment);
      const identity = toAssetIdentity(key);
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      out.push(key);
    }
  }
  return out;
}

async function listMessageAttachmentsByInstances(instanceIds = [], transaction = null) {
  if (!Array.isArray(instanceIds) || instanceIds.length === 0) return [];
  const [rows] = await postgresqlSequelize.query(
    `SELECT attachments
       FROM conversation_messages
      WHERE instance_id IN (:instanceIds)`,
    {
      replacements: { instanceIds },
      transaction
    }
  );
  return rows || [];
}

function buildCandidateValuesSql(candidates = []) {
  const replacements = {};
  const values = candidates.map((candidate, index) => {
    replacements[`assetId${index}`] = candidate.assetId || '';
    replacements[`storage${index}`] = candidate.storage || '';
    replacements[`objectKey${index}`] = candidate.objectKey || '';
    replacements[`storedName${index}`] = candidate.storedName || '';
    return `(:assetId${index}, :storage${index}, :objectKey${index}, :storedName${index})`;
  });
  return {
    valuesSql: values.join(',\n             '),
    replacements
  };
}

async function findReferencedAssetsOutsideInstances(instanceIds = [], candidates = [], transaction = null) {
  if (!Array.isArray(instanceIds) || instanceIds.length === 0 || !Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }
  const { valuesSql, replacements: candidateReplacements } = buildCandidateValuesSql(candidates);
  const [rows] = await postgresqlSequelize.query(
    `WITH candidates(asset_id, storage, object_key, stored_name) AS (
       VALUES ${valuesSql}
     )
     SELECT DISTINCT
            c.asset_id,
            c.storage,
            c.object_key,
            c.stored_name
       FROM candidates c
       JOIN conversation_messages cm
         ON cm.instance_id NOT IN (:instanceIds)
       JOIN LATERAL jsonb_array_elements(
         CASE
           WHEN jsonb_typeof(cm.attachments) = 'array' THEN cm.attachments
           ELSE '[]'::jsonb
         END
       ) att ON true
      WHERE (
              c.asset_id <> ''
          AND COALESCE(att->>'assetId', '') = c.asset_id
            )
         OR (
              c.asset_id = ''
          AND COALESCE(att->>'storage', '') = c.storage
          AND (
                (c.object_key <> '' AND COALESCE(att->>'objectKey', '') = c.object_key)
             OR (c.object_key = '' AND c.stored_name <> '' AND COALESCE(att->>'storedName', '') = c.stored_name)
              )
            )`,
    {
      replacements: {
        instanceIds,
        ...candidateReplacements
      },
      transaction
    }
  );
  return Array.isArray(rows) ? rows.map(normalizeAssetKey).filter(Boolean) : [];
}

async function deleteAgentAsset(candidate) {
  if (!candidate) return false;
  const storage = String(candidate.storage || '').trim().toLowerCase();
  if (storage === 'oss') {
    const client = await agentAssetStorage.getOssClient();
    const objectKey = String(candidate.objectKey || '').trim().replace(/^\//, '');
    if (!client || !objectKey) return false;
    await client.delete(objectKey);
    return true;
  }

  const objectKey = String(candidate.objectKey || '').trim().replace(/\\/g, '/').replace(/^\//, '');
  const storedName = path.basename(candidate.storedName || '');
  const relativePath = objectKey || (storedName ? `tmp/${storedName}` : '');
  if (!relativePath) return false;
  const filePath = path.resolve(agentAssetStorage.LOCAL_DIR, relativePath);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

async function purgeConversationInstances(options = {}) {
  const instanceIds = Array.from(new Set(
    (Array.isArray(options.instanceIds) ? options.instanceIds : [])
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)
  ));
  if (instanceIds.length === 0) {
    return {
      ok: true,
      instanceIds: [],
      deletedMessages: 0,
      deletedInstances: 0,
      deletedAssets: 0,
      skippedAssets: 0,
      dryRun: Boolean(options.dryRun)
    };
  }

  const dryRun = options.dryRun === true;
  const transaction = options.transaction || null;
  const messageRows = await listMessageAttachmentsByInstances(instanceIds, transaction);
  const assetCandidates = collectAttachmentCandidates(messageRows);
  const referencedAssets = await findReferencedAssetsOutsideInstances(instanceIds, assetCandidates, transaction);
  const referencedSet = new Set(referencedAssets.map(toAssetIdentity));
  const deletableAssets = assetCandidates.filter((item) => !referencedSet.has(toAssetIdentity(item)));

  let deletedMessages = 0;
  let deletedInstances = 0;
  let deletedAssets = 0;
  let skippedAssets = assetCandidates.length - deletableAssets.length;
  const assetDeleteErrors = [];

  if (!dryRun) {
    const [messageDeleteResult] = await postgresqlSequelize.query(
      `DELETE FROM conversation_messages
        WHERE instance_id IN (:instanceIds)`,
      {
        replacements: { instanceIds },
        transaction
      }
    );
    deletedMessages = Number(messageDeleteResult?.rowCount || 0);

    for (const candidate of deletableAssets) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const removed = await deleteAgentAsset(candidate);
        if (removed) deletedAssets += 1;
      } catch (error) {
        assetDeleteErrors.push({
          storage: candidate.storage,
          objectKey: candidate.objectKey || null,
          storedName: candidate.storedName || null,
          message: String(error?.message || error)
        });
      }
    }

    const [instanceDeleteResult] = await postgresqlSequelize.query(
      `DELETE FROM conversation_instances
        WHERE id IN (:instanceIds)`,
      {
        replacements: { instanceIds },
        transaction
      }
    );
    deletedInstances = Number(instanceDeleteResult?.rowCount || 0);
  } else {
    deletedMessages = messageRows.length;
    deletedInstances = instanceIds.length;
  }

  return {
    ok: true,
    instanceIds,
    deletedMessages,
    deletedInstances,
    deletedAssets,
    skippedAssets,
    dryRun,
    assetDeleteErrors
  };
}

module.exports = {
  parseAttachments,
  normalizeAssetKey,
  toAssetIdentity,
  collectAttachmentCandidates,
  findReferencedAssetsOutsideInstances,
  purgeConversationInstances
};
