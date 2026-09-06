const { createSupabaseModel } = require('./supabaseModel');
module.exports = createSupabaseModel({ table: 'announcement_requests', defaults: { type: 'general', priority: 'medium', status: 'pending', targetAudience: ['all'], specificUnits: [], isUrgent: false }, relations: { requestedBy: 'profiles', reviewedBy: 'profiles', announcementId: 'announcements' } });
