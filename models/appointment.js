  const mongoose = require('mongoose');

  const appointmentSchema = new mongoose.Schema({
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
      // removed required: true
    },
    appointmentDate: {
      type: String,
      required: true
    },
    appointmentTime: {
      type: String,
      required: true
    },
    appointmentType: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'scheduled', 'completed', 'cancelled', 'no-show'],
      default: 'pending'
    },
    notes: {
      type: String,
      default: ''
    },
    declineReason: {
      type: String
    },
    recommendation: {
      type: String
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }, {
    timestamps: true
  });

  appointmentSchema.index({ appointmentDate: 1, appointmentTime: 1 });
  appointmentSchema.index({ doctorId: 1, appointmentDate: 1 });
  appointmentSchema.index({ patientId: 1 });
  appointmentSchema.index({ status: 1 });

  module.exports = mongoose.model('Appointment', appointmentSchema);