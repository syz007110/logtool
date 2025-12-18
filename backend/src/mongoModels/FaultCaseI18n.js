const mongoose = require('mongoose');

const FaultCaseI18nSchema = new mongoose.Schema({
  fault_case_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  lang: { type: String, required: true }, // e.g. 'en'

  title: { type: String, default: '' },
  symptom: { type: String, default: '' },
  possible_causes: { type: String, default: '' },
  troubleshooting_steps: { type: String, default: '' },
  experience: { type: String, default: '' },
  keywords: { type: [String], default: [] }
}, {
  timestamps: true,
  collection: 'fault_case_i18n'
});

FaultCaseI18nSchema.index({ fault_case_id: 1, lang: 1 }, { unique: true });

module.exports = mongoose.models.FaultCaseI18n || mongoose.model('FaultCaseI18n', FaultCaseI18nSchema);


