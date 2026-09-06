const { createSupabaseModel } = require('./supabaseModel');
module.exports = createSupabaseModel({ table: 'appointments', defaults: { status: 'pending', notes: '' }, relations: { patientId: 'profiles', doctorId: 'profiles', createdBy: 'profiles' } });
