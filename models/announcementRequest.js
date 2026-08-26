const mongoose = require('mongoose');

const announcementRequestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true,
    maxlength: [2000, 'Content cannot exceed 2000 characters']
  },
  type: {
    type: String,
    enum: ['general', 'emergency', 'maintenance', 'event', 'community'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'published'],
    default: 'pending'
  },
  // Admin review fields
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot exceed 500 characters']
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: [500, 'Admin notes cannot exceed 500 characters']
  },
  // If approved, link to the actual announcement
  announcementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Announcement'
  },
  // Request metadata
  requestReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Request reason cannot exceed 500 characters']
  },
  targetAudience: {
    type: [String],
    enum: ['all', 'residents', 'owners', 'tenants', 'specific_units'],
    default: ['all']
  },
  specificUnits: {
    type: [String],
    default: []
  },
  proposedExpiryDate: {
    type: Date
  },
  isUrgent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for better query performance
announcementRequestSchema.index({ status: 1 });
announcementRequestSchema.index({ requestedBy: 1 });
announcementRequestSchema.index({ type: 1 });
announcementRequestSchema.index({ createdAt: -1 });
announcementRequestSchema.index({ reviewedBy: 1 });

// Virtual for formatted status
announcementRequestSchema.virtual('statusFormatted').get(function() {
  return this.status.charAt(0).toUpperCase() + this.status.slice(1);
});

// Virtual for days since request
announcementRequestSchema.virtual('daysSinceRequest').get(function() {
  const diffTime = Math.abs(new Date() - this.createdAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Instance method to check if request is pending
announcementRequestSchema.methods.isPending = function() {
  return this.status === 'pending';
};

// Instance method to check if request is approved
announcementRequestSchema.methods.isApproved = function() {
  return this.status === 'approved' || this.status === 'published';
};

// Static method to find pending requests
announcementRequestSchema.statics.findPending = function() {
  return this.find({ status: 'pending' }).sort({ createdAt: -1 });
};

// Static method to find requests by user
announcementRequestSchema.statics.findByUser = function(userId) {
  return this.find({ requestedBy: userId }).sort({ createdAt: -1 });
};

// Ensure virtual fields are serialized
announcementRequestSchema.set('toJSON', { virtuals: true });
announcementRequestSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AnnouncementRequest', announcementRequestSchema);