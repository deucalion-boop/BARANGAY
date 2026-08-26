const mongoose = require('mongoose');

const appointmentTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Appointment type name is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  duration: {
    type: Number, // Duration in minutes
    required: [true, 'Duration is required'],
    min: [5, 'Duration must be at least 5 minutes'],
    max: [480, 'Duration cannot exceed 8 hours (480 minutes)']
  },
  color: {
    type: String,
    default: '#4299e1',
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
      },
      message: 'Color must be a valid hex color code'
    }
  },
  icon: {
    type: String,
    default: 'fas fa-calendar-check'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  requiresApproval: {
    type: Boolean,
    default: false
  },
  allowedRoles: {
    type: [String],
    enum: ['resident', 'admin'],
    default: ['resident', 'admin']
  },
  maxParticipants: {
    type: Number,
    default: 1,
    min: [1, 'Max participants must be at least 1']
  },
  preparationTime: {
    type: Number, // Preparation time in minutes
    default: 0,
    min: [0, 'Preparation time cannot be negative']
  },
  bufferTime: {
    type: Number, // Buffer time between appointments in minutes
    default: 0,
    min: [0, 'Buffer time cannot be negative']
  },
  instructions: {
    type: String,
    trim: true,
    maxlength: [1000, 'Instructions cannot exceed 1000 characters']
  },
  requirements: {
    type: [String],
    default: []
  },
  // Pricing fields (optional)
  hasFee: {
    type: Boolean,
    default: false
  },
  feeAmount: {
    type: Number,
    default: 0,
    min: [0, 'Fee amount cannot be negative']
  },
  feeCurrency: {
    type: String,
    default: 'USD'
  },
  // Scheduling constraints
  advanceBookingDays: {
    type: Number,
    default: 30,
    min: [1, 'Advance booking must be at least 1 day'],
    max: [365, 'Advance booking cannot exceed 365 days']
  },
  minCancellationHours: {
    type: Number,
    default: 24,
    min: [0, 'Minimum cancellation cannot be negative']
  },
  // Availability settings
  availableDays: {
    type: [Number], // 0 = Sunday, 1 = Monday, etc.
    default: [1, 2, 3, 4, 5] // Monday to Friday
  },
  startTime: {
    type: String, // Format: "HH:MM"
    default: '09:00',
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Start time must be in HH:MM format'
    }
  },
  endTime: {
    type: String, // Format: "HH:MM"
    default: '17:00',
    validate: {
      validator: function(v) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'End time must be in HH:MM format'
    }
  },
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better performance
appointmentTypeSchema.index({ isActive: 1 });
appointmentTypeSchema.index({ name: 1 });
appointmentTypeSchema.index({ duration: 1 });
appointmentTypeSchema.index({ requiresApproval: 1 });

// Virtual for total time (duration + preparation + buffer)
appointmentTypeSchema.virtual('totalTime').get(function() {
  return this.duration + this.preparationTime + this.bufferTime;
});

// Virtual for formatted duration
appointmentTypeSchema.virtual('durationFormatted').get(function() {
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;
  
  if (hours === 0) {
    return `${minutes} min`;
  } else if (minutes === 0) {
    return `${hours} hr`;
  } else {
    return `${hours} hr ${minutes} min`;
  }
});

// Virtual for formatted total time
appointmentTypeSchema.virtual('totalTimeFormatted').get(function() {
  const totalMinutes = this.totalTime;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours === 0) {
    return `${minutes} min`;
  } else if (minutes === 0) {
    return `${hours} hr`;
  } else {
    return `${hours} hr ${minutes} min`;
  }
});

// Instance method to check if type is available on a specific day
appointmentTypeSchema.methods.isAvailableOnDay = function(dayIndex) {
  return this.availableDays.includes(dayIndex);
};

// Instance method to check if time is within available hours
appointmentTypeSchema.methods.isTimeAvailable = function(time) {
  const [startHour, startMinute] = this.startTime.split(':').map(Number);
  const [endHour, endMinute] = this.endTime.split(':').map(Number);
  const [checkHour, checkMinute] = time.split(':').map(Number);
  
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  const checkTotal = checkHour * 60 + checkMinute;
  
  return checkTotal >= startTotal && checkTotal <= endTotal;
};

// Static method to find active appointment types
appointmentTypeSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

// Static method to find types available for residents
appointmentTypeSchema.statics.findForResidents = function() {
  return this.find({ 
    isActive: true,
    allowedRoles: 'resident'
  }).sort({ name: 1 });
};

// Static method to increment usage count
appointmentTypeSchema.statics.incrementUsage = function(typeId) {
  return this.findByIdAndUpdate(
    typeId,
    { $inc: { usageCount: 1 } },
    { new: true }
  );
};

// Pre-save middleware to update lastModifiedBy
appointmentTypeSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.lastModifiedBy = this.createdBy; // In real app, this would be the current user
  }
  next();
});

// Ensure virtual fields are serialized
appointmentTypeSchema.set('toJSON', { virtuals: true });
appointmentTypeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AppointmentType', appointmentTypeSchema);