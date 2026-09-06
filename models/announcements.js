const { createSupabaseModel } = require('./supabaseModel');
module.exports = createSupabaseModel({ table: 'announcements', defaults: { imageUrl: null, type: 'general', priority: 'medium', isArchived: false, isActive: true, expiryDate: null, scheduleDate: null }, relations: { createdBy: 'profiles' } });
