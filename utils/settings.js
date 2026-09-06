const { createSupabaseAdminClient } = require('../config/supabase');

const defaults = {
  emailNotifications: true,
  scheduleExpiryDays: 3,
  allowUserRegistration: true,
  siteTagline: 'Serving Our Community',
  siteDescription: 'Welcome to our Barangay Health Center management system. We provide comprehensive healthcare services to our community.',
  language: 'en',
  emailVerboseLogging: false,
};

let cache = { ...defaults };
let loadPromise = null;

async function load() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const client = createSupabaseAdminClient();
      const { data, error } = await client.from('app_settings').select('key,value');
      if (error) throw error;
      for (const row of data || []) cache[row.key] = row.value;
    } catch (error) {
      console.warn('Unable to load Supabase settings; defaults are active:', error.message);
    }
    return { ...cache };
  })();
  return loadPromise;
}

function getAll() {
  return { ...cache };
}

function get(key, fallback = undefined) {
  return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
}

function set(key, value) {
  cache[key] = value;
  const client = createSupabaseAdminClient();
  client.from('app_settings').upsert({ key, value, updatedAt: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error(`Unable to save setting ${key}:`, error.message);
    });
}

async function save() {
  const client = createSupabaseAdminClient();
  const rows = Object.entries(cache).map(([key, value]) => ({ key, value, updatedAt: new Date().toISOString() }));
  const { error } = await client.from('app_settings').upsert(rows);
  if (error) throw error;
}

module.exports = { load, getAll, get, set, save };
