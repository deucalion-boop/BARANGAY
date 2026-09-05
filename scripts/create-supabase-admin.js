require('dotenv').config();

const { createSupabaseAdminClient } = require('../config/supabase');

async function findUserByEmail(client, email) {
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

async function createOrUpdateAdmin() {
  const email = process.env.SUPABASE_ADMIN_EMAIL?.trim().toLowerCase();
  const username = process.env.SUPABASE_ADMIN_USERNAME?.trim();
  const password = process.env.SUPABASE_ADMIN_PASSWORD;

  if (!email || !username || !password) {
    throw new Error(
      'SUPABASE_ADMIN_EMAIL, SUPABASE_ADMIN_USERNAME, and SUPABASE_ADMIN_PASSWORD are required.'
    );
  }

  if (password.length < 8) {
    throw new Error('SUPABASE_ADMIN_PASSWORD must be at least 8 characters long.');
  }

  const client = createSupabaseAdminClient();
  const existingUser = await findUserByEmail(client, email);
  const userMetadata = { username, role: 'admin' };
  const appMetadata = { role: 'admin' };

  if (existingUser) {
    const { error } = await client.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });
    if (error) throw error;
    console.log(`Updated Supabase Auth admin: ${email}`);
    return;
  }

  const { error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: appMetadata,
  });
  if (error) throw error;
  console.log(`Created Supabase Auth admin: ${email}`);
}

createOrUpdateAdmin().catch((error) => {
  console.error('Unable to provision Supabase admin:', error.message);
  process.exitCode = 1;
});

