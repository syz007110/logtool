/*
 * Rebuild code_category_map from error_codes and error_code_analysis_categories
 * Usage: node backend/src/scripts/rebuildCodeCategoryMap.js
 */
const { sequelize } = require('../models');

(async () => {
  try {
    console.log('🔧 Rebuilding code_category_map ...');
    const t0 = Date.now();

    // Ensure table exists (in case init not applied yet)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS code_category_map (
        subsystem_char CHAR(1) NOT NULL,
        code4          CHAR(6) NOT NULL,
        analysis_category_id INT NOT NULL,
        PRIMARY KEY (subsystem_char, code4, analysis_category_id),
        INDEX idx_ccm_code (subsystem_char, code4),
        INDEX idx_ccm_cat  (analysis_category_id, subsystem_char, code4)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await sequelize.query('TRUNCATE TABLE code_category_map');

    const [res] = await sequelize.query(`
      INSERT INTO code_category_map (subsystem_char, code4, analysis_category_id)
      SELECT LEFT(ec.subsystem, 1) AS subsystem_char,
             CONCAT('0X', UPPER(RIGHT(ec.code, 4))) AS code4,
             ecac.analysis_category_id
      FROM error_codes ec
      INNER JOIN error_code_analysis_categories ecac ON ec.id = ecac.error_code_id
    `);

    console.log(`✅ Inserted ${(res && res.affectedRows) || 0} rows into code_category_map. Took ${Date.now() - t0} ms.`);
    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error('❌ Rebuild failed:', e);
    try { await sequelize.close(); } catch (_) {}
    process.exit(1);
  }
})();


