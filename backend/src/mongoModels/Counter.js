const mongoose = require('mongoose');

// Generic auto-increment counter collection:
// { _id: 'fault_cases', seq: 123 }
const CounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
  },
  { collection: 'counters' }
);

module.exports = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

