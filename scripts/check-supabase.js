require('dotenv').config();
const { createSupabaseAdminClient } = require('../config/supabase');

const tables = [
  'profiles', 'appointment_types', 'appointments', 'announcements',
  'announcement_requests', 'resident_requests', 'schedule_requests',
  'inventory', 'notifications', 'app_settings',
];

async function check() {
  const client = createSupabaseAdminClient();
  const failures = [];

  for (const table of tables) {
    const { error } = await client.from(table).select('*', { head: true, count: 'exact' });
    if (error) failures.push(`${table}: ${error.message}`);
  }

  const { data: buckets, error: storageError } = await client.storage.listBuckets();
  if (storageError) failures.push(`Storage: ${storageError.message}`);
  else if (!(buckets || []).some((bucket) => bucket.id === 'portal-media')) failures.push('Storage: portal-media bucket is missing');

  if (failures.length) {
    console.error('Supabase setup is incomplete:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
    return;
  }

  console.log('Supabase schema, Auth access, and Storage bucket are ready.');
}

check().catch((error) => {
  console.error('Supabase check failed:', error.message);
  process.exitCode = 1;
});
