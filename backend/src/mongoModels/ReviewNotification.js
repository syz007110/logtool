const mongoose = require('mongoose');

const ReviewNotificationSchema = new mongoose.Schema({
  user_id: { type: Number, required: true, index: true },
  type: { type: String, enum: ['fault_case_review'], required: true },
  fault_case_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  title: { type: String, default: '' },
  status: { type: String, enum: ['unread', 'read', 'processed'], default: 'unread' }
}, {
  timestamps: true,
  collection: 'review_notifications'
});

ReviewNotificationSchema.index({ user_id: 1, status: 1, createdAt: -1 });
ReviewNotificationSchema.index({ fault_case_id: 1, type: 1 });

module.exports = mongoose.models.ReviewNotification || mongoose.model('ReviewNotification', ReviewNotificationSchema);


