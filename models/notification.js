const { createSupabaseModel } = require('./supabaseModel');
module.exports = createSupabaseModel({ table: 'notifications', defaults: { type: 'general', isRead: false, priority: 'medium' }, relations: { userId: 'profiles' }, methods: { async markAsRead() { this.isRead = true; this.readAt = new Date(); return this.save(); } } });
