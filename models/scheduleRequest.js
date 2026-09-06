const { createSupabaseModel } = require('./supabaseModel');
module.exports = createSupabaseModel({ table: 'schedule_requests', defaults: { status: 'pending', rescheduleStatus: 'pending' }, relations: { requester: 'profiles', adminId: 'profiles' } });
