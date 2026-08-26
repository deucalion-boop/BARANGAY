const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['medication', 'medical-supplies', 'fluids', 'equipment', 'other']
  },
  location: {
    type: String,
    required: true,
    enum: ['pharmacy', 'pediatrics', 'surgery', 'emergency', 'storage']
  },
  currentStock: {
    type: Number,
    required: true,
    min: 0
  },
  reorderPoint: {
    type: Number,
    required: true,
    min: 0
  },
  expirationDate: {
    type: Date,
    default: null
  },
  supplier: {
    type: String,
    trim: true,
    default: ''
  },
  unitPrice: {
    type: Number,
    min: 0,
    default: 0
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['in-stock', 'low-stock', 'critical-stock', 'out-of-stock', 'expired'],
    default: 'in-stock'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for stock status calculation
inventorySchema.virtual('stockStatus').get(function() {
  if (this.currentStock === 0) return 'out-of-stock';
  if (this.currentStock <= this.reorderPoint * 0.5) return 'critical-stock';
  if (this.currentStock <= this.reorderPoint) return 'low-stock';
  return 'in-stock';
});

// Virtual for expiration status
inventorySchema.virtual('expirationStatus').get(function() {
  if (!this.expirationDate) return 'no-expiration';
  
  const now = new Date();
  const expDate = new Date(this.expirationDate);
  const daysUntilExpiry = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring-soon';
  return 'valid';
});

// Pre-save middleware to update status based on stock levels
inventorySchema.pre('save', function(next) {
  // Update status based on stock levels
  this.status = this.stockStatus;
  
  // Check expiration status
  if (this.expirationDate) {
    const now = new Date();
    const expDate = new Date(this.expirationDate);
    if (expDate < now) {
      this.status = 'expired';
    }
  }
  
  this.lastUpdated = new Date();
  next();
});

// Index for better query performance
inventorySchema.index({ itemId: 1 });
inventorySchema.index({ category: 1 });
inventorySchema.index({ location: 1 });
inventorySchema.index({ status: 1 });
inventorySchema.index({ expirationDate: 1 });
inventorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Inventory', inventorySchema);
