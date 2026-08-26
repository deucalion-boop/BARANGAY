const mongoose = require('mongoose');

const scheduleRequestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  start: { type: String, required: true },
  end: { type: String },
  appointmentType: { type: String },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending','approved','rejected','reschedule_requested','expired'], default: 'pending' },
  // Admin review fields
  declineReason: { type: String },
  recommendation: { type: String },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  // Reschedule fields
  rescheduleReason: { type: String },
  rescheduleNotes: { type: String },
  rescheduleRequestedAt: { type: Date },
  newStart: { type: String },
  newEnd: { type: String },
  rescheduleStatus: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  rescheduleApprovedAt: { type: Date },
  // Expiry fields
  expiredAt: { type: Date },
  adminNotes: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.ScheduleRequest || mongoose.model('ScheduleRequest', scheduleRequestSchema);
