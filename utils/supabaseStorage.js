const path = require('path');
const { createSupabaseAdminClient } = require('../config/supabase');

const BUCKET = 'portal-media';

function safeName(originalName) {
  const extension = path.extname(originalName || '').toLowerCase();
  const base = path.basename(originalName || 'file', extension).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'file';
  return `${Date.now()}-${base}${extension}`;
}

async function uploadPortalFile(folder, ownerId, file) {
  const objectPath = `${folder}/${ownerId}/${safeName(file.originalname)}`;
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(BUCKET).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return client.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

async function removePortalFile(publicUrl) {
  if (!publicUrl) return;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return;
  const objectPath = decodeURIComponent(publicUrl.slice(index + marker.length));
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(BUCKET).remove([objectPath]);
  if (error) throw error;
}

module.exports = { uploadPortalFile, removePortalFile };

