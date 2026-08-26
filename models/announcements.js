// models/announcements.js - CORRECTED VERSION
const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    default: null
  },
  type: {
    type: String,
    enum: ['general', 'emergency', 'maintenance', 'event', 'urgent'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiryDate: {
    type: Date,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scheduleDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Only define Announcement model, don't redefine Appointment
module.exports = mongoose.model('Announcement', announcementSchema);