const { createSupabaseModel } = require('./supabaseModel');

module.exports = createSupabaseModel({
  table: 'profiles',
  defaults: { address: '', avatarUrl: '', role: 'resident', isActive: false, loginCount: 0, profileCompleted: false, emailVerified: false },
  methods: {
    getFullName() { return `${this.firstName || ''} ${this.lastName || ''}`.trim(); },
    isAdmin() { return this.role === 'admin'; },
  },
  computed: { fullName() { return this.getFullName(); } },
});
