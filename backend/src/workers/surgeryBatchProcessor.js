const { Op } = require('sequelize');
const Surgery = require('../models/surgery');
const SurgeryExportPending = require('../models/surgeryExportPending');

function normalizeSurgeryIds(value) {
  const list = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      list
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
}

async function batchDeleteSurgeries(job) {
  const ids = normalizeSurgeryIds(job?.data?.surgeryIds);
  if (!ids.length) {
    return {
      requestedCount: 0,
      deletedCount: 0,
      missingIds: []
    };
  }

  const rows = await Surgery.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'surgery_id']
  });

  const existingIds = rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id));
  const existingIdSet = new Set(existingIds);
  const missingIds = ids.filter((id) => !existingIdSet.has(id));

  const surgeryIds = rows
    .map((row) => (row.surgery_id == null ? '' : String(row.surgery_id).trim()))
    .filter(Boolean);

  if (surgeryIds.length) {
    await SurgeryExportPending.destroy({
      where: {
        surgery_id: { [Op.in]: surgeryIds }
      }
    });
  }

  let deletedCount = 0;
  if (existingIds.length) {
    deletedCount = await Surgery.destroy({
      where: { id: { [Op.in]: existingIds } }
    });
  }

  return {
    requestedCount: ids.length,
    deletedCount: Number(deletedCount || 0),
    missingIds
  };
}

module.exports = {
  batchDeleteSurgeries
};

