const { createSupabaseModel } = require('./supabaseModel');
module.exports = createSupabaseModel({
  table: 'inventory', defaults: { supplier: '', unitPrice: 0, description: '', status: 'in-stock', isActive: true }, relations: { createdBy: 'profiles' },
  computed: {
    stockStatus() {
      if (Number(this.currentStock) === 0) return 'out-of-stock';
      if (Number(this.currentStock) <= Number(this.reorderPoint) * 0.5) return 'critical-stock';
      if (Number(this.currentStock) <= Number(this.reorderPoint)) return 'low-stock';
      return 'in-stock';
    },
    expirationStatus() {
      if (!this.expirationDate) return 'no-expiration';
      const days = Math.ceil((new Date(this.expirationDate) - new Date()) / 86400000);
      if (days < 0) return 'expired';
      return days <= 30 ? 'expiring-soon' : 'valid';
    },
  },
});
