const fs = require('fs');
const path = require('path');
const { sequelize } = require('../models');
const ErrorCode = require('../models/error_code');
const I18nErrorCode = require('../models/i18n_error_code');

/**
 * normalizeI18nZh.js
 *
 * Goal:
 *  - Normalize Chinese (zh) content between error_codes (authoritative) and i18n_error_codes(zh)
 *  - Default: dry-run (no writes). Use --apply to perform writes.
 *  - Options: --limit=N, --csv=output.csv
 *
 * Rules (per field: short_message, user_hint, operation):
 *  1) If error_codes.<field> (zh) is non-empty -> upsert i18n.zh with that value (overwrite i18n).
 *  2) Else if error_codes.<field> empty and i18n.zh.<field> non-empty -> backfill error_codes.<field>.
 *  3) Keep counters and produce a summary; optional CSV of differences.
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { apply: false, limit: null, csv: null };
  for (const arg of args) {
    if (arg === '--apply') flags.apply = true;
    else if (arg.startsWith('--limit=')) flags.limit = parseInt(arg.split('=')[1], 10) || null;
    else if (arg.startsWith('--csv=')) flags.csv = arg.split('=')[1];
  }
  return flags;
}

function isNonEmpty(text) {
  return text !== null && text !== undefined && String(text).trim() !== '';
}

async function main() {
  const { apply, limit, csv } = parseArgs();
  console.log(`normalizeI18nZh | apply=${apply} limit=${limit ?? 'none'} csv=${csv ?? 'none'}`);

  await sequelize.authenticate();
  console.log('✅ DB connected');

  // Fetch error codes in batches to avoid loading entire table if large
  const where = {};
  const options = { where, order: [['id', 'ASC']] };
  if (limit) options.limit = limit;

  const fields = ['short_message', 'user_hint', 'operation'];

  const rows = await ErrorCode.findAll(options);
  console.log(`📦 Loaded ${rows.length} error_codes to check`);

  // CSV collection
  const csvRows = [['error_code_id','field','action','error_codes_value','i18n_zh_value']];

  let stats = {
    upsertI18n: 0,
    backfillMain: 0,
    unchanged: 0,
    processed: 0
  };

  for (const ec of rows) {
    // Load zh i18n record
    let i18nZh = await I18nErrorCode.findOne({ where: { error_code_id: ec.id, lang: 'zh' } });

    // Prepare new values for i18n
    const upsertPayload = { error_code_id: ec.id, lang: 'zh' };
    let willUpsertI18n = false;
    let willBackfillMain = false;

    for (const f of fields) {
      const mainVal = isNonEmpty(ec[f]) ? String(ec[f]) : '';
      const i18nVal = i18nZh && isNonEmpty(i18nZh[f]) ? String(i18nZh[f]) : '';

      if (isNonEmpty(mainVal)) {
        // Authoritative: main -> i18n
        if (mainVal !== i18nVal) {
          upsertPayload[f] = mainVal;
          willUpsertI18n = true;
          if (csv) csvRows.push([String(ec.id), f, 'main->i18n', mainVal.replace(/\n/g,'\\n'), i18nVal.replace(/\n/g,'\\n')]);
        } else {
          // in-sync
        }
      } else if (!isNonEmpty(mainVal) && isNonEmpty(i18nVal)) {
        // Backfill main from i18n
        ec[f] = i18nVal;
        willBackfillMain = true;
        if (csv) csvRows.push([String(ec.id), f, 'i18n->main', i18nVal.replace(/\n/g,'\\n'), mainVal.replace(/\n/g,'\\n')]);
      }
    }

    if (apply) {
      if (willUpsertI18n) {
        await I18nErrorCode.upsert(upsertPayload);
        stats.upsertI18n += 1;
      }
      if (willBackfillMain) {
        await ec.save();
        stats.backfillMain += 1;
      }
    } else {
      if (willUpsertI18n) stats.upsertI18n += 1;
      if (willBackfillMain) stats.backfillMain += 1;
    }

    if (!willUpsertI18n && !willBackfillMain) stats.unchanged += 1;
    stats.processed += 1;
  }

  // Write CSV if requested
  if (csv) {
    const csvPath = path.resolve(process.cwd(), csv);
    const content = csvRows.map(r => r.map(v => {
      if (v === null || v === undefined) return '';
      // Basic CSV escaping
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') ? `"${s}"` : s;
    }).join(',')).join('\n');
    fs.writeFileSync(csvPath, content, 'utf8');
    console.log(`📝 CSV diff written: ${csvPath}`);
  }

  console.log('\n==== Summary ====' );
  console.log(`Processed: ${stats.processed}`);
  console.log(`To upsert i18n.zh: ${stats.upsertI18n}`);
  console.log(`To backfill main: ${stats.backfillMain}`);
  console.log(`Unchanged: ${stats.unchanged}`);

  await sequelize.close();
  console.log('✅ Done');
}

main().catch(err => {
  console.error('❌ normalize failed:', err);
  process.exit(1);
});
