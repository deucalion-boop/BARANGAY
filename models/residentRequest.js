const { createSupabaseModel } = require('./supabaseModel');
module.exports = createSupabaseModel({ table: 'resident_requests', defaults: { status: 'pending' }, relations: { createdBy: 'profiles' } });
