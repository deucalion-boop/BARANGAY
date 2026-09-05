const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} is required. Add it to your .env file.`);
  }
  return value;
}

const authOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

function createSupabaseAuthClient() {
  return createClient(
    requireValue(supabaseUrl, 'SUPABASE_URL'),
    requireValue(publishableKey, 'SUPABASE_PUBLISHABLE_KEY'),
    authOptions
  );
}

function createSupabaseAdminClient() {
  return createClient(
    requireValue(supabaseUrl, 'SUPABASE_URL'),
    requireValue(secretKey, 'SUPABASE_SECRET_KEY'),
    authOptions
  );
}

module.exports = {
  createSupabaseAuthClient,
  createSupabaseAdminClient,
};

