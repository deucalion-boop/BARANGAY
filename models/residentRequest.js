const mongoose = require('mongoose');

const residentRequestSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String },
  email: { type: String, required: true },
  phone: { type: String },
  unitNumber: { type: String },
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.ResidentRequest || mongoose.model('ResidentRequest', residentRequestSchema);
