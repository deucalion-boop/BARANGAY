const { createSupabaseModel } = require('./supabaseModel');
module.exports = createSupabaseModel({ table: 'appointment_types', defaults: { description: '', color: '#4299e1', isActive: true }, relations: { createdBy: 'profiles', updatedBy: 'profiles', lastModifiedBy: 'profiles' } });
