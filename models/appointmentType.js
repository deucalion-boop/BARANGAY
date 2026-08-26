const mongoose = require('mongoose');

const appointmentTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    description: {
      type: String,
      default: ''
    },
    color: {
      type: String,
      default: '#4299e1' // default accent color
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

appointmentTypeSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('AppointmentType', appointmentTypeSchema);
